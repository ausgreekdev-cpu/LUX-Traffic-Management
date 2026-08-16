import db from '../db.js';

const ipBuckets = new Map();

export function globalRateLimit(maxPerWindow = 300, windowMinutes = 1) {
  const windowMs = windowMinutes * 60 * 1000;
  return (req, res, next) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    let entry = ipBuckets.get(ip);
    if (!entry || now - entry.startedAt > windowMs) {
      entry = { count: 0, startedAt: now };
      ipBuckets.set(ip, entry);
    }
    entry.count += 1;
    if (entry.count > maxPerWindow) {
      return res.status(429).json({ error: 'Too many requests. Please slow down and try again shortly.' });
    }
    next();
  };
}

function keyFor(name, req) {
  const email = (req.body && req.body.email || '').toLowerCase();
  return `${name}|${req.ip}|${email}`;
}

function getAttempt(key) {
  return db.prepare('SELECT fails, locked_until FROM auth_attempts WHERE key = ?').get(key) || { fails: 0, locked_until: 0 };
}

function upsertAttempt(key, fails, lockedUntil) {
  db.prepare(`
    INSERT INTO auth_attempts (key, fails, locked_until, updated_at) VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET fails = excluded.fails, locked_until = excluded.locked_until, updated_at = excluded.updated_at
  `).run(key, fails, lockedUntil);
}

export function rateLimit(name, maxAttempts, windowMinutes) {
  const windowMs = windowMinutes * 60 * 1000;
  return (req, res, next) => {
    const key = keyFor(name, req);
    const now = Date.now();
    let entry = getAttempt(key);

    if (entry.locked_until > now) {
      const retryAfter = Math.ceil((entry.locked_until - now) / 1000);
      return res.status(429).json({ error: `Too many failed attempts. Try again in ${Math.ceil(retryAfter / 60)} minutes.`, retryAfter });
    }

    if (entry.fails >= maxAttempts) {
      const lockedUntil = now + windowMs;
      upsertAttempt(key, entry.fails, lockedUntil);
      const retryAfter = Math.ceil(windowMs / 1000);
      return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.', retryAfter });
    }

    req.rateLimitKey = key;
    next();
  };
}

export function rateLimitSucceeded(key) {
  if (key) db.prepare('DELETE FROM auth_attempts WHERE key = ?').run(key);
}

export function rateLimitFailed(key) {
  if (!key) return;
  const entry = getAttempt(key);
  upsertAttempt(key, entry.fails + 1, entry.locked_until);
}

export function cleanupRateLimitBuckets() {
  const now = Date.now();
  for (const [ip, entry] of ipBuckets) {
    if (now - entry.startedAt > 60 * 60 * 1000) ipBuckets.delete(ip);
  }
  db.prepare('DELETE FROM auth_attempts WHERE locked_until < ?').run(now);
}