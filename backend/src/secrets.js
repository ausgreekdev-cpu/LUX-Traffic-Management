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
  // Persist the generated secret ALWAYS (including serverless). On Netlify the
  // settings row is uploaded to Blobs on the next snapshot, so every cold start
  // restores the same secret instead of minting a new one (which would invalidate
  // every previously issued token).
  const generated = crypto.randomBytes(48).toString('hex');
  db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('jwt_secret', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(generated);
  cached = generated;
  const note = isServerless
    ? 'persisted in the serverless database (survives restores; set JWT_SECRET to override).'
    : 'persisted in the settings table (set JWT_SECRET to override).';
  console.log(`JWT_SECRET: generated and ${note}`);
  return cached;
}

export function resetJwtSecretCache() {
  cached = null;
}