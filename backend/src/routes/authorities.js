import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import multer from 'multer';
import { createRequire } from 'module';
import db from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { deserializeAuthority, upsertDirectoryEntries } from '../seed-directory.js';
import { buildDirectory } from '../lga-directory.js';

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

const router = Router();
router.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }
});

const JSON_FIELDS = ['councillors', 'suburbs', 'statistics'];
const DIRECTORY_FIELDS = ['council_type', 'abn', 'band', 'suburb', 'postcode', 'mayor', 'deputy', 'ceo', 'councillors', 'executive_team', 'suburbs', 'meeting_schedule', 'map_coordinates', 'zone', 'statistics'];

function toStore(value) {
  return value == null ? null : JSON.stringify(value);
}

function listAuthorities() {
  return db.prepare('SELECT * FROM authorities ORDER BY name').all().map(deserializeAuthority);
}

router.get('/', (req, res) => {
  res.json(listAuthorities());
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
  res.json({ ...deserializeAuthority(authority), sla_rules: slaRules, signalised_intersections: intersections });
});

router.post('/', validate('authority'), (req, res) => {
  const id = uuid();
  const { name, short_name, type, email, phone, website, address, contact_person } = req.validated;
  const d = req.validated;
  db.prepare(`INSERT INTO authorities (
    id, name, short_name, type, email, phone, website, address, contact_person,
    council_type, abn, band, suburb, postcode, mayor, deputy, ceo, councillors,
    executive_team, suburbs, meeting_schedule, map_coordinates, zone, statistics
  ) VALUES (
    @id, @name, @short_name, @type, @email, @phone, @website, @address, @contact_person,
    @council_type, @abn, @band, @suburb, @postcode, @mayor, @deputy, @ceo, @councillors,
    @executive_team, @suburbs, @meeting_schedule, @map_coordinates, @zone, @statistics
  )`).run({
    id, name, short_name: short_name || null, type: type || 'other',
    email: email || null, phone: phone || null, website: website || null,
    address: address || null, contact_person: contact_person || null,
    council_type: d.council_type || null, abn: d.abn || null, band: d.band ?? null,
    suburb: d.suburb || null, postcode: d.postcode || null, mayor: d.mayor || null,
    deputy: d.deputy || null, ceo: d.ceo || null, councillors: toStore(d.councillors),
    executive_team: d.executive_team || null, suburbs: toStore(d.suburbs),
    meeting_schedule: d.meeting_schedule || null, map_coordinates: d.map_coordinates || null,
    zone: d.zone || null, statistics: toStore(d.statistics)
  });
  res.status(201).json({ id, name, short_name });
});

router.put('/:id', validate('authority'), (req, res) => {
  const existing = db.prepare('SELECT * FROM authorities WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Authority not found' });
  const v = req.validated;
  const val = (key, fallback) => (v[key] !== undefined ? v[key] : fallback);
  const jsonVal = (key, fallback) => (v[key] !== undefined ? toStore(v[key]) : fallback);
  db.prepare(`UPDATE authorities SET
    name=@name, short_name=@short_name, type=@type, email=@email, phone=@phone,
    website=@website, address=@address, contact_person=@contact_person,
    council_type=@council_type, abn=@abn, band=@band, suburb=@suburb, postcode=@postcode,
    mayor=@mayor, deputy=@deputy, ceo=@ceo, councillors=@councillors,
    executive_team=@executive_team, suburbs=@suburbs, meeting_schedule=@meeting_schedule,
    map_coordinates=@map_coordinates, zone=@zone, statistics=@statistics,
    updated_at=datetime('now')
    WHERE id=@id
  `).run({
    id: req.params.id,
    name: v.name !== undefined ? v.name : existing.name,
    short_name: val('short_name', existing.short_name),
    type: val('type', existing.type),
    email: val('email', existing.email),
    phone: val('phone', existing.phone),
    website: val('website', existing.website),
    address: val('address', existing.address),
    contact_person: val('contact_person', existing.contact_person),
    council_type: val('council_type', existing.council_type),
    abn: val('abn', existing.abn),
    band: val('band', existing.band),
    suburb: val('suburb', existing.suburb),
    postcode: val('postcode', existing.postcode),
    mayor: val('mayor', existing.mayor),
    deputy: val('deputy', existing.deputy),
    ceo: val('ceo', existing.ceo),
    councillors: jsonVal('councillors', existing.councillors),
    executive_team: val('executive_team', existing.executive_team),
    suburbs: jsonVal('suburbs', existing.suburbs),
    meeting_schedule: val('meeting_schedule', existing.meeting_schedule),
    map_coordinates: val('map_coordinates', existing.map_coordinates),
    zone: val('zone', existing.zone),
    statistics: jsonVal('statistics', existing.statistics)
  });
  res.json(deserializeAuthority(db.prepare('SELECT * FROM authorities WHERE id = ?').get(req.params.id)));
});

router.post('/import-directory', authorize('admin'), upload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No PDF uploaded (field name: pdf)' });
  try {
    const parsed = await new PDFParse({ data: req.file.buffer }).getText();
    const entries = buildDirectory(parsed.text);
    if (!entries.length) return res.status(400).json({ error: 'Could not read any local government entries from the PDF' });
    const result = upsertDirectoryEntries(entries, 'WALGA Local Government Directory (import)');
    res.json({ ...result, total: entries.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to parse PDF: ' + err.message });
  }
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
