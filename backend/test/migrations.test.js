import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lux-mig-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.PORT = '0';

const { default: db, schemaVersion, runMigrations } = await import('../src/db.js');

test('schema_migrations table exists and records the baseline + auth_attempts', () => {
  const rows = db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all();
  const versions = rows.map((r) => r.version);
  assert.ok(versions.length >= 1, 'at least baseline migration recorded');
  assert.ok(versions.includes(2), 'auth_attempts migration (v2) applied');
  assert.equal(schemaVersion(), Math.max(...versions));
});

test('auth_attempts table exists with expected columns', () => {
  const cols = db.prepare('PRAGMA table_info(auth_attempts)').all().map((c) => c.name);
  for (const col of ['key', 'fails', 'locked_until', 'updated_at']) {
    assert.ok(cols.includes(col), `auth_attempts has ${col}`);
  }
});

test('running migrations twice is idempotent (no duplicate rows)', () => {
  const before = db.prepare('SELECT COUNT(*) as c FROM schema_migrations').get().c;
  runMigrations();
  const after = db.prepare('SELECT COUNT(*) as c FROM schema_migrations').get().c;
  assert.equal(after, before, 'no duplicate migration rows');
});

test('secret encryption round-trips via secrets-crypto', async () => {
  process.env.LUX_ENCRYPTION_KEY = 'test-encryption-key-0123456789abcdef';
  const { encryptSecret, decryptSecret, isEncrypted } = await import('../src/secrets-crypto.js');
  const plain = 'SuperSecretToken123';
  const enc = encryptSecret(plain);
  assert.ok(isEncrypted(enc), 'encrypted value carries the enc:v1: prefix');
  assert.notEqual(enc, plain);
  assert.equal(decryptSecret(enc), plain, 'round-trip decrypts to original');
  delete process.env.LUX_ENCRYPTION_KEY;
});

test('encryptLegacySecrets upgrades plaintext to encrypted in place', async () => {
  process.env.LUX_ENCRYPTION_KEY = 'test-encryption-key-0123456789abcdef';
  db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES ('smtp_pass', 'legacy-plain', datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = 'legacy-plain'
  `).run();
  const { encryptLegacySecrets, decryptSecret } = await import('../src/secrets-crypto.js');
  encryptLegacySecrets(db);
  const stored = db.prepare("SELECT value FROM settings WHERE key = 'smtp_pass'").get().value;
  assert.ok(String(stored).startsWith('enc:v1:'), 'legacy plaintext upgraded to encrypted');
  assert.equal(decryptSecret(stored), 'legacy-plain', 'upgraded value decrypts to original');
  delete process.env.LUX_ENCRYPTION_KEY;
});