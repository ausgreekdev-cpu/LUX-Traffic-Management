import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'fs';
import db, { isServerless, schemaVersion, dbPath } from './db.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import clientRoutes from './routes/clients.js';
import siteRoutes from './routes/sites.js';
import projectRoutes from './routes/projects.js';
import tmpRoutes from './routes/tmps.js';
import documentRoutes from './routes/documents.js';
import dashboardRoutes from './routes/dashboard.js';
import exportRoutes from './routes/export.js';
import emailRoutes from './routes/email.js';
import authorityRoutes from './routes/authorities.js';
import permitRoutes from './routes/permits.js';
import timeEntryRoutes from './routes/time-entries.js';
import analyticsRoutes from './routes/analytics.js';
import notificationRoutes from './routes/notifications.js';
import settingsRoutes from './routes/settings.js';
import workflowRoutes, { ensureWorkflowSeeds } from './routes/workflows.js';
import automationRoutes from './routes/automations.js';
import agentRoutes from './routes/agents.js';
import integrationRoutes from './routes/integrations.js';
import { ensureAutomationPresets } from './automation-presets.js';
import { seedDirectoryIfEmpty } from './seed-directory.js';
import { seedDatabase, seedAdminFromEnv, ensureDemoUsers } from './seed.js';
import { globalRateLimit } from './middleware/rate-limit.js';
import { requestLogger } from './middleware/request-log.js';
import { notFound, errorHandler } from './middleware/error-handler.js';
import { ensureEncryptionKey, encryptLegacySecrets } from './secrets-crypto.js';
import { snapshotDbNow, snapshotStatus } from './persistence.js';
import './automation-engine.js';

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:5173', 'http://localhost:3001', 'https://lux-official.netlify.app', 'https://lux-tmp.netlify.app'] }));
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); } }));
app.use(requestLogger);

app.use('/api', globalRateLimit(300, 1));

app.use('/api', (req, res, next) => {
  const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  // Snapshot the DB after mutating requests — INCLUDING /auth/* — so the
  // persisted jwt_secret (and any login-time writes) are uploaded to Blobs
  // and survive instance recycles on serverless.
  if (mutating) {
    const origSend = res.send.bind(res);
    res.send = (body) => snapshotDbNow().finally(() => origSend(body));
  }
  next();
});

app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.path === '/health' || req.path.startsWith('/auth') || req.path.startsWith('/settings')) return next();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'maintenance_mode'").get();
  if (row && row.value === 'true') {
    return res.status(503).json({ error: 'Maintenance mode is enabled — the system is read-only. Disable it in Settings to continue.' });
  }
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/sites', siteRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tmps', tmpRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/authorities', authorityRoutes);
app.use('/api/permits', permitRoutes);
app.use('/api/time-entries', timeEntryRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/automations', automationRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/integrations', integrationRoutes);

app.get('/api/ping', (req, res) => {
  res.json({ pong: true, at: new Date().toISOString() });
});

app.get('/api/health', async (req, res) => {
  let integrity;
  try {
    integrity = db.pragma('integrity_check', { simple: true });
  } catch (err) {
    integrity = 'error: ' + err.message;
  }
  let lastBackup = null;
  try {
    lastBackup = db.prepare("SELECT value FROM settings WHERE key = 'auto_backup_last'").get()?.value || null;
  } catch {}
  const health = {
    status: integrity === 'ok' ? 'ok' : 'degraded',
    serverless: isServerless,
    schema_version: schemaVersion(),
    uptime_seconds: Math.round(process.uptime()),
    db: {
      integrity,
      size_bytes: (() => { try { return fs.statSync(dbPath).size; } catch { return 0; } })(),
      path: dbPath
    },
    backups: { last: lastBackup }
  };
  if (isServerless) {
    health.snapshot = await snapshotStatus();
  }
  res.json(health);
});

app.use('/api', notFound);
app.use(errorHandler);

ensureWorkflowSeeds();
seedDirectoryIfEmpty();
ensureAutomationPresets();
ensureEncryptionKey();
encryptLegacySecrets(db);

const { c: userCount } = db.prepare('SELECT COUNT(*) as c FROM users').get();
if (userCount === 0) {
  if (isServerless) {
    seedAdminFromEnv();
  } else {
    seedDatabase();
  }
}
// Idempotently ensure the demo login accounts exist (INSERT OR IGNORE) so the
// demo credentials shown on the login page work on any deployment, including
// serverless and local DBs that pre-date the LUX rebrand.
ensureDemoUsers();

export default app;
