import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { roleAtLeast, roleRank } from '../middleware/auth.js';
import { isClientUser, permitOwnedByClient } from '../middleware/scope.js';
import { validate } from '../middleware/validate.js';
import { incompleteRequiredStages, swapTemplateForEntity } from './workflows.js';
import { emitEvent } from '../events.js';

const router = Router();
router.use(authenticate);

function calculateSLA(authorityId, complexity, submissionDate) {
  const rule = db.prepare('SELECT * FROM sla_rules WHERE authority_id = ? AND complexity = ?').get(authorityId, complexity);
  if (!rule) {
    const fallbackDays = parseInt(db.prepare("SELECT value FROM settings WHERE key = 'default_sla_days'").get()?.value || '14', 10) || 14;
    const submission = new Date(submissionDate);
    const expected = new Date(submission);
    expected.setDate(expected.getDate() + fallbackDays);
    return {
      assessment_days: fallbackDays,
      public_notice_days: 0,
      buffer_days: 0,
      total_days: fallbackDays,
      expected_date: expected.toISOString().slice(0, 10),
      requires_public_notice: false
    };
  }
  const totalDays = rule.assessment_days + rule.buffer_days + (rule.requires_public_notice ? rule.public_notice_days : 0);
  const submission = new Date(submissionDate);
  const expected = new Date(submission);
  expected.setDate(expected.getDate() + totalDays);
  return {
    assessment_days: rule.assessment_days,
    public_notice_days: rule.public_notice_days,
    buffer_days: rule.buffer_days,
    total_days: totalDays,
    expected_date: expected.toISOString().slice(0, 10),
    requires_public_notice: !!rule.requires_public_notice
  };
}

function checkTriggers(permitId, tmpId) {
  const triggers = [];
  const tmp = db.prepare('SELECT * FROM traffic_management_plans WHERE id = ?').get(tmpId);
  if (!tmp || !tmp.site_id) return triggers;

  const withinSignals = db.prepare('SELECT COUNT(*) as c FROM signalised_intersections si LEFT JOIN permits p ON p.authority_id = si.authority_id WHERE p.id = ?').get(permitId);
  if (withinSignals && withinSignals.c > 0) {
    const existing = db.prepare("SELECT id FROM workflow_triggers WHERE permit_id = ? AND trigger_type = 'signalised_intersection_30m' AND is_resolved = 0").get(permitId);
    if (!existing) {
      const id = uuid();
      db.prepare("INSERT INTO workflow_triggers (id, permit_id, trigger_type, description) VALUES (?, ?, ?, ?)").run(id, permitId, 'signalised_intersection_30m', 'Site within 30m of signalised intersection - MRWA referral required');
      triggers.push({ id, type: 'signalised_intersection_30m' });
    }
  }

  const existingMrwa = db.prepare("SELECT id FROM workflow_triggers WHERE permit_id = ? AND trigger_type = 'mrwa_referral_required' AND is_resolved = 0").get(permitId);
  if (!existingMrwa) {
    const mrwaPermits = db.prepare("SELECT COUNT(*) as c FROM permits WHERE tmp_id = ? AND authority_id IN (SELECT id FROM authorities WHERE type = 'mrwa')").get(tmpId);
    if (mrwaPermits && mrwaPermits.c === 0) {
      const permit = db.prepare('SELECT * FROM permits WHERE id = ?').get(permitId);
      if (permit && permit.requires_mrwa) {
        const id = uuid();
        db.prepare("INSERT INTO workflow_triggers (id, permit_id, trigger_type, description) VALUES (?, ?, ?, ?)").run(id, permitId, 'mrwa_referral_required', 'MRWA referral required but no MRWA permit exists');
        triggers.push({ id, type: 'mrwa_referral_required' });
      }
    }
  }

  return triggers;
}

