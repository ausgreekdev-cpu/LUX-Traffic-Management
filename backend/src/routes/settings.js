import { Router } from 'express';
import db from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { encryptSecret, SECRET_SETTING_KEYS, shouldPersistSecret } from '../secrets-crypto.js';

const router = Router();
router.use(authenticate);

const MASKED_KEYS = new Set(['smtp_pass', 'jwt_secret', 'webhook_secret', 'postmark_api_token']);
const MASK_PLACEHOLDER = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) {
    if (MASKED_KEYS.has(row.key)) {
      settings[row.key] = row.value ? MASK_PLACEHOLDER : '';
    } else {
      settings[row.key] = row.value;
    }
  }
  res.json(settings);
});

router.put('/', authorize('developer'), (req, res) => {
  const entries = Object.entries(req.body || {});
  if (!entries.length) return res.status(400).json({ error: 'No settings provided' });
  const upsert = db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  const tx = db.transaction((list) => {
    for (const [key, value] of list) {
      if (SECRET_SETTING_KEYS.includes(key)) {
        // Never overwrite a secret with the masked placeholder or an empty string.
        if (!shouldPersistSecret(value)) continue;
        upsert.run(key, encryptSecret(value));
      } else {
        upsert.run(key, value === null || value === undefined ? '' : String(value));
      }
    }
  });
  tx(entries);
  res.json({ success: true });
});

export default router;