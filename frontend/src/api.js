import { API_BASE, TOKEN_KEY } from './utils.js';

let apiAvailable = false;

export function isApiAvailable() {
  return apiAvailable;
}

export function setApiAvailable(val) {
  apiAvailable = val;
}

async function apiFetch(method, path, body) {
  const token = localStorage.getItem(TOKEN_KEY);
  const opts = { method, headers: {} };
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  try {
    const res = await fetch(API_BASE + path, opts);
    if (res.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || 'API error ' + res.status);
    }
    return await res.json();
  } catch (err) {
    if (method === 'GET') return null;
    throw err;
  }
}

export function apiGet(path) { return apiFetch('GET', path); }
export function apiPost(path, body) { return apiFetch('POST', path, body); }
export function apiPut(path, body) { return apiFetch('PUT', path, body); }
export function apiDelete(path) { return apiFetch('DELETE', path); }

export async function loginToApi(username, password) {
  try {
    const res = await apiPost('/api/auth/login', { username, password });
    if (res && res.token) {
      localStorage.setItem(TOKEN_KEY, res.token);
      apiAvailable = true;
      return res;
    }
  } catch (_) {}
  return null;
}
