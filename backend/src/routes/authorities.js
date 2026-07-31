import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const authorities = db.prepare('SELECT * FROM authorities ORDER BY name').all();
  res.json(authorities);
});

router.get('/cost-codes', (req, res) => {
  res.json([
    { code: 'TMP-DESIGN', name: 'TMP Design', billable: true },
    { code: 'TMP-LGA-LIAISON', name: 'LGA Liaison', billable: true },
    { code: 'TMP-MRWA-LIAISON', name: 'MRWA Liaison', billable: true },
    { code: 'TMP-PTA-LIAISON', name: 'PTA Liaison', billable: true },
    { code: 'TMP-HVS-LIAISON', name: 'HVS Liaison', billable: true },
    { code: 'TMP-SUBMISSION', name: 'Submission', billable: true },
    { code: 'TMP-REVISION-INT', name: 'Internal Revision', billable: false },
    { code: 'TMP-REVISION-EXT', name: 'External Revision', billable: true },
    { code: 'TMP-SITE-VISIT', name: 'Site Visit', billable: true },
    { code: 'TMP-MEETING', name: 'Meeting', billable: true },
    { code: 'TMP-ADMIN', name: 'Administration', billable: false },
    { code: 'TMP-RESEARCH', name: 'Research', billable: false }
  ]);
});

router.get('/signalised-intersections', (req, res) => {
  let q = 'SELECT si.*, a.name as authority_name, a.short_name as authority_short FROM signalised_intersections si LEFT JOIN authorities a ON si.authority_id = a.id';
  const params = [];
  if (req.query.authority_id) { q += ' WHERE si.authority_id = ?'; params.push(req.query.authority_id); }
  q += ' ORDER BY si.intersection_name';
  res.json(db.prepare(q).all(...params));
});

router.post('/signalised-intersections', authenticate, (req, res) => {
  const id = uuid();
  const { authority_id, intersection_name, road_name, suburb, distance_meters, is_mandatory, notes } = req.body;
  db.prepare('INSERT INTO signalised_intersections (id, authority_id, intersection_name, road_name, suburb, distance_meters, is_mandatory, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, authority_id, intersection_name, road_name || null, suburb || null, distance_meters || 30, is_mandatory !== undefined ? (is_mandatory ? 1 : 0) : 1, notes || null);
  res.status(201).json({ id, intersection_name });
});

router.get('/:id', (req, res) => {
  const authority = db.prepare('SELECT * FROM authorities WHERE id = ?').get(req.params.id);
  if (!authority) return res.status(404).json({ error: 'Authority not found' });
  const slaRules = db.prepare('SELECT * FROM sla_rules WHERE authority_id = ? ORDER BY complexity').all(req.params.id);
  const intersections = db.prepare('SELECT * FROM signalised_intersections WHERE authority_id = ?').all(req.params.id);
  res.json({ ...authority, sla_rules: slaRules, signalised_intersections: intersections });
});

router.post('/', validate('authority'), (req, res) => {
  const id = uuid();
  const { name, short_name, type, email, phone, website, address, contact_person } = req.validated;
  db.prepare('INSERT INTO authorities (id, name, short_name, type, email, phone, website, address, contact_person) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, name, short_name || null, type || 'other', email || null, phone || null, website || null, address || null, contact_person || null);
  res.status(201).json({ id, name, short_name });
});

router.put('/:id', validate('authority'), (req, res) => {
  const existing = db.prepare('SELECT * FROM authorities WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Authority not found' });
  const { name, short_name, type, email, phone, website, address, contact_person } = req.validated;
  db.prepare('UPDATE authorities SET name=?, short_name=?, type=?, email=?, phone=?, website=?, address=?, contact_person=?, updated_at=datetime(\'now\') WHERE id=?').run(name, short_name !== undefined ? (short_name || null) : existing.short_name, type !== undefined ? (type || 'other') : existing.type, email !== undefined ? (email || null) : existing.email, phone !== undefined ? (phone || null) : existing.phone, website !== undefined ? (website || null) : existing.website, address !== undefined ? (address || null) : existing.address, contact_person !== undefined ? (contact_person || null) : existing.contact_person, req.params.id);
  res.json(db.prepare('SELECT * FROM authorities WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM authorities WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Authority not found' });
  const permitCount = db.prepare('SELECT COUNT(*) as c FROM permits WHERE authority_id = ?').get(req.params.id).c;
  const taskCount = db.prepare('SELECT COUNT(*) as c FROM permit_sub_tasks WHERE authority_id = ?').get(req.params.id).c;
  if (permitCount || taskCount) return res.status(400).json({ error: `Authority is used by ${permitCount} permits and ${taskCount} sub-tasks - delete them first` });
  db.prepare('DELETE FROM authorities WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// SLA Rules
router.get('/:id/sla-rules', (req, res) => {
  const rules = db.prepare('SELECT * FROM sla_rules WHERE authority_id = ? ORDER BY complexity').all(req.params.id);
  res.json(rules);
});

router.post('/:id/sla-rules', validate('slaRule'), (req, res) => {
  const id = uuid();
  const { complexity, assessment_days, public_notice_days, buffer_days, requires_public_notice } = req.validated;
  db.prepare('INSERT INTO sla_rules (id, authority_id, complexity, assessment_days, public_notice_days, buffer_days, requires_public_notice) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, req.params.id, complexity, assessment_days, public_notice_days || 0, buffer_days || 0, requires_public_notice ? 1 : 0);
  res.status(201).json({ id, complexity, assessment_days });
});

router.delete('/:authorityId/sla-rules/:ruleId', (req, res) => {
  const result = db.prepare('DELETE FROM sla_rules WHERE id = ? AND authority_id = ?').run(req.params.ruleId, req.params.authorityId);
  if (result.changes === 0) return res.status(404).json({ error: 'SLA rule not found' });
  res.json({ success: true });
});

export default router;
