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
  const existing = db.prepare('SELECT id FROM sites WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Site not found' });
  const { name, road_name, suburb, state, postcode, latitude, longitude, description } = req.validated;
  db.prepare('UPDATE sites SET name=?, road_name=?, suburb=?, state=?, postcode=?, latitude=?, longitude=?, description=?, updated_at=datetime("now") WHERE id=?').run(name, road_name || null, suburb || null, state || 'WA', postcode || null, latitude || null, longitude || null, description || null, req.params.id);
  res.json(db.prepare('SELECT * FROM sites WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM sites WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Site not found' });
  res.json({ success: true });
});

export default router;
