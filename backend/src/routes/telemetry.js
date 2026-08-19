import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import db, { dbPath, isServerless, schemaVersion } from '../db.js';
import { authenticate, roleAtLeast } from '../middleware/auth.js';
import { dataDir } from '../media-store.js';

const router = Router();
router.use(authenticate);
router.use(roleAtLeast('manager'));

function blobUsage() {
  let bytes = 0;
  let files = 0;
  try {
    const walk = (d) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else { bytes += fs.statSync(full).size; files += 1; }
      }
    };
    walk(dataDir());
  } catch {}
  return { bytes, files };
}

// Recent inbound webhook delivery telemetry (received vs failed).
router.get('/webhooks', (req, res) => {
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const rows = db.prepare(`
    SELECT * FROM webhook_deliveries
    ORDER BY created_at DESC LIMIT ?
  `).all(limit);
  const stats = db.prepare(`
    SELECT status, COUNT(*) as count FROM webhook_deliveries GROUP BY status
  `).all();
  res.json({ data: rows, stats });
});

// Recent automation engine runs.
router.get('/automations', (req, res) => {
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const rows = db.prepare(`
    SELECT r.id, r.rule_id, r.event_type, r.entity_type, r.entity_id, r.status,
           r.error, r.created_at, ru.name as rule_name
    FROM automation_runs r
    LEFT JOIN automation_rules ru ON ru.id = r.rule_id
    ORDER BY r.created_at DESC LIMIT ?
  `).all(limit);
  const stats = db.prepare('SELECT status, COUNT(*) as count FROM automation_runs GROUP BY status').all();
  res.json({ data: rows, stats });
});

// Recent outbound email log.
router.get('/emails', (req, res) => {
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const rows = db.prepare(`
    SELECT id, to_address, subject, status, tmp_id, created_at
    FROM email_logs ORDER BY created_at DESC LIMIT ?
  `).all(limit);
  const stats = db.prepare('SELECT status, COUNT(*) as count FROM email_logs GROUP BY status').all();
  res.json({ data: rows, stats });
});

// Storage usage: database file, media store (site photos), branding assets.
router.get('/storage', (req, res) => {
  const dbSize = (() => { try { return fs.statSync(dbPath).size; } catch { return 0; } })();
  const media = blobUsage();
  const assetCount = db.prepare('SELECT COUNT(*) as c FROM branding_assets').get().c;
  const photoCount = db.prepare('SELECT COUNT(*) as c FROM site_photos').get().c;
  const backupCount = (() => { try { return fs.readdirSync(path.join(path.dirname(dbPath), 'backups')).length; } catch { return 0; } })();
  res.json({
    serverless: isServerless,
    schema_version: schemaVersion(),
    database: { bytes: dbSize, path: dbPath },
    media: { bytes: media.bytes, files: media.files },
    photos: { count: photoCount },
    branding_assets: { count: assetCount },
    backups: { count: backupCount }
  });
});

export default router;