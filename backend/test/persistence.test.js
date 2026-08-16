import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lux-persist-test-'));

after(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

test('validateSqlite accepts a real database buffer', async () => {
  const dbPath = path.join(tmpDir, 'real.db');
  const { default: Database } = await import('better-sqlite3');
  const d = new Database(dbPath);
  d.exec('CREATE TABLE t (id INTEGER); INSERT INTO t VALUES (1);');
  d.close();
  const bytes = fs.readFileSync(dbPath);
  const { validateSqlite } = await import('../src/persistence.js');
  assert.equal(validateSqlite(bytes, 'test'), true);
});

test('validateSqlite rejects corrupt bytes', async () => {
  const { validateSqlite } = await import('../src/persistence.js');
  assert.equal(validateSqlite(Buffer.from('this is definitely not a sqlite database...'), 'corrupt'), false);
});

test('snapshotStatus reports disabled outside serverless', async () => {
  const { snapshotStatus } = await import('../src/persistence.js');
  const status = await snapshotStatus();
  assert.deepEqual(status, { enabled: false });
});