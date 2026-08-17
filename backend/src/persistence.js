import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';

// Netlify function /tmp is ephemeral: every instance recycle wipes the SQLite
// file. This module snapshots the DB to Netlify Blobs after mutating requests
// and restores it on cold start, so data and sessions survive recycles.
// Never imported (or effective) outside serverless, so local/desktop runs are
// unaffected.
//
// Reliability design (Tier 1 hardening):
//  - Two blob slots (current + previous) so a corrupt snapshot can be rolled back.
//  - Every snapshot passes PRAGMA integrity_check BEFORE it is uploaded; corrupt
//    bytes are never promoted to the live blob.
//  - Snapshots carry a monotonically increasing `seq` and are written with an
//    ETag compare-and-swap, so an older instance can never silently clobber a
//    newer snapshot (prevents last-write-wins split-brain at the blob layer).

const isServerless = !!(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
const BLOB_KEY = 'tmpcms.db';
const BLOB_PREV_KEY = 'tmpcms.db.prev';
const BLOB_STORE = 'lux-db';
const dbPath = path.join('/tmp', process.env.DB_FILENAME || 'tmpcms.db');

async function getStore() {
  const { getStore } = await import('@netlify/blobs');
  const opts = { name: BLOB_STORE, consistency: 'strong' };
  if (process.env.NETLIFY_BLOBS_SITE_ID && process.env.NETLIFY_BLOBS_TOKEN) {
    opts.siteID = process.env.NETLIFY_BLOBS_SITE_ID;
    opts.token = process.env.NETLIFY_BLOBS_TOKEN;
  }
  return getStore(opts);
}

// Validates a SQLite blob by writing it to a temp file and running integrity_check.
export function validateSqlite(buffer, label = 'snapshot') {
  const tmpPath = path.join(os.tmpdir(), `lux-verify-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  try {
    fs.writeFileSync(tmpPath, Buffer.from(buffer));
    const check = new Database(tmpPath, { readonly: true });
    try {
      const ok = check.pragma('integrity_check', { simple: true });
      if (ok !== 'ok') {
        console.warn(`validateSqlite: ${label} failed integrity_check -> ${ok}`);
        return false;
      }
      return true;
    } finally {
      check.close();
    }
  } catch (err) {
    console.warn(`validateSqlite: ${label} could not be validated -> ${err.message}`);
    return false;
  } finally {
    try { fs.rmSync(tmpPath, { force: true }); } catch {}
  }
}

let lastRestoredInfo = null;
let lastSnapshotStatus = { ok: true };

export async function restoreDbFromBlob() {
  if (!isServerless) return false;
  try {
    const store = await getStore();
    const latest = await store.get(BLOB_KEY, { type: 'arrayBuffer' });
    if (!latest || !latest.byteLength) return false;

    if (!validateSqlite(latest, 'current blob')) {
      const prev = await store.get(BLOB_PREV_KEY, { type: 'arrayBuffer' });
      if (prev && prev.byteLength && validateSqlite(prev, 'previous blob')) {
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        fs.writeFileSync(dbPath, Buffer.from(prev));
        lastRestoredInfo = { source: BLOB_PREV_KEY, at: new Date().toISOString() };
        console.warn('restoreDbFromBlob: current blob corrupt, restored from previous snapshot');
        return true;
      }
      console.warn('restoreDbFromBlob: both blobs failed validation — keeping local state');
      return false;
    }

    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(dbPath, Buffer.from(latest));
    const meta = await store.getMetadata(BLOB_KEY).catch(() => null);
    lastRestoredInfo = {
      source: BLOB_KEY,
      seq: meta && meta.metadata ? Number(meta.metadata.seq) || null : null,
      at: new Date().toISOString()
    };
    console.log('restoreDbFromBlob: restored database from Netlify Blobs');
    return true;
  } catch (err) {
    console.warn(`restoreDbFromBlob: no blob or restore failed -> ${err.message}`);
    return false;
  }
}

let snapshotChain = Promise.resolve();
const SNAPSHOT_TIMEOUT_MS = 8000;
// Cache of the last successfully uploaded snapshot bytes. Used to skip the
// prev-rotation blob read (we already have the previous "current" bytes in
// memory).
let lastUploaded = null;

// Netlify freezes the process shortly after the response is flushed, so
// background work never completes. The snapshot must therefore be awaited
// INSIDE the request lifecycle, before the response is sent.
//
// This is only invoked for mutating requests (see app.js). Every mutating
// request enqueues its OWN snapshot slot and awaits it before responding, so a
// write is never skipped — even in rapid succession or when another snapshot
// is already running. Snapshots are serialized on a chain; each run performs a
// wal_checkpoint so the main db file it reads includes that request's write.
export function snapshotDbNow() {
  if (!isServerless) return Promise.resolve();
  snapshotChain = snapshotChain
    .catch(() => {})
    .then(() => runSnapshot());
  return snapshotChain;
}

function writeBlobWithRetry(store, key, bytes, options, attempts = 2) {
  return Promise.race([
    (async () => {
      let lastErr = null;
      for (let i = 0; i < attempts; i++) {
        try {
          const result = await store.set(key, bytes, options);
          return result;
        } catch (err) {
          lastErr = err;
          await new Promise((r) => setTimeout(r, 250 * (i + 1)));
        }
      }
      throw lastErr;
    })(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('blob upload timed out')), SNAPSHOT_TIMEOUT_MS))
  ]);
}

async function runSnapshot() {
  try {
    const { default: db, dbPath: pathToDb } = await import('./db.js');
    db.pragma('wal_checkpoint(TRUNCATE)');
    const bytes = fs.readFileSync(pathToDb);

    // Never promote corrupt bytes to the live snapshot.
    if (!validateSqlite(bytes, 'snapshot')) {
      lastSnapshotStatus = { ok: false, reason: 'integrity_check_failed', at: new Date().toISOString() };
      console.warn('snapshotDb: local DB failed integrity_check — snapshot skipped, keeping last good blob');
      return;
    }

    const store = await getStore();
    const current = await store.getMetadata(BLOB_KEY).catch(() => null);
    const seq = (current && current.metadata && Number(current.metadata.seq)) || 0;

    // Rotate the previous snapshot to the previous slot. Use the bytes we last
    // uploaded (already in memory) instead of a blob read whenever possible.
    const prevBytes = lastUploaded && lastUploaded.bytes ? lastUploaded.bytes : await store.get(BLOB_KEY, { type: 'arrayBuffer' }).catch(() => null);
    if (prevBytes && prevBytes.byteLength) {
      await writeBlobWithRetry(store, BLOB_PREV_KEY, Buffer.from(prevBytes), {
        metadata: { saved_from: BLOB_KEY, seq, at: new Date().toISOString() }
      });
    }

    // CAS write: only succeed if we observed the current etag. If another
    // instance snapshot concurrently, this write returns modified:false and we
    // back off instead of clobbering the newer snapshot.
    const options = {
      metadata: { seq: seq + 1, at: new Date().toISOString(), bytes: bytes.length }
    };
    if (current && current.etag) options.onlyIfMatch = current.etag;

    const result = await writeBlobWithRetry(store, BLOB_KEY, bytes, options);
    if (result && result.modified === false) {
      lastSnapshotStatus = { ok: false, reason: 'concurrent_write_skipped', at: new Date().toISOString() };
      console.warn('snapshotDb: ETag mismatch — another instance wrote a newer snapshot; skipped');
      return;
    }

    lastUploaded = { bytes };
    lastSnapshotStatus = { ok: true, seq: seq + 1, bytes: bytes.length, at: new Date().toISOString() };
    console.log(`snapshotDb: uploaded ${bytes.length} bytes (seq ${seq + 1}) to Netlify Blobs`);
  } catch (err) {
    lastSnapshotStatus = { ok: false, reason: err.message, at: new Date().toISOString() };
    console.warn(`snapshotDb: snapshot failed -> ${err.message}`);
  }
}

export async function snapshotStatus() {
  if (!isServerless) return { enabled: false };
  return {
    enabled: true,
    last: lastSnapshotStatus,
    restored: lastRestoredInfo
  };
}