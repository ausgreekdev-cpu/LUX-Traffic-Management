// IndexedDB-backed offline cache + photo upload queue for Field mode.
// Gated by mobile_offline entitlement (pro/agency true, starter false = read-only mobile).
let _entCache = null;
let _entCacheAt = 0;
const ENT_TTL_MS = 5 * 60 * 1000;

async function hasMobileOffline() {
  const now = Date.now();
  if (_entCache !== null && now - _entCacheAt < ENT_TTL_MS) return _entCache;
  try {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) { _entCache = false; _entCacheAt = now; return false; }
    const res = await fetch('/api/billing/entitlements', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { _entCache = false; _entCacheAt = now; return false; }
    const data = await res.json();
    _entCache = !!data?.features?.mobile_offline;
    _entCacheAt = now;
    return _entCache;
  } catch {
    _entCache = false; _entCacheAt = now; return false;
  }
}

export async function isMobileOfflineAllowed() {
  return hasMobileOffline();
}
export function clearEntitlementCache() { _entCache = null; _entCacheAt = 0; }

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
  // Gate offline cache writes behind mobile_offline — starter is read-only mobile
  if (!(await hasMobileOffline())) return;
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
  if (!(await hasMobileOffline())) throw new Error('Offline queue requires Pro plan (mobile_offline). Upgrade at /billing.');
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