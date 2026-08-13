import { Router } from 'express';
import { authenticate, roleAtLeast } from '../middleware/auth.js';
import { runScheduledChecks } from '../scheduler.js';
import db from '../db.js';

const router = Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const unreadOnly = req.query.unreadOnly === 'true' || req.query.unreadOnly === '1';
  const where = req.user.role === 'developer' && req.query.all === 'true'
    ? (unreadOnly ? 'WHERE n.is_read = 0' : '')
    : (unreadOnly ? 'WHERE n.user_id = ? AND n.is_read = 0' : 'WHERE n.user_id = ?');
  const params = req.user.role === 'developer' && req.query.all === 'true' ? [] : [req.user.id];
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
  if (n.user_id !== req.user.id && req.user.role !== 'developer') return res.status(403).json({ error: 'Forbidden' });
  db.prepare('UPDATE notifications SET is_read = 1, read_at = datetime(\'now\') WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.post('/read-all', (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1, read_at = datetime(\'now\') WHERE user_id = ? AND is_read = 0').run(req.user.id);
  res.json({ success: true });
});

router.post('/scan', roleAtLeast('staff'), (req, res) => {
  runScheduledChecks();
  res.json({ success: true });
});

export default router;
