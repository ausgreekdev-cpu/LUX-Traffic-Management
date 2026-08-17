import db from './db.js';

// Branding & white-labeling engine: defaults, colour math (ramp generation,
// WCAG contrast), validation and the computed theme delivered to the browser at
// boot via the public GET /api/branding endpoint.

const getSetting = (key) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : '';
};

export const parseJson = (str, fallback) => {
  if (str === null || str === undefined || str === '') return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
};

// The existing LUX orange ramp — the default brand. Byte-for-byte identical to
// the old static tailwind palette so the out-of-the-box UI is unchanged.
export const DEFAULT_RAMP = {
  50: '#fef3e2', 100: '#fde4b9', 200: '#fcd48c', 300: '#fbc35f', 400: '#f9a825',
  500: '#f57f17', 600: '#e65100', 700: '#bf360c', 800: '#8b2500', 900: '#4e1600'
};

export const THEME_DEFAULTS = {
  primary: '#f57f17',
  secondary: '#0f766e',
  accent: '#2563eb',
  wip_warn: '#fbbf24',
  wip_alert: '#f87171',
  emergency: '#ef4444'
};

const SYSTEM_STATE_KEYS = ['wip_warn', 'wip_alert', 'emergency'];

export const DEFAULT_WATERMARK = {
  mode: 'off',
  text: 'FOR PERMIT ONLY',
  status_text: { draft: 'DRAFT', submitted: 'PENDING APPROVAL', approved: 'APPROVED', rejected: 'REJECTED', expired: 'EXPIRED', cancelled: 'CANCELLED', completed: 'COMPLETED' },
  fontSize: 56,
  opacity: 0.14,
  color: '#cccccc'
};

export const DEFAULT_PDF_LAYOUT = { header: [], footer: [] };
export const DEFAULT_EMAIL = { enabled: false, from_name: '', from_email: '', accent: '#f57f17', footer: '' };
export const DEFAULT_TYPOGRAPHY = { ui: null, map: null };

// ---------------------------------------------------------------- colour math

const clamp = (n, lo = 0, hi = 255) => Math.max(lo, Math.min(hi, Math.round(n)));

export function hexToRgb(hex) {
  let h = String(hex || '').trim().replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

function rgbToHex({ r, g, b }) {
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
}

function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  let h = 0; let s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: clamp(f(0) * 255), g: clamp(f(8) * 255), b: clamp(f(4) * 255) };
}

// Generate a Tailwind-style 50..900 ramp from a single brand colour.
export function generateRamp(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return { ...DEFAULT_RAMP };
  const { h, s } = rgbToHsl(rgb);
  const steps = {
    50: [0.5, 96], 100: [0.68, 91], 200: [0.82, 84], 300: [0.92, 74],
    400: [1, 64], 500: [1, 50], 600: [1, 42], 700: [1, 33], 800: [1, 25], 900: [1, 17]
  };
  const ramp = {};
  for (const [step, [sat, light]] of Object.entries(steps)) {
    ramp[step] = rgbToHex(hslToRgb(h, s * sat, light));
  }
  return ramp;
}

export function relativeLuminance(rgb) {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(rgb.r) + 0.7152 * f(rgb.g) + 0.0722 * f(rgb.b);
}