router.get('/', (req, res) => {
  let q = `SELECT p.*, au.name as authority_name, au.short_name as authority_short, au.type as authority_type,
    t.title as tmp_title, t.reference as tmp_reference, t.status as tmp_status
    FROM permits p
    LEFT JOIN authorities au ON p.authority_id = au.id
    LEFT JOIN traffic_management_plans t ON p.tmp_id = t.id`;
  const params = [];
  const conditions = [];
  const clientScope = isClientUser(req.user)
    ? { cond: 'p.tmp_id IN (SELECT t2.id FROM traffic_management_plans t2 INNER JOIN tmp_projects pp ON pp.id = t2.project_id WHERE pp.client_id = ?)', param: req.user.clientId }
    : null;
  if (clientScope) { conditions.push(clientScope.cond); params.push(clientScope.param); }
  if (req.query.status) { conditions.push('p.status = ?'); params.push(req.query.status); }
  if (req.query.authority_id) { conditions.push('p.authority_id = ?'); params.push(req.query.authority_id); }
  if (req.query.tmp_id) { conditions.push('p.tmp_id = ?'); params.push(req.query.tmp_id); }
  if (req.query.search) { conditions.push('(t.reference LIKE ? OR t.title LIKE ? OR au.name LIKE ?)'); const s = `%${req.query.search}%`; params.push(s, s, s); }
  if (conditions.length) q += ' WHERE ' + conditions.join(' AND ');
  q += ' ORDER BY p.created_at DESC';
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  const countQ = `SELECT COUNT(*) as total FROM permits p LEFT JOIN authorities au ON p.authority_id = au.id LEFT JOIN traffic_management_plans t ON p.tmp_id = t.id` + (conditions.length ? ' WHERE ' + conditions.join(' AND ') : '');
  const total = db.prepare(countQ).get(...params).total;
  q += ' LIMIT ? OFFSET ?';
  params.push(limit, offset);
  const data = db.prepare(q).all(...params);
  res.json({ data, total, page, limit, pages: Math.ceil(total / limit) });
});

