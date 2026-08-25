import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { roleAtLeast } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { paginateResponse } from '../middleware/pagination.js';
import { deriveJurisdiction } from '../jurisdiction.js';

const router = Router();
router.use(authenticate);
router.use(roleAtLeast('staff'));

router.get('/', (req, res) => {
  const sites = db.prepare('SELECT * FROM sites ORDER BY created_at DESC').all();
  res.json(paginateResponse(req, sites));
});

router.get('/:id', (req, res) => {
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(req.params.id);
  if (!site) return res.status(404).json({ error: 'Site not found' });
  res.json(site);
});

router.post('/', validate('site'), (req, res) => {
  const id = uuid();
  const { name, road_name, suburb, state, postcode, latitude, longitude, description, road_class, speed_limit, aadt, pedestrian_activity, cyclist_activity, rail_corridor, school_zone, jurisdiction: providedJurisdiction } = req.validated;
  const jurisdiction = providedJurisdiction || deriveJurisdiction({ latitude, longitude, suburb, postcode, road_class });
  db.prepare('INSERT INTO sites (id, name, road_name, suburb, state, postcode, latitude, longitude, description, road_class, speed_limit, aadt, pedestrian_activity, cyclist_activity, rail_corridor, school_zone, jurisdiction) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, name, road_name || null, suburb || null, state || 'WA', postcode || null, latitude || null, longitude || null, description || null, road_class || null, speed_limit || null, aadt || null, pedestrian_activity || null, cyclist_activity || null, rail_corridor ? 1 : 0, school_zone ? 1 : 0, jurisdiction);
  res.status(201).json({ id, name, road_name, suburb, state, jurisdiction });
});

router.put('/:id', validate('site'), (req, res) => {
  const existing = db.prepare('SELECT * FROM sites WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Site not found' });
  const { name, road_name, suburb, state, postcode, latitude, longitude, description, road_class, speed_limit, aadt, pedestrian_activity, cyclist_activity, rail_corridor, school_zone, jurisdiction: providedJurisdiction } = req.validated;
  const nextSuburb = suburb !== undefined ? suburb : existing.suburb;
  const nextPostcode = postcode !== undefined ? postcode : existing.postcode;
  const nextLatitude = latitude !== undefined ? latitude : existing.latitude;
  const nextLongitude = longitude !== undefined ? longitude : existing.longitude;
  const nextRoadClass = road_class !== undefined ? road_class : existing.road_class;
  const jurisdiction = providedJurisdiction !== undefined ? providedJurisdiction : deriveJurisdiction({ latitude: nextLatitude, longitude: nextLongitude, suburb: nextSuburb, postcode: nextPostcode, road_class: nextRoadClass });
  db.prepare('UPDATE sites SET name=?, road_name=?, suburb=?, state=?, postcode=?, latitude=?, longitude=?, description=?, road_class=?, speed_limit=?, aadt=?, pedestrian_activity=?, cyclist_activity=?, rail_corridor=?, school_zone=?, jurisdiction=?, updated_at=datetime(\'now\') WHERE id=?').run(name, road_name !== undefined ? (road_name || null) : existing.road_name, suburb !== undefined ? (suburb || null) : existing.suburb, state !== undefined ? (state || 'WA') : existing.state, postcode !== undefined ? (postcode || null) : existing.postcode, latitude !== undefined ? latitude : existing.latitude, longitude !== undefined ? longitude : existing.longitude, description !== undefined ? (description || null) : existing.description, road_class !== undefined ? (road_class || null) : existing.road_class, speed_limit !== undefined ? speed_limit : existing.speed_limit, aadt !== undefined ? aadt : existing.aadt, pedestrian_activity !== undefined ? (pedestrian_activity || null) : existing.pedestrian_activity, cyclist_activity !== undefined ? (cyclist_activity || null) : existing.cyclist_activity, rail_corridor !== undefined ? (rail_corridor ? 1 : 0) : existing.rail_corridor, school_zone !== undefined ? (school_zone ? 1 : 0) : existing.school_zone, jurisdiction, req.params.id);
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
