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
  return getStore({ name: BLOB_STORE, consistency: 'strong' });
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
let snapshotQueued = false;
const SNAPSHOT_MIN_INTERVAL_MS = 20000;

export function snapshotDbNow() {
  if (!isServerless) return;
  const now = Date.now();
  if (now - lastSnapshot < SNAPSHOT_MIN_INTERVAL_MS || snapshotQueued) return;
  snapshotQueued = true;
  setTimeout(async () => {
    snapshotQueued = false;
    lastSnapshot = Date.now();
    try {
      const { default: db, dbPath: pathToDb } = await import('./db.js');
      db.pragma('wal_checkpoint(TRUNCATE)');
      const bytes = fs.readFileSync(pathToDb);
      const store = await getStore();
      await store.set(BLOB_KEY, bytes);
      console.log(`snapshotDb: uploaded ${bytes.length} bytes to Netlify Blobs`);
    } catch (err) {
      console.warn(`snapshotDb: snapshot failed -> ${err.message}`);
    }
  }, 2000);
}