import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
router.use(authenticate);

function generateReference() {
  const year = new Date().getFullYear();
  const last = db.prepare("SELECT reference FROM traffic_management_plans WHERE reference LIKE ? ORDER BY reference DESC LIMIT 1").get(`TMP-${year}-%`);
  if (!last) return `TMP-${year}-001`;
  const num = parseInt(last.reference.split('-')[2]) + 1;
  return `TMP-${year}-${String(num).padStart(3, '0')}`;
}

router.get('/', (req, res) => {
  let q = `SELECT t.*, s.name as site_name, p.name as project_name, u.name as creator_name
    FROM traffic_management_plans t
    LEFT JOIN sites s ON t.site_id = s.id
    LEFT JOIN tmp_projects p ON t.project_id = p.id
    LEFT JOIN users u ON t.created_by = u.id`;
  const params = [];
  if (req.query.status) { q += ' WHERE t.status = ?'; params.push(req.query.status); }
  q += ' ORDER BY t.created_at DESC';
  res.json(db.prepare(q).all(...params));
});

router.get('/:id', (req, res) => {
  const tmp = db.prepare(`
    SELECT t.*, s.name as site_name, s.road_name, s.suburb, p.name as project_name, u.name as creator_name
    FROM traffic_management_plans t
    LEFT JOIN sites s ON t.site_id = s.id
    LEFT JOIN tmp_projects p ON t.project_id = p.id
    LEFT JOIN users u ON t.created_by = u.id WHERE t.id = ?
  `).get(req.params.id);
  if (!tmp) return res.status(404).json({ error: 'TMP not found' });
  const activities = db.prepare('SELECT a.*, u.name as user_name FROM plan_activities a LEFT JOIN users u ON a.user_id = u.id WHERE a.tmp_id = ? ORDER BY a.created_at DESC').all(req.params.id);
  const documents = db.prepare('SELECT * FROM documents WHERE tmp_id = ? ORDER BY created_at DESC').all(req.params.id);
  const permits = db.prepare('SELECT pe.*, au.name as authority_name, au.short_name as authority_short FROM permits pe LEFT JOIN authorities au ON pe.authority_id = au.id WHERE pe.tmp_id = ?').all(req.params.id);
  res.json({ ...tmp, activities, documents, permits });
});

router.post('/', validate('tmp'), (req, res) => {
  const id = uuid();
  const reference = generateReference();
  const { project_id, site_id, title, status, plan_type, description, start_date, end_date } = req.validated;
  db.prepare('INSERT INTO traffic_management_plans (id, project_id, site_id, title, reference, status, plan_type, description, start_date, end_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, project_id || null, site_id || null, title, reference, status || 'draft', plan_type || 'temporary', description || null, start_date || null, end_date || null, req.user.id);
  db.prepare('INSERT INTO plan_activities (id, tmp_id, user_id, action, description) VALUES (?, ?, ?, ?, ?)').run(uuid(), id, req.user.id, 'created', 'Plan created');
  res.status(201).json({ id, reference, title, status: status || 'draft' });
});

router.put('/:id', validate('tmp'), (req, res) => {
  const existing = db.prepare('SELECT id, status FROM traffic_management_plans WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'TMP not found' });
  const { project_id, site_id, title, status, plan_type, description, start_date, end_date } = req.validated;
  db.prepare('UPDATE traffic_management_plans SET project_id=?, site_id=?, title=?, status=?, plan_type=?, description=?, start_date=?, end_date=?, updated_at=datetime("now") WHERE id=?').run(project_id || null, site_id || null, title, status || existing.status, plan_type || 'temporary', description || null, start_date || null, end_date || null, req.params.id);
  if (status && status !== existing.status) {
    db.prepare('INSERT INTO plan_activities (id, tmp_id, user_id, action, description) VALUES (?, ?, ?, ?, ?)').run(uuid(), req.params.id, req.user.id, 'status_changed', `Status changed to ${status}`);
  }
  res.json(db.prepare('SELECT * FROM traffic_management_plans WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM traffic_management_plans WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'TMP not found' });
  res.json({ success: true });
});

export default router;
