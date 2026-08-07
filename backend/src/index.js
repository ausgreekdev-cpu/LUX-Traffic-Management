import 'dotenv/config';
import express from 'express';
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

startScheduler();

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET is not set. Using the insecure default secret — set JWT_SECRET to a long random value before deploying.');
}

setInterval(cleanupRateLimitBuckets, 60 * 60 * 1000).unref();

app.listen(PORT, () => {
  console.log('TMP CMS backend running on http://localhost:' + PORT);
  if (process.send) {
    process.send({ type: 'server-started', port: PORT });
  }
});
