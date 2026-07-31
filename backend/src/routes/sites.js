import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const sites = db.prepare('SELECT * FROM sites ORDER BY created_at DESC').all();
  res.json(sites);
});

router.get('/:id', (req, res) => {
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(req.params.id);
  if (!site) return res.status(404).json({ error: 'Site not found' });
  res.json(site);
});

router.post('/', validate('site'), (req, res) => {
  const id = uuid();
  const { name, road_name, suburb, state, postcode, latitude, longitude, description } = req.validated;
  db.prepare('INSERT INTO sites (id, name, road_name, suburb, state, postcode, latitude, longitude, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, name, road_name || null, suburb || null, state || 'WA', postcode || null, latitude || null, longitude || null, description || null);
  res.status(201).json({ id, name, road_name, suburb, state });
});

router.put('/:id', validate('site'), (req, res) => {
  const existing = db.prepare('SELECT * FROM sites WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Site not found' });
  const { name, road_name, suburb, state, postcode, latitude, longitude, description } = req.validated;
  db.prepare('UPDATE sites SET name=?, road_name=?, suburb=?, state=?, postcode=?, latitude=?, longitude=?, description=?, updated_at=datetime(\'now\') WHERE id=?').run(name, road_name !== undefined ? (road_name || null) : existing.road_name, suburb !== undefined ? (suburb || null) : existing.suburb, state !== undefined ? (state || 'WA') : existing.state, postcode !== undefined ? (postcode || null) : existing.postcode, latitude !== undefined ? latitude : existing.latitude, longitude !== undefined ? longitude : existing.longitude, description !== undefined ? (description || null) : existing.description, req.params.id);
  res.json(db.prepare('SELECT * FROM sites WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM sites WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Site not found' });
  const tmpCount = db.prepare('SELECT COUNT(*) as c FROM traffic_management_plans WHERE site_id = ?').get(req.params.id).c;
  const projectCount = db.prepare('SELECT COUNT(*) as c FROM tmp_projects WHERE site_id = ?').get(req.params.id).c;
  if (tmpCount || projectCount) return res.status(400).json({ error: `Site is used by ${tmpCount} TMPs and ${projectCount} projects - delete them first` });
  db.prepare('DELETE FROM sites WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
