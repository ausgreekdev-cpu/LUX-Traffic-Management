const buckets = new Map();
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
      const retryAfter = Math.ceil((entry.lockedUntil - now) / 1000);
      return res.status(429).json({ error: `Too many failed attempts. Try again in ${Math.ceil(retryAfter / 60)} minutes.`, retryAfter });
    }
    if (entry.fails >= maxAttempts) {
      entry.lockedUntil = now + windowMs;
      const retryAfter = Math.ceil(windowMs / 1000);
      return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.', retryAfter });
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
  for (const [ip, entry] of ipBuckets) {
    if (now - entry.startedAt > 60 * 60 * 1000) ipBuckets.delete(ip);
  }
}