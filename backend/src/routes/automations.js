import { Router } from 'express';
import db from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { evaluateAndExecute } from '../automation-engine.js';
import { PRESETS, installPreset } from '../automation-presets.js';
import { runScheduledChecks } from '../scheduler.js';

const router = Router();
router.use(authenticate);

const ENTITY_TYPES = ['tmp', 'permit', 'fee', 'document'];

function parseRuleBody(body) {
  const { name, description, entity_type, event_type, conditions, actions, is_active, priority, cooldown_hours, dedupe_key_template } = body || {};
  if (!name || !name.trim()) return { error: 'Rule name required' };
  if (!entity_type || !ENTITY_TYPES.includes(entity_type)) return { error: 'Valid entity_type required (tmp, permit, fee, document)' };
  if (!event_type || !event_type.trim()) return { error: 'Event type required' };
  const conds = Array.isArray(conditions) ? conditions : [];
  const acts = Array.isArray(actions) ? actions : [];
  if (!acts.length) return { error: 'At least one action required' };
  for (const c of conds) {
    if (!c.field || !c.op) return { error: 'Each condition needs a field and operator' };
    if (!['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in', 'exists'].includes(c.op)) return { error: `Invalid condition operator: ${c.op}` };
  }
  for (const a of acts) {
    if (!a.type) return { error: 'Each action needs a type' };
  }
  return {
    data: {
      name: name.trim(),
      description: description || null,
      entity_type,
      event_type: event_type.trim(),
      conditions_json: JSON.stringify(conds),
      actions_json: JSON.stringify(acts),
      is_active: is_active !== undefined ? (is_active ? 1 : 0) : 1,
      priority: Math.max(-100, Math.min(100, parseInt(priority) || 0)),
      cooldown_hours: Math.max(0, parseInt(cooldown_hours) || 0),
      dedupe_key_template: dedupe_key_template || null
    }
  };
}

router.get('/rules', (req, res) => {
  let q = 'SELECT * FROM automation_rules';
  const params = [];
  const where = [];
  if (req.query.entity_type) { where.push('entity_type = ?'); params.push(req.query.entity_type); }
  if (req.query.event_type) { where.push('event_type = ?'); params.push(req.query.event_type); }
  if (req.query.active === 'true' || req.query.active === '1') where.push('is_active = 1');
  if (where.length) q += ' WHERE ' + where.join(' AND ');
  q += ' ORDER BY priority DESC, created_at DESC';
  res.json({ data: db.prepare(q).all(...params) });
});

router.get('/rules/:id', (req, res) => {
  const rule = db.prepare('SELECT * FROM automation_rules WHERE id = ?').get(req.params.id);
  if (!rule) return res.status(404).json({ error: 'Rule not found' });
  let conditions = [];
  let actions = [];
  try { conditions = rule.conditions_json ? JSON.parse(rule.conditions_json) : []; } catch {}
  try { actions = rule.actions_json ? JSON.parse(rule.actions_json) : []; } catch {}
  res.json({ ...rule, conditions, actions });
});

router.post('/rules', authorize('admin'), (req, res) => {
  const parsed = parseRuleBody(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const id = `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const d = parsed.data;
  db.prepare(`
    INSERT INTO automation_rules (id, name, description, is_active, entity_type, event_type, conditions_json, actions_json, priority, cooldown_hours, dedupe_key_template, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, d.name, d.description, d.is_active, d.entity_type, d.event_type, d.conditions_json, d.actions_json, d.priority, d.cooldown_hours, d.dedupe_key_template, req.user.id);
  res.status(201).json(db.prepare('SELECT * FROM automation_rules WHERE id = ?').get(id));
});

router.put('/rules/:id', authorize('admin'), (req, res) => {
  const existing = db.prepare('SELECT * FROM automation_rules WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Rule not found' });
  const parsed = parseRuleBody(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const d = parsed.data;
  db.prepare(`
    UPDATE automation_rules SET name=?, description=?, is_active=?, entity_type=?, event_type=?, conditions_json=?, actions_json=?, priority=?, cooldown_hours=?, dedupe_key_template=?, updated_at=datetime('now') WHERE id=?
  `).run(d.name, d.description, d.is_active, d.entity_type, d.event_type, d.conditions_json, d.actions_json, d.priority, d.cooldown_hours, d.dedupe_key_template, req.params.id);
  res.json(db.prepare('SELECT * FROM automation_rules WHERE id = ?').get(req.params.id));
});

router.delete('/rules/:id', authorize('admin'), (req, res) => {
  const result = db.prepare('DELETE FROM automation_rules WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Rule not found' });
  res.json({ success: true });
});

router.post('/rules/:id/test', authorize('admin'), (req, res) => {
  const rule = db.prepare('SELECT * FROM automation_rules WHERE id = ?').get(req.params.id);
  if (!rule) return res.status(404).json({ error: 'Rule not found' });
  const { entity_type, entity_id } = req.body || {};
  if (!entity_id) return res.status(400).json({ error: 'entity_id required to test against' });
  let entity = null;
  if (entity_type === 'permit') {
    entity = db.prepare(`
      SELECT pe.*, t.reference as tmp_reference, t.title as tmp_title, t.created_by as tmp_created_by
      FROM permits pe LEFT JOIN traffic_management_plans t ON pe.tmp_id = t.id WHERE pe.id = ?
    `).get(entity_id);
  } else if (entity_type === 'tmp') {
    entity = db.prepare('SELECT * FROM traffic_management_plans WHERE id = ?').get(entity_id);
  } else {
    return res.status(400).json({ error: 'entity_type must be tmp or permit' });
  }
  if (!entity) return res.status(404).json({ error: 'Entity not found' });
  const event = { type: rule.event_type, entity, payload: {} };
  evaluateAndExecute(rule, event, { dryRun: true }).then(result => res.json(result));
});

router.get('/rules/:id/runs', (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const runs = db.prepare('SELECT * FROM automation_runs WHERE rule_id = ? ORDER BY created_at DESC LIMIT ?').all(req.params.id, limit);
  res.json({ data: runs });
});

router.get('/runs', (req, res) => {
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
  const where = [];
  const params = [];
  if (req.query.rule_id) { where.push('r.rule_id = ?'); params.push(req.query.rule_id); }
  if (req.query.status) { where.push('r.status = ?'); params.push(req.query.status); }
  const runs = db.prepare(`
    SELECT r.*, ru.name as rule_name
    FROM automation_runs r
    LEFT JOIN automation_rules ru ON r.rule_id = ru.id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY r.created_at DESC LIMIT ?
  `).all(...params, limit);
  res.json({ data: runs });
});

router.get('/presets', (req, res) => {
  const installed = db.prepare('SELECT id FROM automation_rules').all().map(r => r.id);
  res.json({ data: PRESETS.map(p => ({ ...p, installed: installed.includes(p.id) })) });
});

router.post('/presets/:id/install', authorize('admin'), (req, res) => {
  const result = installPreset(req.params.id);
  if (!result) return res.status(404).json({ error: 'Preset not found' });
  res.json({ success: true, ...result });
});

router.post('/run-scheduled', authorize('admin'), (req, res) => {
  const result = runScheduledChecks();
  res.json({ success: true, ...result });
});

export default router;
