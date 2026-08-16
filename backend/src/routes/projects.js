import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { roleAtLeast } from '../middleware/auth.js';
import { isClientUser, projectOwnedByClient } from '../middleware/scope.js';
import { validate } from '../middleware/validate.js';
import { paginateResponse } from '../middleware/pagination.js';

const router = Router();
router.use(authenticate);

router.get('/', (req, res) => {
  let q = `
    SELECT p.*, c.name as client_name, c.company as client_company,
      (SELECT COUNT(*) FROM traffic_management_plans WHERE project_id = p.id) as plan_count
    FROM tmp_projects p LEFT JOIN clients c ON p.client_id = c.id`;
  const params = [];
  if (isClientUser(req.user)) {
    q += ' WHERE p.client_id = ?';
    params.push(req.user.clientId);
  }
  q += ' ORDER BY p.created_at DESC';
  const projects = db.prepare(q).all(...params);
  res.json(paginateResponse(req, projects));
});

router.get('/:id', (req, res) => {
  const project = db.prepare(`
    SELECT p.*, c.name as client_name, c.company as client_company
    FROM tmp_projects p LEFT JOIN clients c ON p.client_id = c.id WHERE p.id = ?
  `).get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (isClientUser(req.user) && !projectOwnedByClient(project, req.user.clientId)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const plans = db.prepare('SELECT * FROM traffic_management_plans WHERE project_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json({ ...project, plans });
});

router.post('/', roleAtLeast('staff'), validate('project'), (req, res) => {
  const id = uuid();
  const { name, description, client_id, site_id, status, start_date, end_date } = req.validated;
  db.prepare('INSERT INTO tmp_projects (id, name, description, client_id, site_id, status, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, name, description || null, client_id || null, site_id || null, status || 'active', start_date || null, end_date || null);
  res.status(201).json({ id, name, status: status || 'active' });
});

router.put('/:id', roleAtLeast('staff'), validate('project'), (req, res) => {
  const existing = db.prepare('SELECT * FROM tmp_projects WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Project not found' });
  const { name, description, client_id, site_id, status, start_date, end_date } = req.validated;
  db.prepare('UPDATE tmp_projects SET name=?, description=?, client_id=?, site_id=?, status=?, start_date=?, end_date=?, updated_at=datetime(\'now\') WHERE id=?').run(name, description !== undefined ? (description || null) : existing.description, client_id !== undefined ? (client_id || null) : existing.client_id, site_id !== undefined ? (site_id || null) : existing.site_id, status !== undefined ? status : existing.status, start_date !== undefined ? (start_date || null) : existing.start_date, end_date !== undefined ? (end_date || null) : existing.end_date, req.params.id);
  res.json(db.prepare('SELECT * FROM tmp_projects WHERE id = ?').get(req.params.id));
});

router.delete('/:id', roleAtLeast('manager'), (req, res) => {
  const existing = db.prepare('SELECT id FROM tmp_projects WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Project not found' });
  const tmpCount = db.prepare('SELECT COUNT(*) as c FROM traffic_management_plans WHERE project_id = ?').get(req.params.id).c;
  if (tmpCount) return res.status(400).json({ error: `Project has ${tmpCount} TMPs - delete them first` });
  db.prepare('DELETE FROM tmp_projects WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
