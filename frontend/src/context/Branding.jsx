import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api';

// The Branding engine injects the white-label theme (CSS variables, fonts,
// override styles, favicon, theme-colour and dark-mode class) at boot — before
// auth — so even the login page and app shell are branded.
const BrandContext = createContext(null);

const DEFAULT_FONT_UI = "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif";

function upsertMeta(name, content) {
  let meta = document.querySelector(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', name);
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', content);
}

function upsertFavicon(href) {
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'icon');
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
}

function setStyle(id, css) {
  let el = document.getElementById(id);
  if (css) {
    if (!el) {
      el = document.createElement('style');
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent = css;
  } else if (el) {
    el.remove();
  }
}

function injectFonts(fonts) {
  if (!fonts) return;
  const css = Object.values(fonts).filter(Boolean).map((f) =>
    `@font-face { font-family: '${f.family}'; src: url('${f.url}') format('${f.format === 'ttf' ? 'truetype' : 'woff2'}'); font-display: swap; }`
  ).join('\n');
  setStyle('lux-brand-fonts', css);
}

// Apply a summary (or a draft) to the live document.
export function applyBranding(summary) {
  if (!summary) return;
  const root = document.documentElement;

  for (const [key, value] of Object.entries(summary.cssVars || {})) {
    root.style.setProperty(key, value);
  }
  const uiFont = summary.fonts?.ui;
  root.style.setProperty('--font-ui', uiFont ? `'${uiFont.family}', ${DEFAULT_FONT_UI}` : DEFAULT_FONT_UI);
  if (summary.fonts?.map) root.style.setProperty('--font-map', `'${summary.fonts.map.family}', sans-serif`);

  injectFonts(summary.fonts);
  setStyle('lux-brand-css', summary.css_override || '');

  if (summary.themeColor) upsertMeta('theme-color', summary.themeColor);
  if (summary.assets?.favicon) upsertFavicon(summary.assets.favicon);
  if (summary.assets?.logoDark || summary.assets?.logoLight) {
    root.style.setProperty('--brand-logo-dark', summary.assets.logoDark || 'none');
    root.style.setProperty('--brand-logo-light', summary.assets.logoLight || 'none');
  }

  if (summary.theme === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState(null);

  const refresh = () => api.branding.public()
    .then((summary) => {
      setBranding(summary);
      applyBranding(summary);
      return summary;
    })
    .catch(() => {});

  useEffect(() => { refresh(); }, []);

  const applyDraft = (draft) => {
    const base = branding || {};
    applyBranding({
      cssVars: { ...(base.cssVars || {}), ...(draft.cssVars || {}) },
      fonts: draft.fonts || base.fonts,
      css_override: draft.css_override !== undefined ? draft.css_override : base.css_override,
      themeColor: draft.themeColor || base.themeColor,
      theme: draft.theme !== undefined ? draft.theme : base.theme
    });
  };

  const resetToServer = () => { if (branding) applyBranding(branding); };

  return (
    <BrandContext.Provider value={{ branding, refresh, applyDraft, resetToServer }}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandContext);
}
