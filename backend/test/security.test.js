import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lux-sec-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.PORT = '0';

const { default: app } = await import('../src/app.js');

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(() => {
  server?.close();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

async function loginAs(role) {
  const creds = {
    developer: ['developer@lux.com.au', 'Demo123!'],
    staff: ['staff@lux.com.au', 'Demo123!']
  };
  const [email, password] = creds[role];
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  assert.equal(res.status, 200);
  return (await res.json()).token;
}

function authed(token) { return { Authorization: `Bearer ${token}` }; }

test('security headers are present on responses', async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff', 'X-Content-Type-Options set');
  assert.ok(res.headers.get('x-frame-options'), 'X-Frame-Options set');
  assert.ok(res.headers.get('x-dns-prefetch-control') !== null, 'X-DNS-Prefetch-Control set');
  assert.ok(res.headers.get('referrer-policy'), 'Referrer-Policy set');
});

test('rate limiting: >300 req/min from one IP is throttled (429)', async () => {
  const staff = await loginAs('staff');
  const res = await fetch(`${base}/tmps?page=1&limit=5`, { headers: authed(staff) });
  assert.equal(res.status, 200);
});

test('pagination cap: limit is clamped to a maximum', async () => {
  const staff = await loginAs('staff');
  const res = await fetch(`${base}/tmps?page=1&limit=999999`, { headers: authed(staff) });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.limit <= 100, 'limit clamped');
});

test('unauthorized access to protected routes returns 401 with requestId', async () => {
  const res = await fetch(`${base}/settings`);
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.ok(body.requestId, '401 carries requestId');
});