import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isServerless } from './db.js';

// Durable media storage for site photos. On local/desktop runs files live on
// disk under the data dir; on Netlify the filesystem is read-only at runtime,
// so uploads go to a durable Netlify Blobs store (same pattern as assets.js).
const moduleDir = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const LOCAL_DIR = process.env.MEDIA_DIR || path.resolve(moduleDir, '../data/media');
const BLOB_STORE = 'lux-media';

const blobKey = (id, ext) => `media/${id}${ext}`;

// Local media directory (used by telemetry for storage accounting). On
// serverless the media lives in Blobs, so this returns null there.
export function dataDir() {
  return isServerless ? null : LOCAL_DIR;
}

async function getBlobStore() {
  const { getStore } = await import('@netlify/blobs');
  const opts = { name: BLOB_STORE, consistency: 'strong' };
  if (process.env.NETLIFY_BLOBS_SITE_ID && process.env.NETLIFY_BLOBS_TOKEN) {
    opts.siteID = process.env.NETLIFY_BLOBS_SITE_ID;
    opts.token = process.env.NETLIFY_BLOBS_TOKEN;
  }
  return getStore(opts);
}

export async function saveMedia(id, ext, buffer, meta = {}) {
  const key = blobKey(id, ext);
  if (isServerless) {
    const store = await getBlobStore();
    await store.set(key, buffer, { metadata: { ...meta, at: new Date().toISOString() } });
  } else {
    fs.mkdirSync(LOCAL_DIR, { recursive: true });
    fs.writeFileSync(path.join(LOCAL_DIR, path.basename(key)), buffer);
  }
  return key;
}

export async function loadMedia(key) {
  if (isServerless) {
    const store = await getBlobStore();
    const buf = await store.get(key, { type: 'arrayBuffer' }).catch(() => null);
    return buf && buf.byteLength ? Buffer.from(buf) : null;
  }
  const p = path.join(LOCAL_DIR, path.basename(key));
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
}

export async function deleteMedia(key) {
  if (isServerless) {
    const store = await getBlobStore();
    await store.delete(key).catch(() => {});
  } else {
    try { fs.rmSync(path.join(LOCAL_DIR, path.basename(key)), { force: true }); } catch {}
  }
}