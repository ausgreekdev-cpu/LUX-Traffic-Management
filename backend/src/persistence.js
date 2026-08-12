import fs from 'fs';
import path from 'path';

// Netlify function /tmp is ephemeral: every instance recycle wipes the SQLite
// file. This module snapshots the DB to Netlify Blobs after mutating requests
// and restores it on cold start, so data and sessions survive recycles.
// Never imported (or effective) outside serverless, so local/desktop runs are
// unaffected.

const isServerless = !!(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
const BLOB_KEY = 'tmpcms.db';
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

export async function restoreDbFromBlob() {
  if (!isServerless) return false;
  try {
    const store = await getStore();
    const data = await store.get(BLOB_KEY, { type: 'arrayBuffer' });
    if (!data || !data.byteLength) return false;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(dbPath, Buffer.from(data));
    console.log('restoreDbFromBlob: restored database from Netlify Blobs');
    return true;
  } catch (err) {
    console.warn(`restoreDbFromBlob: no blob or restore failed -> ${err.message}`);
    return false;
  }
}

let lastSnapshot = 0;
let snapshotInFlight = null;
const SNAPSHOT_MIN_INTERVAL_MS = 20000;
const SNAPSHOT_TIMEOUT_MS = 8000;

// Netlify freezes the process shortly after the response is flushed, so
// background work never completes. The snapshot must therefore be awaited
// INSIDE the request lifecycle, before the response is sent.
export function snapshotDbNow() {
  if (!isServerless) return Promise.resolve();
  const now = Date.now();
  if (now - lastSnapshot < SNAPSHOT_MIN_INTERVAL_MS) return Promise.resolve();
  if (snapshotInFlight) return snapshotInFlight;
  snapshotInFlight = runSnapshot().finally(() => { snapshotInFlight = null; });
  return snapshotInFlight;
}

async function runSnapshot() {
  try {
    const { default: db, dbPath: pathToDb } = await import('./db.js');
    db.pragma('wal_checkpoint(TRUNCATE)');
    const bytes = fs.readFileSync(pathToDb);
    const store = await getStore();
    await Promise.race([
      store.set(BLOB_KEY, bytes),
      new Promise((_, reject) => setTimeout(() => reject(new Error('blob upload timed out')), SNAPSHOT_TIMEOUT_MS))
    ]);
    lastSnapshot = Date.now();
    console.log(`snapshotDb: uploaded ${bytes.length} bytes to Netlify Blobs`);
  } catch (err) {
    console.warn(`snapshotDb: snapshot failed -> ${err.message}`);
  }
}