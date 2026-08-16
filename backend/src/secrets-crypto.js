import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

const PREFIX = 'enc:v1:';

function envKey() {
  const k = process.env.LUX_ENCRYPTION_KEY;
  if (k && k.length >= 16) return crypto.createHash('sha256').update(k).digest();
  return null;
}

function fileKeyPath() {
  return path.join(os.homedir(), '.lux', 'encryption.key');
}

function fileKey() {
  try {
    const raw = fs.readFileSync(fileKeyPath(), 'utf8').trim();
    if (raw.length >= 32) return crypto.createHash('sha256').update(raw).digest();
  } catch {}
  return null;
}

let cachedKey = null;

function getKey() {
  if (cachedKey) return cachedKey;
  cachedKey = envKey() || fileKey();
  return cachedKey;
}

export function encryptionAvailable() {
  return !!getKey();
}

// Persist a random key on the desktop so secrets survive across the local app
// process. Serverless must supply LUX_ENCRYPTION_KEY as an env var.
export function ensureEncryptionKey() {
  if (getKey()) return getKey();
  if (process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    console.warn('[secrets-crypto] No LUX_ENCRYPTION_KEY set — storing secrets in plaintext. Set it on the serverless deployment to encrypt secrets at rest.');
    return null;
  }
  try {
    const dir = path.dirname(fileKeyPath());
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fileKeyPath(), crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
    cachedKey = crypto.createHash('sha256').update(fs.readFileSync(fileKeyPath(), 'utf8').trim()).digest();
    console.log('[secrets-crypto] Generated encryption key at ' + fileKeyPath());
    return cachedKey;
  } catch (err) {
    console.warn('[secrets-crypto] Could not create encryption key file — storing secrets in plaintext: ' + err.message);
    return null;
  }
}

export function encryptSecret(plaintext) {
  if (plaintext === undefined || plaintext === null || plaintext === '') return plaintext;
  const key = getKey();
  if (!key) return plaintext;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

export function decryptSecret(value) {
  if (!value || !String(value).startsWith(PREFIX)) return value;
  const key = getKey();
  if (!key) return value;
  try {
    const parts = String(value).split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parts[2], 'base64'));
    decipher.setAuthTag(Buffer.from(parts[3], 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(parts[4], 'base64')), decipher.final()]).toString('utf8');
  } catch (err) {
    console.warn('[secrets-crypto] Failed to decrypt secret: ' + err.message);
    return value;
  }
}

export function isEncrypted(value) {
  return !!value && String(value).startsWith(PREFIX);
}

export const SECRET_SETTING_KEYS = ['smtp_pass', 'postmark_api_token', 'webhook_secret'];

const MASK_PLACEHOLDER = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';

export function shouldPersistSecret(value) {
  const v = value === undefined || value === null ? '' : String(value);
  return v.length > 0 && v !== MASK_PLACEHOLDER;
}

// Upgrade any legacy plaintext secret settings to encrypted form, in place.
// Idempotent — encrypted values are left untouched. Requires the settings table
// to exist (call after db init).
export function encryptLegacySecrets(db) {
  const get = (k) => db.prepare('SELECT value FROM settings WHERE key = ?').get(k);
  const set = (k, v) => db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(k, v);
  let migrated = 0;
  for (const key of SECRET_SETTING_KEYS) {
    const row = get(key);
    if (!row || !row.value) continue;
    if (isEncrypted(row.value)) continue;
    if (!shouldPersistSecret(row.value)) continue;
    set(key, encryptSecret(row.value));
    migrated += 1;
  }
  if (migrated) console.log(`[secrets-crypto] migrated ${migrated} legacy plaintext secret setting(s) to encrypted form`);
  return migrated;
}