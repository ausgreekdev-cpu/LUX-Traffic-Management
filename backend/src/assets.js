import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db, { isServerless } from './db.js';

// Branding asset storage. On local/desktop runs files live on disk under the
// data dir; on Netlify the filesystem is read-only at runtime, so uploads go to
// a durable Netlify Blobs store (mirroring the DB snapshot pattern in
// persistence.js).
const moduleDir = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const LOCAL_DIR = process.env.BRANDING_ASSETS_DIR || path.resolve(moduleDir, '../data/branding-assets');
const BLOB_STORE = 'lux-assets';

const assetBlobKey = (domain, slot) => (domain ? `assets/${domain}/${slot}` : `assets/${slot}`);

const normalizeDomain = (domain) => (domain ? String(domain).trim().toLowerCase() : '');

async function getBlobStore() {
  const { getStore } = await import('@netlify/blobs');
  const opts = { name: BLOB_STORE, consistency: 'strong' };
  if (process.env.NETLIFY_BLOBS_SITE_ID && process.env.NETLIFY_BLOBS_TOKEN) {
    opts.siteID = process.env.NETLIFY_BLOBS_SITE_ID;
    opts.token = process.env.NETLIFY_BLOBS_TOKEN;
  }
  return getStore(opts);
}

export async function saveAsset(slot, buffer, mimeType, domain = '') {
  const d = normalizeDomain(domain);
  if (isServerless) {
    const store = await getBlobStore();
    await store.set(assetBlobKey(d, slot), buffer, { metadata: { mimeType, at: new Date().toISOString() } });
  } else {
    const dir = d ? path.join(LOCAL_DIR, d) : LOCAL_DIR;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, slot), buffer);
  }
}

export async function loadAsset(slot, domain = '') {
  const d = normalizeDomain(domain);
  const meta = db.prepare('SELECT blob_key, mime_type FROM branding_assets WHERE domain = ? AND slot = ?').get(d, slot);
  if (!meta) return null;
  if (isServerless) {
    const store = await getBlobStore();
    const buf = await store.get(assetBlobKey(d, slot), { type: 'arrayBuffer' }).catch(() => null);
    return buf && buf.byteLength ? Buffer.from(buf) : null;
  }
  const p = path.join(LOCAL_DIR, d, slot);
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
}

export async function deleteAsset(slot, domain = '') {
  const d = normalizeDomain(domain);
  if (isServerless) {
    const store = await getBlobStore();
    await store.delete(assetBlobKey(d, slot)).catch(() => {});
  } else {
    try { fs.rmSync(path.join(LOCAL_DIR, d, slot), { force: true }); } catch {}
  }
}

export function assetMimeType(slot, domain = '') {
  const d = normalizeDomain(domain);
  const meta = db.prepare('SELECT mime_type FROM branding_assets WHERE domain = ? AND slot = ?').get(d, slot);
  return meta ? meta.mime_type : null;
}
