import { Router } from 'express';
import { authenticate, roleAtLeast } from '../middleware/auth.js';
import { runScheduledChecks } from '../scheduler.js';
import { getTenantId } from '../middleware/tenant.js';
import db from '../db.js';

const router = Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const unreadOnly = req.query.unreadOnly === 'true' || req.query.unreadOnly === '1';
  const tenantId = getTenantId(req);
  let where, params;
  if (req.user.role === 'developer' && req.query.all === 'true') {
    if (unreadOnly) {
      where = tenantId ? 'WHERE n.is_read = 0 AND (n.tenant_id = ? OR n.tenant_id IS NULL)' : 'WHERE n.is_read = 0';
      params = tenantId ? [tenantId] : [];
    } else {
      where = tenantId ? 'WHERE (n.tenant_id = ? OR n.tenant_id IS NULL)' : '';
      params = tenantId ? [tenantId] : [];
    }
    try { db.prepare('SELECT tenant_id FROM notifications LIMIT 1').get(); } catch { where = unreadOnly ? 'WHERE n.is_read = 0' : ''; params = []; }
  } else {
    if (unreadOnly) {
      where = tenantId ? 'WHERE n.user_id = ? AND n.is_read = 0 AND (n.tenant_id = ? OR n.tenant_id IS NULL)' : 'WHERE n.user_id = ? AND n.is_read = 0';
      params = tenantId ? [req.user.id, tenantId] : [req.user.id];
    } else {
      where = tenantId ? 'WHERE n.user_id = ? AND (n.tenant_id = ? OR n.tenant_id IS NULL)' : 'WHERE n.user_id = ?';
      params = tenantId ? [req.user.id, tenantId] : [req.user.id];
    }
    try { db.prepare('SELECT tenant_id FROM notifications LIMIT 1').get(); } catch { where = unreadOnly ? 'WHERE n.user_id = ? AND n.is_read = 0' : 'WHERE n.user_id = ?'; params = [req.user.id]; }
  }
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
  const tenantId = getTenantId(req);
  let c;
  try {
    if (tenantId) c = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0 AND (tenant_id = ? OR tenant_id IS NULL)').get(req.user.id, tenantId).c;
    else c = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id).c;
  } catch { c = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id).c; }
  res.json({ count: c });
});

router.post('/:id/read', (req, res) => {
  const n = db.prepare('SELECT * FROM notifications WHERE id = ?').get(req.params.id);
  if (!n) return res.status(404).json({ error: 'Notification not found' });
  const tenantId = getTenantId(req);
  if (tenantId && n.tenant_id && n.tenant_id !== tenantId) return res.status(403).json({ error: 'Tenant mismatch' });
  if (n.user_id !== req.user.id && req.user.role !== 'developer') return res.status(403).json({ error: 'Forbidden' });
  if (tenantId) {
    try { db.prepare('UPDATE notifications SET is_read = 1, read_at = datetime(\'now\') WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)').run(req.params.id, tenantId); } catch { db.prepare('UPDATE notifications SET is_read = 1, read_at = datetime(\'now\') WHERE id = ?').run(req.params.id); }
  } else db.prepare('UPDATE notifications SET is_read = 1, read_at = datetime(\'now\') WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.post('/read-all', (req, res) => {
  const tenantId = getTenantId(req);
  try {
    if (tenantId) db.prepare('UPDATE notifications SET is_read = 1, read_at = datetime(\'now\') WHERE user_id = ? AND is_read = 0 AND (tenant_id = ? OR tenant_id IS NULL)').run(req.user.id, tenantId);
    else db.prepare('UPDATE notifications SET is_read = 1, read_at = datetime(\'now\') WHERE user_id = ? AND is_read = 0').run(req.user.id);
  } catch { db.prepare('UPDATE notifications SET is_read = 1, read_at = datetime(\'now\') WHERE user_id = ? AND is_read = 0').run(req.user.id); }
  res.json({ success: true });
});

router.post('/scan', roleAtLeast('staff'), (req, res) => {
  runScheduledChecks();
  res.json({ success: true });
});

export default router;