export function contrastRatio(rgb1, rgb2) {
  const l1 = relativeLuminance(rgb1); const l2 = relativeLuminance(rgb2);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// Choose black or white text for a given background, preferring AA (4.5:1).
export function pickTextColor(rgb) {
  const white = contrastRatio(rgb, { r: 255, g: 255, b: 255 });
  const black = contrastRatio(rgb, { r: 0, g: 0, b: 0 });
  return white >= black ? '#ffffff' : '#000000';
}

// -------------------------------------------------------------- theme compute

function normalizeTheme(input) {
  const base = { ...THEME_DEFAULTS, ...(input || {}) };
  const out = {};
  for (const key of ['primary', 'secondary', 'accent', ...SYSTEM_STATE_KEYS]) {
    const hex = String(base[key] || '').trim();
    out[key] = hexToRgb(hex) ? hex : THEME_DEFAULTS[key];
  }
  out.ramp = {};
  const rampInput = base.ramp && typeof base.ramp === 'object' ? base.ramp : {};
  for (const step of Object.keys(DEFAULT_RAMP)) {
    const v = rampInput[step];
    out.ramp[step] = v && hexToRgb(v) ? String(v).trim() : generateRamp(out.primary)[step];
  }
  return out;
}

export function computeTheme(themeJson) {
  const t = normalizeTheme(themeJson);
  const vars = {};
  for (const step of Object.keys(t.ramp)) {
    const { r, g, b } = hexToRgb(t.ramp[step]);
    vars[`--lux-${step}`] = `${r} ${g} ${b}`;
  }
  const define = (name, hex) => {
    const rgb = hexToRgb(hex);
    vars[name] = hex;
    vars[`${name}-contrast`] = pickTextColor(rgb);
  };
  define('--brand-primary', t.primary);
  define('--brand-secondary', t.secondary);
  define('--brand-accent', t.accent);
  for (const key of SYSTEM_STATE_KEYS) {
    define(`--system-${key}`, t[key]);
  }
  return { vars, hex: t, ramp: t.ramp, themeColor: t.primary };
}

export function computeAudit(themeJson) {
  const t = normalizeTheme(themeJson);
  const audit = [];
  const check = (label, bgHex) => {
    const rgb = hexToRgb(bgHex);
    const white = contrastRatio(rgb, { r: 255, g: 255, b: 255 });
    const black = contrastRatio(rgb, { r: 0, g: 0, b: 0 });
    audit.push({ label, bg: bgHex, white: Number(white.toFixed(2)), black: Number(black.toFixed(2)), whiteAA: white >= 4.5, blackAA: black >= 4.5 });
  };
  check('Primary', t.primary);
  check('Secondary', t.secondary);
  check('Accent', t.accent);
  for (const key of SYSTEM_STATE_KEYS) check(key, t[key]);
  for (const step of Object.keys(t.ramp)) check(`Ramp ${step}`, t.ramp[step]);
  return audit;
}

// ------------------------------------------------------------------- storage

export const normalizeDomain = (domain) => (domain ? String(domain).trim().toLowerCase() : '');

// Resolve the brand scope for a request's Host header. Returns '' (the global
// brand) unless a dedicated branding row exists for that exact host.
export function resolveBrandDomain(host) {
  if (!host) return '';
  const h = String(host).split(':')[0].trim().toLowerCase();
  return db.prepare('SELECT domain FROM branding WHERE domain = ?').get(h) ? h : '';
}

export function getBrandingRow(domain = '') {
  const d = normalizeDomain(domain);
  const row = db.prepare('SELECT * FROM branding WHERE domain = ?').get(d);
  if (!row) return null;
  return {
    domain: row.domain || '',
    theme: parseJson(row.theme_json, {}),
    typography: parseJson(row.typography_json, DEFAULT_TYPOGRAPHY),
    pdf_layout: parseJson(row.pdf_layout_json, DEFAULT_PDF_LAYOUT),
    watermark: parseJson(row.watermark_json, DEFAULT_WATERMARK),
    email: parseJson(row.email_json, DEFAULT_EMAIL),
    css_override: row.css_override || '',
    css_version: row.css_version || 0,
    updated_by: row.updated_by,
    updated_at: row.updated_at
  };
}

export function saveBrandingRow(updates, userId, domain = '') {
  const d = normalizeDomain(domain);
  const current = getBrandingRow(d) || {};
  const next = {
    domain: d,
    theme_json: JSON.stringify(updates.theme !== undefined ? updates.theme : current.theme || {}),
    typography_json: JSON.stringify(updates.typography !== undefined ? updates.typography : current.typography || {}),
    pdf_layout_json: JSON.stringify(updates.pdf_layout !== undefined ? updates.pdf_layout : current.pdf_layout || {}),
    watermark_json: JSON.stringify(updates.watermark !== undefined ? updates.watermark : current.watermark || {}),
    email_json: JSON.stringify(updates.email !== undefined ? updates.email : current.email || {}),
    css_override: updates.css_override !== undefined ? String(updates.css_override) : current.css_override || '',
    css_version: (current.css_version || 0) + 1,
    updated_by: userId || null,
    updated_at: new Date().toISOString()
  };
  db.prepare(`
    INSERT INTO branding (domain, theme_json, typography_json, pdf_layout_json, watermark_json, email_json, css_override, css_version, updated_by, updated_at)
    VALUES (@domain, @theme_json, @typography_json, @pdf_layout_json, @watermark_json, @email_json, @css_override, @css_version, @updated_by, @updated_at)
    ON CONFLICT(domain) DO UPDATE SET
      theme_json = excluded.theme_json, typography_json = excluded.typography_json,
      pdf_layout_json = excluded.pdf_layout_json, watermark_json = excluded.watermark_json,
      email_json = excluded.email_json, css_override = excluded.css_override,
      css_version = excluded.css_version, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  `).run(next);
  return next.css_version;
}

export function snapshotBranding(label, userId, domain = '') {
  const d = normalizeDomain(domain);
  const row = db.prepare('SELECT theme_json, typography_json, pdf_layout_json, watermark_json, email_json, css_override, css_version FROM branding WHERE domain = ?').get(d);
  if (!row) return null;
  return db.prepare('INSERT INTO branding_versions (label, snapshot_json, created_by, domain) VALUES (?, ?, ?, ?)')
    .run(label || `Snapshot ${row.css_version}`, JSON.stringify(row), userId || null, d).lastInsertRowid;
}

export function listVersions(limit = 25, domain = '') {
  const d = normalizeDomain(domain);
  return db.prepare('SELECT id, label, created_by, created_at FROM branding_versions WHERE domain = ? ORDER BY id DESC LIMIT ?').all(d, limit);
}

export function restoreVersion(id, userId) {
  const v = db.prepare('SELECT snapshot_json, domain FROM branding_versions WHERE id = ?').get(id);
  if (!v) return false;
  const snap = parseJson(v.snapshot_json, null);
  if (!snap) return false;
  const d = v.domain || '';
  snapshotBranding('Before restore', userId, d);
  const css_version = (snap.css_version || 0) + 1;
  db.prepare(`
    INSERT INTO branding (domain, theme_json, typography_json, pdf_layout_json, watermark_json, email_json, css_override, css_version, updated_by, updated_at)
    VALUES (@domain, @theme_json, @typography_json, @pdf_layout_json, @watermark_json, @email_json, @css_override, @css_version, @updated_by, @updated_at)
    ON CONFLICT(domain) DO UPDATE SET
      theme_json = excluded.theme_json, typography_json = excluded.typography_json,
      pdf_layout_json = excluded.pdf_layout_json, watermark_json = excluded.watermark_json,
      email_json = excluded.email_json, css_override = excluded.css_override,
      css_version = excluded.css_version, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  `).run({
    domain: d,
    theme_json: snap.theme_json, typography_json: snap.typography_json,
    pdf_layout_json: snap.pdf_layout_json, watermark_json: snap.watermark_json,
    email_json: snap.email_json, css_override: snap.css_override,
    css_version, updated_by: userId || null, updated_at: new Date().toISOString()
  });
  return { ok: true, domain: d };
}

export function resetBranding(userId, domain = '') {
  const d = normalizeDomain(domain);
  snapshotBranding('Before reset', userId, d);
  db.prepare(`
    INSERT INTO branding (domain, theme_json, typography_json, pdf_layout_json, watermark_json, email_json, css_override, css_version, updated_by, updated_at)
    VALUES (@domain, '{}', '{}', '{}', '{}', '{}', '', @css_version, @updated_by, @updated_at)
    ON CONFLICT(domain) DO UPDATE SET
      theme_json = excluded.theme_json, typography_json = excluded.typography_json,
      pdf_layout_json = excluded.pdf_layout_json, watermark_json = excluded.watermark_json,
      email_json = excluded.email_json, css_override = excluded.css_override,
      css_version = excluded.css_version, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  `).run({ domain: d, css_version: (getBrandingRow(d)?.css_version || 0) + 1, updated_by: userId || null, updated_at: new Date().toISOString() });
}

// ----------------------------------------------------------------- public API

// Pick an asset slot for a domain brand: prefer a domain-scoped asset, fall
// back to the global asset, then null. URLs carry ?domain= only for
// domain-scoped assets so the asset endpoint resolves deterministically.
export function getPublicSummary(domain = '') {
  const d = normalizeDomain(domain);
  const br = getBrandingRow(d) || {};
  const theme = computeTheme(br.theme);
  const domainAssets = d ? db.prepare('SELECT slot, mime_type, size FROM branding_assets WHERE domain = ?').all(d) : [];
  const globalAssets = db.prepare("SELECT slot, mime_type, size FROM branding_assets WHERE domain = ''").all();
  const has = (slot, list) => list.some(a => a.slot === slot);
  const pick = (slot) => {
    if (has(slot, domainAssets)) return `/api/branding/assets/${slot}?domain=${encodeURIComponent(d)}`;
    if (has(slot, globalAssets)) return `/api/branding/assets/${slot}`;
    return null;
  };
  const fontFace = (slot) => {
    const font = br.typography && br.typography[slot];
    if (!font || !font.src) return null;
    return { family: font.family || 'Brand Font', url: pick(font.src), format: font.format || 'woff2' };
  };
  return {
    cssVars: theme.vars,
    themeColor: theme.themeColor,
    appName: getSetting('app_name') || 'LUX Traffic Management',
    loginSubtitle: getSetting('login_subtitle') || '',
    theme: getSetting('theme') || 'light',
    css_override: br.css_override || '',
    css_version: br.css_version || 0,
    assets: {
      logoLight: pick('logo_light'),
      logoDark: pick('logo_dark'),
      favicon: pick('favicon'),
      seal: pick('seal')
    },
    fonts: { ui: fontFace('ui'), map: fontFace('map') }
  };
}

export function getFullBranding(domain = '') {
  const d = normalizeDomain(domain);
  const br = getBrandingRow(d) || {};
  const assets = db.prepare('SELECT slot, mime_type, size, width, height, updated_at FROM branding_assets WHERE domain = ? ORDER BY slot').all(d);
  return {
    ...br,
    theme: normalizeTheme(br.theme),
    typography: br.typography || DEFAULT_TYPOGRAPHY,
    pdf_layout: br.pdf_layout || DEFAULT_PDF_LAYOUT,
    watermark: br.watermark || DEFAULT_WATERMARK,
    email: br.email || DEFAULT_EMAIL,
    assets,
    versions: listVersions(25, d),
    domains: db.prepare('SELECT * FROM domain_map ORDER BY id').all()
  };
}

// ----------------------------------------------------------------- validation

export function validateBrandingInput(body) {
  const errors = [];
  const out = {};
  if (body.theme !== undefined) {
    if (typeof body.theme !== 'object' || Array.isArray(body.theme)) errors.push('theme must be an object');
    else out.theme = normalizeTheme(body.theme);
  }
  if (body.typography !== undefined) {
    if (typeof body.typography !== 'object') errors.push('typography must be an object');
    else out.typography = body.typography;
  }
  if (body.pdf_layout !== undefined) {
    if (typeof body.pdf_layout !== 'object' || Array.isArray(body.pdf_layout)) errors.push('pdf_layout must be an object');
    else out.pdf_layout = body.pdf_layout;
  }
  if (body.watermark !== undefined) {
    if (typeof body.watermark !== 'object' || Array.isArray(body.watermark)) errors.push('watermark must be an object');
    else out.watermark = { ...DEFAULT_WATERMARK, ...body.watermark };
  }
  if (body.email !== undefined) {
    if (typeof body.email !== 'object' || Array.isArray(body.email)) errors.push('email must be an object');
    else out.email = { ...DEFAULT_EMAIL, ...body.email };
  }
  if (body.css_override !== undefined) {
    if (typeof body.css_override !== 'string') errors.push('css_override must be a string');
    else out.css_override = body.css_override;
  }
  return { errors, clean: out };
}

// Build the full CSS text for a given theme + override (used by /preview and the
// live WYSIWYG preview panel).
export function buildCss(themeJson, cssOverride) {
  const theme = computeTheme(themeJson);
  let css = ':root {\n';
  for (const [k, v] of Object.entries(theme.vars)) css += `  ${k}: ${v};\n`;
  css += '}\n';
  if (cssOverride) css += '\n/* brand override */\n' + cssOverride + '\n';
  return css;
}
