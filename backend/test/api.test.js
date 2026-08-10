import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lux-test-'));
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

async function login(email = 'admin@tmpcms.com', password = 'admin123') {
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  assert.equal(res.status, 200, 'login should succeed');
  return res.json();
}

test('health endpoint responds ok', async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
});

test('login rejects bad credentials', async () => {
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@tmpcms.com', password: 'wrong-password' })
  });
  assert.equal(res.status, 401);
});

test('protected routes require a token', async () => {
  const res = await fetch(`${base}/settings`);
  assert.equal(res.status, 401);
});

test('settings GET masks secrets', async () => {
  const { token } = await login();
  await fetch(`${base}/email/config`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ host: 'smtp.test.dev', port: 587, user: 'u', pass: 'super-secret-pass' })
  });
  const res = await fetch(`${base}/settings`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.jwt_secret, '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022');
  assert.equal(body.smtp_pass, '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022');
});

test('db backup downloads a real sqlite file', async () => {
  const { token } = await login();
  const res = await fetch(`${base}/export/db-backup`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 200);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.length > 4096, 'backup should be a substantial file');
  const magic = Buffer.from('SQLite format 3\u0000', 'utf8');
  assert.ok(buf.subarray(0, 16).equals(magic), 'backup should carry the sqlite header');
});

test('db restore round-trips a backup', async () => {
  const { token } = await login();
  const backup = await fetch(`${base}/export/db-backup`, { headers: { Authorization: `Bearer ${token}` } });
  const buf = Buffer.from(await backup.arrayBuffer());
  const fd = new FormData();
  fd.append('file', new Blob([buf]), 'backup.db');
  const res = await fetch(`${base}/export/db-restore`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(body.users >= 1);
  const me = await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(me.status, 200, 'session survives restore');
});

test('db restore rejects a non-sqlite file', async () => {
  const { token } = await login();
  const fd = new FormData();
  fd.append('file', new Blob(['this is definitely not a database']), 'fake.db');
  const res = await fetch(`${base}/export/db-restore`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd
  });
  assert.equal(res.status, 400);
});

test('db restore is admin-only', async () => {
  const { token } = await login('planner@tmpcms.com', 'planner123');
  const fd = new FormData();
  fd.append('file', new Blob(['still not a database']), 'fake.db');
  const res = await fetch(`${base}/export/db-restore`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd
  });
  assert.equal(res.status, 403);
});

test('scheduled checks run without errors', async () => {
  const { runScheduledChecks } = await import('../src/scheduler.js');
  const result = await runScheduledChecks();
  assert.equal(result.ok, true);
});
