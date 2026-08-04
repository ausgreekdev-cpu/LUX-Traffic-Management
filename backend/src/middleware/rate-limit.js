const buckets = new Map();

function keyFor(name, req) {
  const email = (req.body && req.body.email || '').toLowerCase();
  return `${name}|${req.ip}|${email}`;
}

export function rateLimit(name, maxAttempts, windowMinutes) {
  const windowMs = windowMinutes * 60 * 1000;
  return (req, res, next) => {
    const key = keyFor(name, req);
    const now = Date.now();
    let entry = buckets.get(key);
    if (!entry || now - entry.startedAt > windowMs) {
      entry = { startedAt: now, fails: 0, lockedUntil: 0 };
      buckets.set(key, entry);
    }
    if (entry.lockedUntil > now) {
      return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
    }
    if (entry.fails >= maxAttempts) {
      entry.lockedUntil = now + windowMs;
      return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
    }
    req.rateLimitKey = key;
    next();
  };
}

export function rateLimitSucceeded(key) {
  if (key) buckets.delete(key);
}

export function rateLimitFailed(key) {
  if (!key) return;
  const entry = buckets.get(key);
  if (entry) entry.fails += 1;
}

export function cleanupRateLimitBuckets() {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (now - entry.startedAt > 60 * 60 * 1000) buckets.delete(key);
  }
}