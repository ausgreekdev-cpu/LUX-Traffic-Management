import { Router } from 'express';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

const MASKED_KEYS = new Set(['smtp_pass', 'jwt_secret', 'webhook_secret']);

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) {
    if (MASKED_KEYS.has(row.key)) {
      settings[row.key] = row.value ? '••••••••' : '';
    } else {
      settings[row.key] = row.value;
    }
  }
  res.json(settings);
});

router.put('/', (req, res) => {
  const entries = Object.entries(req.body || {});
  if (!entries.length) return res.status(400).json({ error: 'No settings provided' });
  const upsert = db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  const tx = db.transaction((list) => {
    for (const [key, value] of list) {
      upsert.run(key, value === null || value === undefined ? '' : String(value));
    }
  });
  tx(entries);
  res.json({ success: true });
});

export default router;
