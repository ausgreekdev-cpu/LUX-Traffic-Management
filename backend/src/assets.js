import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db, { isServerless } from './db.js';

// Branding asset storage. On local/desktop runs files live on disk under the
// data dir; on Netlify the filesystem is read-only at runtime, so uploads go to
// a durable Netlify Blobs store (mirroring the DB snapshot pattern in
// persistence.js).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_DIR = process.env.BRANDING_ASSETS_DIR || path.resolve(__dirname, '../data/branding-assets');
const BLOB_STORE = 'lux-assets';

const assetBlobKey = (slot) => `assets/${slot}`;

async function getBlobStore() {
  const { getStore } = await import('@netlify/blobs');
  const opts = { name: BLOB_STORE, consistency: 'strong' };
  if (process.env.NETLIFY_BLOBS_SITE_ID && process.env.NETLIFY_BLOBS_TOKEN) {
    opts.siteID = process.env.NETLIFY_BLOBS_SITE_ID;
    opts.token = process.env.NETLIFY_BLOBS_TOKEN;
  }
  return getStore(opts);
}

export async function saveAsset(slot, buffer, mimeType) {
  if (isServerless) {
    const store = await getBlobStore();
    await store.set(assetBlobKey(slot), buffer, { metadata: { mimeType, at: new Date().toISOString() } });
  } else {
    fs.mkdirSync(LOCAL_DIR, { recursive: true });
    fs.writeFileSync(path.join(LOCAL_DIR, slot), buffer);
  }
}

export async function loadAsset(slot) {
  const meta = db.prepare('SELECT blob_key, mime_type FROM branding_assets WHERE slot = ?').get(slot);
  if (!meta) return null;
  if (isServerless) {
    const store = await getBlobStore();
    const buf = await store.get(assetBlobKey(slot), { type: 'arrayBuffer' }).catch(() => null);
    return buf && buf.byteLength ? Buffer.from(buf) : null;
  }
  const p = path.join(LOCAL_DIR, slot);
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
}

export async function deleteAsset(slot) {
  if (isServerless) {
    const store = await getBlobStore();
    await store.delete(assetBlobKey(slot)).catch(() => {});
  } else {
    try { fs.rmSync(path.join(LOCAL_DIR, slot), { force: true }); } catch {}
  }
}

export function assetMimeType(slot) {
  const meta = db.prepare('SELECT mime_type FROM branding_assets WHERE slot = ?').get(slot);
  return meta ? meta.mime_type : null;
}
