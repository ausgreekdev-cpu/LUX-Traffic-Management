// Client-side colour helpers for the Branding editor — mirror the backend
// (backend/src/branding.js) so the WYSIWYG preview updates without a round trip.

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
const RAMP_STEPS = Object.keys(DEFAULT_RAMP);

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

export function generateRamp(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return { ...DEFAULT_RAMP };
  const { h, s } = rgbToHsl(rgb);
  const steps = {
    50: [0.5, 96], 100: [0.68, 91], 200: [0.82, 84], 300: [0.92, 74],
    400: [1, 64], 500: [1, 50], 600: [1, 42], 700: [1, 33], 800: [1, 25], 900: [1, 17]
  };
  const ramp = {};
  for (const [step, [sat, light]] of Object.entries(steps)) ramp[step] = rgbToHex(hslToRgb(h, s * sat, light));
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

export function pickTextColor(rgb) {
  const white = contrastRatio(rgb, { r: 255, g: 255, b: 255 });
  const black = contrastRatio(rgb, { r: 0, g: 0, b: 0 });
  return white >= black ? '#ffffff' : '#000000';
}

export function normalizeTheme(input) {
  const base = { ...THEME_DEFAULTS, ...(input || {}) };
  const out = {};
  for (const key of ['primary', 'secondary', 'accent', ...SYSTEM_STATE_KEYS]) {
    const hex = String(base[key] || '').trim();
    out[key] = hexToRgb(hex) ? hex : THEME_DEFAULTS[key];
  }
  out.ramp = {};
  const rampInput = base.ramp && typeof base.ramp === 'object' ? base.ramp : {};
  for (const step of RAMP_STEPS) {
    const v = rampInput[step];
    out.ramp[step] = v && hexToRgb(v) ? String(v).trim() : generateRamp(out.primary)[step];
  }
  return out;
}

// Compute the full CSS variable map from a theme (used for live preview).
export function computeCssVars(themeJson) {
  const t = normalizeTheme(themeJson);
  const vars = {};
  for (const step of RAMP_STEPS) {
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
  for (const key of SYSTEM_STATE_KEYS) define(`--system-${key}`, t[key]);
  return { vars, theme: t, themeColor: t.primary };
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
  for (const step of RAMP_STEPS) check(`Ramp ${step}`, t.ramp[step]);
  return audit;
}
