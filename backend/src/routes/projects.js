import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const projects = db.prepare(`
    SELECT p.*, c.name as client_name, c.company as client_company,
      (SELECT COUNT(*) FROM traffic_management_plans WHERE project_id = p.id) as plan_count
    FROM tmp_projects p LEFT JOIN clients c ON p.client_id = c.id
    ORDER BY p.created_at DESC
  `).all();
  res.json(projects);
});

router.get('/:id', (req, res) => {
  const project = db.prepare(`
    SELECT p.*, c.name as client_name, c.company as client_company
    FROM tmp_projects p LEFT JOIN clients c ON p.client_id = c.id WHERE p.id = ?
  `).get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const plans = db.prepare('SELECT * FROM traffic_management_plans WHERE project_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json({ ...project, plans });
});

router.post('/', validate('project'), (req, res) => {
  const id = uuid();
  const { name, description, client_id, site_id, status, start_date, end_date } = req.validated;
  db.prepare('INSERT INTO tmp_projects (id, name, description, client_id, site_id, status, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, name, description || null, client_id || null, site_id || null, status || 'active', start_date || null, end_date || null);
  res.status(201).json({ id, name, status: status || 'active' });
});

router.put('/:id', validate('project'), (req, res) => {
  const existing = db.prepare('SELECT id FROM tmp_projects WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Project not found' });
  const { name, description, client_id, site_id, status, start_date, end_date } = req.validated;
  db.prepare('UPDATE tmp_projects SET name=?, description=?, client_id=?, site_id=?, status=?, start_date=?, end_date=?, updated_at=datetime("now") WHERE id=?').run(name, description || null, client_id || null, site_id || null, status || 'active', start_date || null, end_date || null, req.params.id);
  res.json(db.prepare('SELECT * FROM tmp_projects WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM tmp_projects WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Project not found' });
  res.json({ success: true });
});

export default router;
