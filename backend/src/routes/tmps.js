import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { incompleteRequiredStages } from './workflows.js';

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
  const conditions = [];
  if (req.query.status) { conditions.push('t.status = ?'); params.push(req.query.status); }
  if (req.query.search) { conditions.push('(t.title LIKE ? OR t.reference LIKE ? OR s.name LIKE ?)'); const s = `%${req.query.search}%`; params.push(s, s, s); }
  if (conditions.length) q += ' WHERE ' + conditions.join(' AND ');
  q += ' ORDER BY t.created_at DESC';
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  const countQ = q.replace(/SELECT t\.\*.*?FROM/, 'SELECT COUNT(*) as total FROM');
  const total = db.prepare(countQ).get(...params).total;
  q += ' LIMIT ? OFFSET ?';
  params.push(limit, offset);
  const data = db.prepare(q).all(...params);
  res.json({ data, total, page, limit, pages: Math.ceil(total / limit) });
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
  const existing = db.prepare('SELECT * FROM traffic_management_plans WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'TMP not found' });
  const { project_id, site_id, title, status, plan_type, description, start_date, end_date } = req.validated;
  const nextStatus = status || existing.status;
  if ((nextStatus === 'approved' || nextStatus === 'completed') && nextStatus !== existing.status) {
    const missing = incompleteRequiredStages('tmp', req.params.id);
    if (missing.length) return res.status(400).json({ error: `Incomplete required workflow stages: ${missing.join(', ')}` });
  }
  db.prepare('UPDATE traffic_management_plans SET project_id=?, site_id=?, title=?, status=?, plan_type=?, description=?, start_date=?, end_date=?, updated_at=datetime(\'now\') WHERE id=?').run(project_id !== undefined ? (project_id || null) : existing.project_id, site_id !== undefined ? (site_id || null) : existing.site_id, title, nextStatus, plan_type !== undefined ? (plan_type || 'temporary') : existing.plan_type, description !== undefined ? (description || null) : existing.description, start_date !== undefined ? (start_date || null) : existing.start_date, end_date !== undefined ? (end_date || null) : existing.end_date, req.params.id);
  if (status && status !== existing.status) {
    db.prepare('INSERT INTO plan_activities (id, tmp_id, user_id, action, description) VALUES (?, ?, ?, ?, ?)').run(uuid(), req.params.id, req.user.id, 'status_changed', `Status changed to ${status}`);
  }
  res.json(db.prepare('SELECT * FROM traffic_management_plans WHERE id = ?').get(req.params.id));
});

router.post('/bulk', (req, res) => {
  const { ids, action, status } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'No ids provided' });
  if (action === 'status') {
    if (!status) return res.status(400).json({ error: 'Status required' });
    if (status === 'approved' || status === 'completed') {
      const missingPerId = [];
      for (const id of ids) {
        const tmp = db.prepare('SELECT id FROM traffic_management_plans WHERE id = ?').get(id);
        if (!tmp) continue;
        const missing = incompleteRequiredStages('tmp', id);
        if (missing.length) missingPerId.push(`${id}: ${missing.join(', ')}`);
      }
      if (missingPerId.length) return res.status(400).json({ error: 'Incomplete required workflow stages: ' + missingPerId.join(' | ') });
    }
    const stmt = db.prepare('UPDATE traffic_management_plans SET status = ?, updated_at = datetime(\'now\') WHERE id = ?');
    const act = db.prepare('INSERT INTO plan_activities (id, tmp_id, user_id, action, description) VALUES (?, ?, ?, ?, ?)');
    const tx = db.transaction((list) => {
      for (const id of list) {
        const r = stmt.run(status, id);
        if (r.changes) act.run(uuid(), id, req.user.id, 'status_changed', `Status changed to ${status} (bulk)`);
      }
    });
    tx(ids);
  } else if (action === 'delete') {
    const deleteTmp = db.prepare('DELETE FROM traffic_management_plans WHERE id = ?');
    const deletePermits = db.prepare('DELETE FROM permits WHERE tmp_id = ?');
    const deleteTimeEntries = db.prepare('DELETE FROM time_entries WHERE tmp_id = ?');
    const deleteChecklist = db.prepare("DELETE FROM workflow_checklist WHERE entity_type = 'tmp' AND entity_id = ?");
    const tx = db.transaction((list) => {
      for (const id of list) {
        deletePermits.run(id);
        deleteTimeEntries.run(id);
        deleteChecklist.run(id);
        deleteTmp.run(id);
      }
    });
    tx(ids);
  } else return res.status(400).json({ error: 'Invalid action' });
  res.json({ success: true, count: ids.length });
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM traffic_management_plans WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'TMP not found' });
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM permits WHERE tmp_id = ?').run(req.params.id);
    db.prepare('DELETE FROM time_entries WHERE tmp_id = ?').run(req.params.id);
    db.prepare("DELETE FROM workflow_checklist WHERE entity_type = 'tmp' AND entity_id = ?").run(req.params.id);
    db.prepare('DELETE FROM traffic_management_plans WHERE id = ?').run(req.params.id);
  });
  tx();
  res.json({ success: true });
});

export default router;
