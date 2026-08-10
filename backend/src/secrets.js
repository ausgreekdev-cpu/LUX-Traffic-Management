import crypto from 'crypto';
import db, { isServerless } from './db.js';

let cached = null;

export function getJwtSecret() {
  if (cached) return cached;
  if (process.env.JWT_SECRET) {
    cached = process.env.JWT_SECRET;
    return cached;
  }
  const row = db.prepare("SELECT value FROM settings WHERE key = 'jwt_secret'").get();
  if (row && row.value) {
    cached = row.value;
    return cached;
  }
  const generated = crypto.randomBytes(48).toString('hex');
  if (isServerless) {
    cached = generated;
  } else {
    db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('jwt_secret', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(generated);
    cached = generated;
  }
  console.log('JWT_SECRET: generated and persisted a random secret (set JWT_SECRET to override).');
  return cached;
}
