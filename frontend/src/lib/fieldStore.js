// IndexedDB-backed offline cache + photo upload queue for Field mode.

const DB_NAME = 'lux-field';
const DB_VERSION = 1;
const CACHE_STORE = 'cache';
const QUEUE_STORE = 'uploads';

let _dbPromise = null;

function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

async function tx(store, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const result = fn(s);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
  });
}

export async function cacheSet(key, value) {
  try {
    await tx(CACHE_STORE, 'readwrite', (s) => s.put({ key, value }));
  } catch { /* offline cache is best-effort */ }
}

export async function cacheGet(key) {
  try {
    const row = await tx(CACHE_STORE, 'readonly', (s) => s.get(key));
    return row ? row.value : null;
  } catch {
    return null;
  }
}

export async function cacheClear() {
  try {
    await tx(CACHE_STORE, 'readwrite', (s) => s.clear());
  } catch { /* ignore */ }
}

export async function queueUpload(item) {
  await tx(QUEUE_STORE, 'readwrite', (s) => s.put(item));
}

export async function getQueue() {
  try {
    return await tx(QUEUE_STORE, 'readonly', (s) => s.getAll());
  } catch {
    return [];
  }
}

export async function removeFromQueue(id) {
  await tx(QUEUE_STORE, 'readwrite', (s) => s.delete(id));
}

export async function getQueueStats() {
  const q = await getQueue();
  return { pending: q.length };
}