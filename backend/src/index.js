import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import app from './app.js';
import { cleanupRateLimitBuckets } from './middleware/rate-limit.js';
import { startScheduler } from './scheduler.js';

const moduleDir = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

const frontendDist = path.resolve(moduleDir, '..', '..', 'frontend', 'dist');
app.use(express.static(frontendDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(frontendDist, 'index.html'));
});

function isPortServingOurBackend(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/api/health`, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data).status === 'ok'); } catch { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => { req.destroy(); resolve(false); });
  });
}

// Second-instance guard: if a healthy LUX backend is already serving this port,
// exit quietly — the running instance owns the scheduler and the database.
if (await isPortServingOurBackend(PORT)) {
  console.log(`Another LUX backend instance is already running on port ${PORT} — exiting.`);
  process.exit(0);
}

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET env var not set. A random secret is generated and persisted in the settings table (or per-cold-start on serverless). Set JWT_SECRET to a fixed long random value if you need tokens to survive a database reset.');
}

setInterval(cleanupRateLimitBuckets, 60 * 60 * 1000).unref();

const server = app.listen(PORT, () => {
  console.log('TMP CMS backend running on http://localhost:' + PORT);
  startScheduler();
  if (process.send) {
    process.send({ type: 'server-started', port: PORT });
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use by another process — exiting.`);
    process.exit(1);
  }
  console.error('Backend listen error:', err.message);
  process.exit(1);
});
