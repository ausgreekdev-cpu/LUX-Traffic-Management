import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const unreadOnly = req.query.unreadOnly === 'true' || req.query.unreadOnly === '1';
  const where = req.user.role === 'admin' && req.query.all === 'true'
    ? (unreadOnly ? 'WHERE n.is_read = 0' : '')
    : (unreadOnly ? 'WHERE n.user_id = ? AND n.is_read = 0' : 'WHERE n.user_id = ?');
  const params = req.user.role === 'admin' && req.query.all === 'true' ? [] : [req.user.id];
  const data = db.prepare(`
    SELECT n.*, u.name as user_name
    FROM notifications n
    LEFT JOIN users u ON n.user_id = u.id
    ${where}
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT ?`
  ).all(...params, limit);
  res.json({ data });
});

router.get('/unread-count', (req, res) => {
  const c = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id).c;
  res.json({ count: c });
});

router.post('/:id/read', (req, res) => {
  const n = db.prepare('SELECT * FROM notifications WHERE id = ?').get(req.params.id);
  if (!n) return res.status(404).json({ error: 'Notification not found' });
  if (n.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  db.prepare('UPDATE notifications SET is_read = 1, read_at = datetime(\'now\') WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.post('/read-all', (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1, read_at = datetime(\'now\') WHERE user_id = ? AND is_read = 0').run(req.user.id);
  res.json({ success: true });
});

function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function notifyUsers(userId, { type, title, message, entity_type, entity_id, dedupe_key }) {
  const users = userId
    ? db.prepare('SELECT id FROM users WHERE id = ?').all(userId)
    : db.prepare('SELECT id FROM users WHERE role != "viewer"').all();
  let created = 0;
  const insert = db.prepare(`
    INSERT OR IGNORE INTO notifications (id, user_id, type, title, message, entity_type, entity_id, dedupe_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction((list) => {
    for (const u of list) {
      const result = insert.run(uuid(), u.id, type, title, message, entity_type, entity_id, dedupe_key);
      created += result.changes;
    }
  });
  tx(users);
  return created;
}

router.post('/scan', (req, res) => {
  const reminderDays = Math.max(0, parseInt(req.body.days || getSetting('reminder_days', '14'), 10) || 14);
  const today = new Date();
  const toISO = (d) => d.toISOString().slice(0, 10);
  const windowEnd = toISO(new Date(today.getTime() + reminderDays * 86400000));
  const todayStr = toISO(today);

  const tmps = db.prepare(`
    SELECT * FROM traffic_management_plans
    WHERE end_date IS NOT NULL AND end_date != ''
      AND status NOT IN ('completed','cancelled')
  `).all();

  let created = 0;
  for (const tmp of tmps) {
    let type = null;
    let title = null;
    let message = null;
    if (tmp.end_date >= todayStr && tmp.end_date <= windowEnd) {
      type = 'tmp_expiring';
      title = `TMP ${tmp.reference || ''} ending soon`;
      message = `${tmp.title} is scheduled to end on ${tmp.end_date}. Review and extend or close it.`;
    } else if (tmp.end_date < todayStr) {
      type = 'tmp_expired';
      title = `TMP ${tmp.reference || ''} has ended`;
      message = `${tmp.title} ended on ${tmp.end_date} but has not been marked completed.`;
    }
    if (type) {
      created += notifyUsers(tmp.created_by, {
        type, title, message,
        entity_type: 'tmp', entity_id: tmp.id,
        dedupe_key: `tmp-end-${tmp.id}-${tmp.end_date}-${type}`
      });
    }
  }

  const permits = db.prepare(`
    SELECT pe.*, t.title as tmp_title, t.reference as tmp_reference, t.created_by as tmp_created_by
    FROM permits pe
    LEFT JOIN traffic_management_plans t ON pe.tmp_id = t.id
    WHERE pe.expiry_date IS NOT NULL AND pe.expiry_date != ''
      AND pe.status IN ('approved')
  `).all();

  for (const permit of permits) {
    let type = null;
    let title = null;
    let message = null;
    if (permit.expiry_date >= todayStr && permit.expiry_date <= windowEnd) {
      type = 'permit_expiring';
      title = `Permit for ${permit.tmp_reference || 'TMP'} expiring soon`;
      message = `Approved permit expires on ${permit.expiry_date}. Check if it needs renewal or removal.`;
    } else if (permit.expiry_date < todayStr) {
      type = 'permit_expired';
      title = `Permit for ${permit.tmp_reference || 'TMP'} has expired`;
      message = `Approved permit expired on ${permit.expiry_date} without being updated.`;
    }
    if (type) {
      created += notifyUsers(permit.created_by || permit.tmp_created_by, {
        type, title, message,
        entity_type: 'permit', entity_id: permit.id,
        dedupe_key: `permit-exp-${permit.id}-${permit.expiry_date}-${type}`
      });
    }
  }

  res.json({ created });
});

export default router;
