import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lux-dashboard-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test-dashboard.db');
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

async function login(email = 'developer@lux.com.au', password = 'Demo123!') {
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  assert.equal(res.status, 200);
  return res.json();
}

test('dashboard requires auth', async () => {
  const res = await fetch(`${base}/dashboard`);
  assert.equal(res.status, 401);
});

test('dashboard returns stats and lists', async () => {
  const { token } = await login();
  const res = await fetch(`${base}/dashboard`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(typeof body.stats.totalTmps === 'number');
  assert.ok(typeof body.stats.activeTmps === 'number');
  assert.ok(typeof body.stats.pendingPermits === 'number');
  assert.ok(typeof body.stats.totalFeesOwed === 'number');
  assert.ok(Array.isArray(body.recentTmps));
  assert.ok(Array.isArray(body.recentActivity));
  assert.ok(Array.isArray(body.workflowAttention));
  assert.ok(Array.isArray(body.urgentPermits));
  assert.ok(body.generated_at);
});

test('dashboard ETag 304', async () => {
  const { token } = await login();
  const r1 = await fetch(`${base}/dashboard`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(r1.status, 200);
  const etag = r1.headers.get('etag');
  assert.ok(etag);
  const r2 = await fetch(`${base}/dashboard`, { headers: { Authorization: `Bearer ${token}`, 'If-None-Match': etag } });
  assert.equal(r2.status, 304);
});

test('dashboard client sees scoped data', async () => {
  const { token } = await login('client@lux.com.au', 'Demo123!');
  const res = await fetch(`${base}/dashboard`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 200);
  const body = await res.json();
  // Client should see only own client's data (totalClients 1)
  assert.equal(body.stats.totalClients, 1);
});

test('dashboard workflowAttention is array of missing stages', async () => {
  const { token } = await login();
  const res = await fetch(`${base}/dashboard`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json();
  for (const item of body.workflowAttention) {
    assert.ok(['tmp','permit'].includes(item.type));
    assert.ok(Array.isArray(item.missing));
  }
});
