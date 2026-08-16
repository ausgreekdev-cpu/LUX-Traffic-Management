import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lux-lockout-test-'));
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

async function badLogin(email, password) {
  return fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
}

test('login locks out after 10 failed attempts (429), then recovers after window', async () => {
  const email = 'lockout-probe@lux.com.au';
  for (let i = 0; i < 10; i++) {
    const res = await badLogin(email, 'wrong-pass');
    assert.equal(res.status, 401);
  }
  const blocked = await badLogin(email, 'wrong-pass');
  assert.equal(blocked.status, 429, '11th attempt is locked out');
  const body = await blocked.json();
  assert.ok(body.retryAfter > 0, 'lockout returns retryAfter');
});

test('successful login clears the failure counter (DB-backed)', async () => {
  const email = 'client@lux.com.au';
  for (let i = 0; i < 3; i++) {
    assert.equal((await badLogin(email, 'bad')).status, 401);
  }
  const ok = await badLogin(email, 'Demo123!');
  assert.equal(ok.status, 200, 'valid login succeeds after a few fails');
});

test('auth_attempts row is persisted in the database', async () => {
  const email = 'persist-probe@lux.com.au';
  for (let i = 0; i < 2; i++) {
    assert.equal((await badLogin(email, 'bad')).status, 401);
  }
  const { default: db } = await import('../src/db.js');
  const key = `login|::ffff:127.0.0.1|${email}`;
  const row = db.prepare('SELECT fails FROM auth_attempts WHERE key = ?').get(key);
  assert.ok(row, 'auth_attempts row exists');
  assert.equal(row.fails, 2);
});