router.get('/:id', (req, res) => {
  const permit = db.prepare(`
    SELECT p.*, au.name as authority_name, au.short_name as authority_short, au.type as authority_type, au.email as authority_email,
    t.title as tmp_title, t.reference as tmp_reference, t.site_id
    FROM permits p
    LEFT JOIN authorities au ON p.authority_id = au.id
    LEFT JOIN traffic_management_plans t ON p.tmp_id = t.id WHERE p.id = ?
  `).get(req.params.id);
  if (!permit) return res.status(404).json({ error: 'Permit not found' });
  if (isClientUser(req.user) && !permitOwnedByClient(permit, req.user.clientId)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const fees = db.prepare('SELECT * FROM permit_fees WHERE permit_id = ?').all(req.params.id);
  const triggers = db.prepare('SELECT * FROM workflow_triggers WHERE permit_id = ? ORDER BY created_at DESC').all(req.params.id);
  const subTasks = db.prepare('SELECT pt.*, au.name as authority_name FROM permit_sub_tasks pt LEFT JOIN authorities au ON pt.authority_id = au.id WHERE pt.permit_id = ?').all(req.params.id);
  let slaInfo = null;
  if (permit.submission_date && permit.complexity) {
    slaInfo = calculateSLA(permit.authority_id, permit.complexity, permit.submission_date);
  }
  res.json({ ...permit, fees, triggers, sub_tasks: subTasks, sla: slaInfo });
});

router.post('/', roleAtLeast('staff'), validate('permit'), (req, res) => {
  const id = uuid();
  const { tmp_id, authority_id, status, complexity, submission_date, approval_date, expiry_date, rejection_reason, is_within_30m_signals, requires_mrwa } = req.validated;
  const tmp = db.prepare('SELECT id, complexity FROM traffic_management_plans WHERE id = ?').get(tmp_id);
  if (!tmp) return res.status(404).json({ error: 'TMP not found' });
  const authority = db.prepare('SELECT id FROM authorities WHERE id = ?').get(authority_id);
  if (!authority) return res.status(400).json({ error: 'Authority not found' });
  const subDate = submission_date || new Date().toISOString().slice(0, 10);
  const permitComplexity = complexity || tmp.complexity || 'standard';
  db.prepare('INSERT INTO permits (id, tmp_id, authority_id, status, complexity, submission_date, approval_date, expiry_date, rejection_reason, is_within_30m_signals, requires_mrwa, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, tmp_id, authority_id, status || 'draft', permitComplexity, subDate, approval_date || null, expiry_date || null, rejection_reason || null, is_within_30m_signals ? 1 : 0, requires_mrwa ? 1 : 0, req.user.id);

  if (status === 'submitted' || status === 'under_review') {
    const sla = calculateSLA(authority_id, permitComplexity, subDate);
    if (sla) {
      db.prepare('UPDATE permits SET assessment_days = ?, expiry_date = ? WHERE id = ?').run(sla.total_days, sla.expected_date, id);
    }
  }

  const triggers = checkTriggers(id, tmp_id);
  emitEvent('permit.created', { id, tmp_id, authority_id, status: status || 'draft', complexity: permitComplexity, submission_date: subDate, created_by: req.user.id });
  res.status(201).json({ id, status: status || 'draft', triggers });
});

router.put('/:id', roleAtLeast('staff'), validate('permit'), (req, res) => {
  const existing = db.prepare('SELECT * FROM permits WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Permit not found' });
  const { tmp_id, authority_id, status, complexity, submission_date, approval_date, expiry_date, rejection_reason, is_within_30m_signals, requires_mrwa } = req.validated;
  const nextStatus = status || existing.status;
  if ((nextStatus === 'approved' || nextStatus === 'completed') && nextStatus !== existing.status) {
    const missing = incompleteRequiredStages('permit', req.params.id);
    if (missing.length) return res.status(400).json({ error: `Incomplete required workflow stages: ${missing.join(', ')}` });
  }

  db.prepare('UPDATE permits SET tmp_id=?, authority_id=?, status=?, complexity=?, submission_date=?, approval_date=?, expiry_date=?, rejection_reason=?, is_within_30m_signals=?, requires_mrwa=?, updated_at=datetime(\'now\') WHERE id=?').run(
    tmp_id || existing.tmp_id, authority_id || existing.authority_id, nextStatus, complexity || existing.complexity,
    submission_date || existing.submission_date, approval_date || existing.approval_date, expiry_date || existing.expiry_date,
    rejection_reason || existing.rejection_reason, is_within_30m_signals !== undefined ? (is_within_30m_signals ? 1 : 0) : existing.is_within_30m_signals,
    requires_mrwa !== undefined ? (requires_mrwa ? 1 : 0) : existing.requires_mrwa, req.params.id
  );

  if (status && status !== existing.status) {
    db.prepare('INSERT INTO plan_activities (id, tmp_id, user_id, action, description) VALUES (?, ?, ?, ?, ?)').run(uuid(), existing.tmp_id, req.user.id, 'permit_status_changed', `Permit ${existing.status} → ${status}`);
    emitEvent('permit.status_changed', { ...existing, ...db.prepare('SELECT * FROM permits WHERE id = ?').get(req.params.id) }, { previous_status: existing.status, by: req.user.id });
  }

  if (complexity && complexity !== existing.complexity) {
    swapTemplateForEntity('permit', req.params.id);
    emitEvent('permit.complexity_changed', { id: req.params.id, complexity, previous_complexity: existing.complexity }, { by: req.user.id });
  }

  if (status === 'submitted' || status === 'under_review') {
    const subDate = submission_date || existing.submission_date || new Date().toISOString().slice(0, 10);
    const sla = calculateSLA(authority_id || existing.authority_id, complexity || existing.complexity, subDate);
    if (sla) db.prepare('UPDATE permits SET assessment_days = ?, expiry_date = ? WHERE id = ?').run(sla.total_days, sla.expected_date, req.params.id);
  }

  if (status === 'approved') {
    db.prepare('UPDATE permits SET approval_date = datetime(\'now\') WHERE id = ? AND approval_date IS NULL').run(req.params.id);
  }

  const triggers = checkTriggers(req.params.id, existing.tmp_id);
  const updated = db.prepare('SELECT * FROM permits WHERE id = ?').get(req.params.id);
  res.json({ ...updated, triggers });
});

router.post('/bulk', roleAtLeast('staff'), (req, res) => {
  const { ids, action, status } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'No ids provided' });
  if (action === 'status') {
    if (!status) return res.status(400).json({ error: 'Status required' });
    if (status === 'approved' || status === 'completed') {
      const missingPerId = [];
      for (const id of ids) {
        const permit = db.prepare('SELECT id FROM permits WHERE id = ?').get(id);
        if (!permit) continue;
        const missing = incompleteRequiredStages('permit', id);
        if (missing.length) missingPerId.push(`${id}: ${missing.join(', ')}`);
      }
      if (missingPerId.length) return res.status(400).json({ error: 'Incomplete required workflow stages: ' + missingPerId.join(' | ') });
    }
    const stmt = db.prepare('UPDATE permits SET status = ?, updated_at = datetime(\'now\') WHERE id = ?');
    const act = db.prepare('INSERT INTO plan_activities (id, tmp_id, user_id, action, description) VALUES (?, ?, ?, ?, ?)');
    const tx = db.transaction((list) => {
      for (const id of list) {
        const r = stmt.run(status, id);
        if (r.changes) {
          const permit = db.prepare('SELECT tmp_id FROM permits WHERE id = ?').get(id);
          if (permit?.tmp_id) act.run(uuid(), permit.tmp_id, req.user.id, 'permit_status_changed', `Permit status → ${status} (bulk)`);
          emitEvent('permit.status_changed', { id, tmp_id: permit?.tmp_id, status }, { previous_status: null, by: req.user.id, bulk: true });
        }
      }
    });
    tx(ids);
  } else if (action === 'delete') {
    if (roleRank(req.user.role) < roleRank('manager')) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    const stmt = db.prepare('DELETE FROM permits WHERE id = ?');
    const tx = db.transaction((list) => { for (const id of list) stmt.run(id); });
    tx(ids);
  } else return res.status(400).json({ error: 'Invalid action' });
  res.json({ success: true, count: ids.length });
});

