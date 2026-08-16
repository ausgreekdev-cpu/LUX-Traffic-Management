import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lux-mw-test-'));
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

test('unknown API route returns JSON 404 with requestId', async () => {
  const res = await fetch(`${base}/does-not-exist`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error, 'Not found');
  assert.ok(body.requestId, '404 carries a requestId');
});

test('malformed JSON returns JSON 400', async () => {
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"email": "broken'
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, 'Malformed JSON body');
});

test('X-Request-Id header is set on responses', async () => {
  const res = await fetch(`${base}/health`);
  assert.ok(res.headers.get('x-request-id'), 'X-Request-Id header present');
});

test('validation failures return structured 400', async () => {
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'not-an-email', password: '' })
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, 'Validation failed');
  assert.ok(Array.isArray(body.details));
});

test('health endpoint reports schema version and db integrity', async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
  assert.ok(body.schema_version >= 2, 'schema_version recorded (>=2)');
  assert.equal(body.db.integrity, 'ok');
  assert.equal(typeof body.uptime_seconds, 'number');
});