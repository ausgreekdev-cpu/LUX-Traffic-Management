import { API_BASE, TOKEN_KEY } from './utils.js';

let apiAvailable = false;

export function isApiAvailable(): boolean {
  return apiAvailable;
}

export function setApiAvailable(val: boolean): void {
  apiAvailable = val;
}

interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
}

async function apiFetch<T = unknown>(method: string, path: string, body?: unknown): Promise<T | null> {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const opts: RequestInit = { method, headers };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  try {
    const res = await fetch(API_BASE + path, opts);
    if (res.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    if (!res.ok) {
      const e = (await res.json().catch(() => ({}))) as ApiResponse;
      throw new Error(e.error || 'API error ' + res.status);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (method === 'GET') return null;
    throw err;
  }
}

export function apiGet<T = unknown>(path: string): Promise<T | null> {
  return apiFetch<T>('GET', path);
}
export function apiPost<T = unknown>(path: string, body: unknown): Promise<T | null> {
  return apiFetch<T>('POST', path, body);
}
export function apiPut<T = unknown>(path: string, body: unknown): Promise<T | null> {
  return apiFetch<T>('PUT', path, body);
}
export function apiDelete<T = unknown>(path: string): Promise<T | null> {
  return apiFetch<T>('DELETE', path);
}

export interface LoginResponse {
  token: string;
  user: {
    username: string;
    role: string;
    id: string;
  };
}

export async function loginToApi(username: string, password: string): Promise<LoginResponse | null> {
  try {
    const res = await apiPost<LoginResponse>('/api/auth/login', { username, password });
    if (res && res.token) {
      localStorage.setItem(TOKEN_KEY, res.token);
      apiAvailable = true;
      return res;
    }
  } catch (_) {}
  return null;
}