router.delete('/:id', roleAtLeast('manager'), (req, res) => {
  const result = db.prepare('DELETE FROM permits WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Permit not found' });
  res.json({ success: true });
});

// Fees
router.get('/:id/fees', (req, res) => {
  const permit = db.prepare('SELECT id, tmp_id FROM permits WHERE id = ?').get(req.params.id);
  if (!permit) return res.status(404).json({ error: 'Permit not found' });
  if (isClientUser(req.user) && !permitOwnedByClient(permit, req.user.clientId)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const fees = db.prepare('SELECT * FROM permit_fees WHERE permit_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json(fees);
});

router.post('/:id/fees', roleAtLeast('staff'), validate('permitFee'), (req, res) => {
  const id = uuid();
  const { fee_type, amount, status, bond_returned, due_date, paid_date } = req.validated;
  db.prepare('INSERT INTO permit_fees (id, permit_id, fee_type, amount, status, bond_returned, due_date, paid_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, req.params.id, fee_type, amount, status || 'pending', bond_returned ? 1 : 0, due_date || null, paid_date || null);
  emitEvent('fee.created', { id, permit_id: req.params.id, fee_type, amount, status: status || 'pending' }, { by: req.user.id });
  res.status(201).json({ id, fee_type, amount });
});

// Triggers
router.get('/:id/triggers', (req, res) => {
  const permit = db.prepare('SELECT id, tmp_id FROM permits WHERE id = ?').get(req.params.id);
  if (!permit) return res.status(404).json({ error: 'Permit not found' });
  if (isClientUser(req.user) && !permitOwnedByClient(permit, req.user.clientId)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const triggers = db.prepare('SELECT * FROM workflow_triggers WHERE permit_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json(triggers);
});

router.put('/:permitId/triggers/:triggerId/resolve', roleAtLeast('staff'), (req, res) => {
  const result = db.prepare('UPDATE workflow_triggers SET is_resolved = 1, resolved_at = datetime(\'now\'), resolved_by = ? WHERE id = ? AND permit_id = ?').run(req.user.id, req.params.triggerId, req.params.permitId);
  if (result.changes === 0) return res.status(404).json({ error: 'Trigger not found' });
  res.json({ success: true });
});

// SLA calculation endpoint
router.get('/calculate-sla/:authorityId', roleAtLeast('staff'), (req, res) => {
  const complexity = req.query.complexity || 'standard';
  const submissionDate = req.query.submission_date || new Date().toISOString().slice(0, 10);
  const sla = calculateSLA(req.params.authorityId, complexity, submissionDate);
  if (!sla) return res.status(404).json({ error: 'No SLA rule found for this authority and complexity' });
  res.json(sla);
});

export default router;
