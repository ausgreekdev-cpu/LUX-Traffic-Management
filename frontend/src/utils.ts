export const STORAGE_KEY = 'tmp_dashboard_data';
export const SETTINGS_KEY = 'tmp_dashboard_settings';
export const USER_KEY = 'tmp_current_user';
export const AUDIT_KEY = 'tmp_dashboard_audit';
export const TOKEN_KEY = 'tmp_auth_token';
function apiBaseUrl(): string {
  const fromEnv = import.meta.env?.VITE_API_BASE as string | undefined;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const origin = window.location.origin;
  if (
    origin.startsWith('capacitor://') ||
    origin.startsWith('http://localhost') ||
    origin.startsWith('https://localhost')
  ) {
    return 'http://localhost:3001';
  }
  return origin + ':3001';
}
export const API_BASE = apiBaseUrl();

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function formatDate(s: string | null | undefined): string {
  if (!s) return '\u2014';
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatTimestamp(i: string | null | undefined): string {
  if (!i) return '\u2014';
  const d = new Date(i);
  return d.toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

export function monthName(y: number, m: number): string {
  return new Date(y, m).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
}

export function getDayOfWeek(y: number, m: number, d: number): number {
  return new Date(y, m, d).getDay();
}

export function escHtml(s: unknown): string {
  if (typeof s !== 'string') return String(s);
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export function downloadFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}
