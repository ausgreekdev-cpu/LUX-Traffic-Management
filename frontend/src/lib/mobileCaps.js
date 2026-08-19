import { Capacitor } from '@capacitor/core';

// Thin abstraction over Capacitor native plugins with graceful web fallbacks,
// so Field mode works both as a native app (Capacitor) and in the browser/PWA.

export const isNative = () => typeof Capacitor !== 'undefined' && !!(Capacitor.getPlatform && Capacitor.getPlatform() !== 'web');

export async function capturePhoto() {
  if (isNative()) {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      quality: 90,
      allowEditing: false,
      width: 2400,
      height: 2400
    });
    return photo.dataUrl || null;
  }
  // Web/browser fallback: caller uses a file input with capture attribute.
  return null;
}

export async function getPosition() {
  if (isNative()) {
    const { Geolocation } = await import('@capacitor/geolocation');
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  }
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation unavailable'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => reject(new Error(err.message || 'Geolocation failed')),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

export function isOnline() {
  return typeof navigator !== 'undefined' && navigator.onLine;
}

export function onNetworkChange(cb) {
  if (isNative()) {
    import('@capacitor/network').then(({ Network }) => {
      Network.addListener('networkStatusChange', (s) => cb(s.connected)).then((h) => { h?.remove && h.remove(); });
    }).catch(() => {});
    return () => {};
  }
  const on = () => cb(true);
  const off = () => cb(false);
  window.addEventListener('online', on);
  window.addEventListener('offline', off);
  return () => {
    window.removeEventListener('online', on);
    window.removeEventListener('offline', off);
  };
}

async function storageDriver() {
  if (isNative()) {
    const { Preferences } = await import('@capacitor/preferences');
    return {
      async get(key) { const { value } = await Preferences.get({ key }); return value ?? null; },
      async set(key, value) { await Preferences.set({ key, value }); },
      async remove(key) { await Preferences.remove({ key }); }
    };
  }
  return {
    get: (key) => Promise.resolve(localStorage.getItem(key)),
    set: (key, value) => Promise.resolve(localStorage.setItem(key, value)),
    remove: (key) => Promise.resolve(localStorage.removeItem(key))
  };
}

export async function secureGet(key) {
  const d = await storageDriver();
  return d.get(key);
}

export async function secureSet(key, value) {
  const d = await storageDriver();
  return d.set(key, value);
}

export async function secureRemove(key) {
  const d = await storageDriver();
  return d.remove(key);
}