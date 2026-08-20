import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authenticate, roleAtLeast } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { seedComplianceRules, runComplianceCheck, unresolvedComplianceViolations, latestComplianceSummary } from '../compliance/ruleset.js';

const router = Router();
router.use(authenticate);
router.use(roleAtLeast('staff'));

router.get('/rules', (req, res) => {
  const { authority_id, work_type } = req.query;
  let rows = db.prepare('SELECT * FROM compliance_rules ORDER BY sort_order, name').all();
  if (authority_id) rows = rows.filter((r) => !r.authority_id || r.authority_id === authority_id);
  if (work_type) rows = rows.filter((r) => !r.work_type || r.work_type === work_type);
  res.json(rows.map(deserializeRule));
});

router.post('/rules/seed', roleAtLeast('developer'), (req, res) => {
  const count = seedComplianceRules();
  res.json({ success: true, seeded: count });
});

router.post('/rules', roleAtLeast('developer'), validate('rule'), (req, res) => {
  const r = req.validated;
  if (!r.condition || !r.message || !r.name) {
    return res.status(400).json({ error: 'name, condition and message are required' });
  }
  const id = req.body.id || uuid();
  db.prepare(`INSERT INTO compliance_rules (id, authority_id, state, work_type, category, name, description, condition, message, guidance, severity, is_active, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, r.authority_id || null, r.state || 'WA', r.work_type || null, r.category || 'General',
    r.name, r.description || '', JSON.stringify(r.condition), r.message, r.guidance || null,
    r.severity || 'violation', r.is_active === false ? 0 : 1, r.sort_order || 0
  );
  res.status(201).json(deserializeRule(db.prepare('SELECT * FROM compliance_rules WHERE id = ?').get(id)));
});

router.put('/rules/:id', roleAtLeast('developer'), validate('rule'), (req, res) => {
  const existing = db.prepare('SELECT * FROM compliance_rules WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Rule not found' });
  const r = req.validated;
  db.prepare(`UPDATE compliance_rules SET authority_id=?, state=?, work_type=?, category=?, name=?, description=?, condition=?, message=?, guidance=?, severity=?, is_active=?, sort_order=?, updated_at=datetime('now') WHERE id=?`).run(
    r.authority_id !== undefined ? r.authority_id : existing.authority_id,
    r.state !== undefined ? r.state : existing.state,
    r.work_type !== undefined ? r.work_type : existing.work_type,
    r.category !== undefined ? r.category : existing.category,
    r.name !== undefined ? r.name : existing.name,
    r.description !== undefined ? r.description : existing.description,
    r.condition !== undefined ? JSON.stringify(r.condition) : existing.condition,
    r.message !== undefined ? r.message : existing.message,
    r.guidance !== undefined ? r.guidance : existing.guidance,
    r.severity !== undefined ? r.severity : existing.severity,
    r.is_active !== undefined ? (r.is_active ? 1 : 0) : existing.is_active,
    r.sort_order !== undefined ? r.sort_order : existing.sort_order,
    req.params.id
  );
  res.json(deserializeRule(db.prepare('SELECT * FROM compliance_rules WHERE id = ?').get(req.params.id)));
});

router.delete('/rules/:id', roleAtLeast('developer'), (req, res) => {
  const existing = db.prepare('SELECT id FROM compliance_rules WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Rule not found' });
  db.prepare('DELETE FROM compliance_rules WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.post('/check', (req, res) => {
  const { tmp_id } = req.body || {};
  if (!tmp_id) return res.status(400).json({ error: 'tmp_id is required' });
  const tmp = db.prepare('SELECT id FROM traffic_management_plans WHERE id = ?').get(tmp_id);
  if (!tmp) return res.status(404).json({ error: 'TMP not found' });
  const result = runComplianceCheck(tmp_id);
  res.json(result);
});

router.get('/tgs/:tmpId', (req, res) => {
  const tmp = db.prepare('SELECT id FROM traffic_management_plans WHERE id = ?').get(req.params.tmpId);
  if (!tmp) return res.status(404).json({ error: 'TMP not found' });
  const row = db.prepare('SELECT * FROM tgs WHERE tmp_id = ?').get(req.params.tmpId);
  const tgs = row ? { ...row, layout: row.layout_json ? JSON.parse(row.layout_json) : {}, check: latestComplianceSummary(req.params.tmpId) } : null;
  res.json({ tgs, check: tgs?.check || null });
});

router.put('/tgs/:tmpId', validate('tgs'), (req, res) => {
  const tmp = db.prepare('SELECT id, work_type FROM traffic_management_plans WHERE id = ?').get(req.params.tmpId);
  if (!tmp) return res.status(404).json({ error: 'TMP not found' });
  const { work_type, layout, resolutions } = req.validated;
  const existing = db.prepare('SELECT * FROM tgs WHERE tmp_id = ?').get(req.params.tmpId);
  const workType = work_type || layout?.work_type || tmp.work_type || 'general';
  const mergedLayout = {
    ...(existing?.layout_json ? JSON.parse(existing.layout_json) : {}),
    ...(layout || {}),
    work_type: workType
  };
  const priorSummary = existing?.check_summary_json ? JSON.parse(existing.check_summary_json) : {};

  if (existing) {
    db.prepare('UPDATE tgs SET work_type=?, layout_json=?, updated_at=datetime(\'now\') WHERE tmp_id=?').run(
      workType, JSON.stringify(mergedLayout), req.params.tmpId
    );
  } else {
    db.prepare('INSERT INTO tgs (id, tmp_id, work_type, layout_json) VALUES (?, ?, ?, ?)').run(
      uuid(), req.params.tmpId, workType, JSON.stringify(mergedLayout)
    );
  }

  if (tmp.work_type !== workType) {
    db.prepare('UPDATE traffic_management_plans SET work_type=?, updated_at=datetime(\'now\') WHERE id=?').run(workType, req.params.tmpId);
  }

  const check = runComplianceCheck(req.params.tmpId);
  if (resolutions && Object.keys(resolutions).length) {
    const merged = { ...check, resolutions: { ...(priorSummary.resolutions || {}), ...resolutions } };
    db.prepare('UPDATE tgs SET check_summary_json=?, updated_at=datetime(\'now\') WHERE tmp_id=?').run(JSON.stringify(merged), req.params.tmpId);
    const updated = { ...merged, findings: (merged.findings || []).map((f) => ({ ...f, resolved: !!merged.resolutions[f.rule_id] })) };
    const row = db.prepare('SELECT * FROM tgs WHERE tmp_id = ?').get(req.params.tmpId);
    res.status(200).json({ tgs: { ...row, layout: JSON.parse(row.layout_json), check: updated }, check: updated });
    return;
  }

  const row = db.prepare('SELECT * FROM tgs WHERE tmp_id = ?').get(req.params.tmpId);
  res.status(200).json({ tgs: { ...row, layout: JSON.parse(row.layout_json), check }, check });
});

// Short-cut for the submit gate and any diagnostics that need the unresolved list.
router.get('/tgs/:tmpId/violations', (req, res) => {
  res.json({ violations: unresolvedComplianceViolations(req.params.tmpId) });
});

function deserializeRule(r) {
  if (!r) return null;
  return { ...r, condition: JSON.parse(r.condition), is_active: !!r.is_active };
}

export default router;