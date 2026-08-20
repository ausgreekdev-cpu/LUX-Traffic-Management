import React from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App';
import { BrandingProvider } from './context/Branding';
import './index.css';

// Native (Capacitor) shell: the SPA is served from a local scheme, so API calls
// must target a deployed origin. Candidates are probed in order and the first
// one that answers /api/ping wins, so the app stays usable when the primary
// hostname is unreachable. Setting localStorage 'lux_api_base' pins an origin
// explicitly (e.g. to point the app at a staging deploy) and skips probing.
const API_ORIGINS = [
  'https://lux-official.netlify.app',
  'https://main--lux-official.netlify.app'
];

const RESOLVED_KEY = 'lux_api_base_resolved';
const PROBE_TIMEOUT_MS = 4000;

async function reachable(origin) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${origin}/api/ping`, { cache: 'no-store', signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveApiOrigin() {
  const pinned = localStorage.getItem('lux_api_base');
  if (pinned) return pinned;

  // Try whatever worked last launch first, so a cold start against a flaky
  // primary does not pay the full probe cost every time.
  const remembered = localStorage.getItem(RESOLVED_KEY);

  // Offline launch is normal for a field app. Probing would just burn the
  // timeout on every candidate behind a blank screen, so take the last known
  // good origin and let the offline queue retry against it later.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return remembered || API_ORIGINS[0];
  }

  const candidates = remembered
    ? [remembered, ...API_ORIGINS.filter((o) => o !== remembered)]
    : API_ORIGINS;

  for (const origin of candidates) {
    if (await reachable(origin)) {
      localStorage.setItem(RESOLVED_KEY, origin);
      return origin;
    }
  }

  // Everything failed — offline, most likely. Hand back the last known good
  // origin so the offline upload queue still has a sane base to retry against.
  return remembered || API_ORIGINS[0];
}

async function bootstrap() {
  if (typeof Capacitor !== 'undefined' && Capacitor.getPlatform && Capacitor.getPlatform() !== 'web') {
    window.__LUX_API_BASE__ = await resolveApiOrigin();
  }

  // App owns routing via createBrowserRouter + RouterProvider, so no outer
  // Router wrapper is needed here (a <BrowserRouter> around it would make the
  // data router's internal <Router> throw "cannot render inside another Router").
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <BrandingProvider>
        <App />
      </BrandingProvider>
    </React.StrictMode>
  );
}

bootstrap();
