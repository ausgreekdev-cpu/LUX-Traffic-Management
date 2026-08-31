import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { roleAtLeast } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { paginateResponse } from '../middleware/pagination.js';
import { getTenantId } from '../middleware/tenant.js';

const router = Router();
router.use(authenticate);
router.use(roleAtLeast('staff'));

router.get('/', (req, res) => {
  let q = `SELECT te.*, t.title as tmp_title, t.reference as tmp_reference, u.name as user_name
    FROM time_entries te
    LEFT JOIN traffic_management_plans t ON te.tmp_id = t.id
    LEFT JOIN users u ON te.user_id = u.id`;
  const params = [];
  const conditions = [];
  const tenantId = getTenantId(req);
  if (tenantId) { try { conditions.push('te.tenant_id = ?'); params.push(tenantId); } catch {} }
  if (req.query.tmp_id) { conditions.push('te.tmp_id = ?'); params.push(req.query.tmp_id); }
  if (req.query.user_id) { conditions.push('te.user_id = ?'); params.push(req.query.user_id); }
  if (req.query.cost_code) { conditions.push('te.cost_code = ?'); params.push(req.query.cost_code); }
  if (conditions.length) q += ' WHERE ' + conditions.join(' AND ');
  q += ' ORDER BY te.date DESC, te.created_at DESC';
  try { res.json(paginateResponse(req, db.prepare(q).all(...params))); }
  catch { // fallback if tenant_id column missing
    let q2 = `SELECT te.*, t.title as tmp_title, t.reference as tmp_reference, u.name as user_name
      FROM time_entries te
      LEFT JOIN traffic_management_plans t ON te.tmp_id = t.id
      LEFT JOIN users u ON te.user_id = u.id`;
    const p2 = []; const c2 = [];
    if (req.query.tmp_id) { c2.push('te.tmp_id = ?'); p2.push(req.query.tmp_id); }
    if (req.query.user_id) { c2.push('te.user_id = ?'); p2.push(req.query.user_id); }
    if (req.query.cost_code) { c2.push('te.cost_code = ?'); p2.push(req.query.cost_code); }
    if (c2.length) q2 += ' WHERE ' + c2.join(' AND ');
    q2 += ' ORDER BY te.date DESC, te.created_at DESC';
    res.json(paginateResponse(req, db.prepare(q2).all(...p2)));
  }
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

router.get('/summary', (req, res) => {
  const periodDays = parseInt(req.query.period_days || '30');
  const cutoff = new Date(Date.now() - periodDays * 86400000).toISOString().slice(0, 10);
  const tenantId = getTenantId(req);
  let summary, totals;
  try {
    if (tenantId) {
      summary = db.prepare(`SELECT cost_code, COUNT(*) as entries, SUM(duration_hours) as total_hours, SUM(CASE WHEN is_billable = 1 THEN total_cost ELSE 0 END) as total_cost FROM time_entries WHERE date >= ? AND tenant_id = ? GROUP BY cost_code ORDER BY total_hours DESC`).all(cutoff, tenantId);
      totals = db.prepare(`SELECT COUNT(*) as total_entries, SUM(duration_hours) as total_hours, SUM(CASE WHEN is_billable = 1 THEN total_cost ELSE 0 END) as billable_cost, SUM(CASE WHEN is_billable = 0 THEN duration_hours ELSE 0 END) as non_billable_hours FROM time_entries WHERE date >= ? AND tenant_id = ?`).get(cutoff, tenantId);
    } else throw new Error('no tenant');
  } catch {
    summary = db.prepare(`SELECT cost_code, COUNT(*) as entries, SUM(duration_hours) as total_hours, SUM(CASE WHEN is_billable = 1 THEN total_cost ELSE 0 END) as total_cost FROM time_entries WHERE date >= ? GROUP BY cost_code ORDER BY total_hours DESC`).all(cutoff);
    totals = db.prepare(`SELECT COUNT(*) as total_entries, SUM(duration_hours) as total_hours, SUM(CASE WHEN is_billable = 1 THEN total_cost ELSE 0 END) as billable_cost, SUM(CASE WHEN is_billable = 0 THEN duration_hours ELSE 0 END) as non_billable_hours FROM time_entries WHERE date >= ?`).get(cutoff);
  }
  res.json({ summary, totals, period_days: periodDays });
});

router.post('/', validate('timeEntry'), (req, res) => {
  const id = uuid();
  const { tmp_id, cost_code, description, duration_hours, rate_per_hour, is_billable, date } = req.validated;
  const tenantId = getTenantId(req);
  let effectiveTenantId = tenantId;
  if (tmp_id) {
    try { const t = db.prepare('SELECT tenant_id FROM traffic_management_plans WHERE id = ?').get(tmp_id); if (t?.tenant_id) effectiveTenantId = t.tenant_id; } catch {}
  }
  if (tenantId && effectiveTenantId && tenantId !== effectiveTenantId) return res.status(403).json({ error: 'Tenant mismatch' });
  try { db.prepare('INSERT INTO time_entries (id, tmp_id, user_id, cost_code, description, duration_hours, rate_per_hour, is_billable, date, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, tmp_id, req.user.id, cost_code, description || null, duration_hours, rate_per_hour || 150, is_billable !== undefined ? (is_billable ? 1 : 0) : 1, date, effectiveTenantId); }
  catch { db.prepare('INSERT INTO time_entries (id, tmp_id, user_id, cost_code, description, duration_hours, rate_per_hour, is_billable, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, tmp_id, req.user.id, cost_code, description || null, duration_hours, rate_per_hour || 150, is_billable !== undefined ? (is_billable ? 1 : 0) : 1, date); }
  res.status(201).json({ id, cost_code, duration_hours });
});

router.put('/:id', validate('timeEntry'), (req, res) => {
  const existing = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Time entry not found' });
  const tenantId = getTenantId(req);
  if (tenantId && existing.tenant_id && existing.tenant_id !== tenantId) return res.status(403).json({ error: 'Tenant mismatch' });
  const { tmp_id, cost_code, description, duration_hours, rate_per_hour, is_billable, date } = req.validated;
  if (tenantId) {
    try { db.prepare('UPDATE time_entries SET tmp_id=?, cost_code=?, description=?, duration_hours=?, rate_per_hour=?, is_billable=?, date=?, updated_at=datetime(\'now\') WHERE id=? AND tenant_id=?').run(tmp_id, cost_code, description !== undefined ? (description || null) : existing.description, duration_hours, rate_per_hour !== undefined ? rate_per_hour : existing.rate_per_hour, is_billable !== undefined ? (is_billable ? 1 : 0) : existing.is_billable, date, req.params.id, tenantId); }
    catch { db.prepare('UPDATE time_entries SET tmp_id=?, cost_code=?, description=?, duration_hours=?, rate_per_hour=?, is_billable=?, date=?, updated_at=datetime(\'now\') WHERE id=?').run(tmp_id, cost_code, description !== undefined ? (description || null) : existing.description, duration_hours, rate_per_hour !== undefined ? rate_per_hour : existing.rate_per_hour, is_billable !== undefined ? (is_billable ? 1 : 0) : existing.is_billable, date, req.params.id); }
  } else {
    db.prepare('UPDATE time_entries SET tmp_id=?, cost_code=?, description=?, duration_hours=?, rate_per_hour=?, is_billable=?, date=?, updated_at=datetime(\'now\') WHERE id=?').run(tmp_id, cost_code, description !== undefined ? (description || null) : existing.description, duration_hours, rate_per_hour !== undefined ? rate_per_hour : existing.rate_per_hour, is_billable !== undefined ? (is_billable ? 1 : 0) : existing.is_billable, date, req.params.id);
  }
  res.json(db.prepare('SELECT * FROM time_entries WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const tenantId = getTenantId(req);
  let result;
  try {
    if (tenantId) result = db.prepare('DELETE FROM time_entries WHERE id = ? AND tenant_id = ?').run(req.params.id, tenantId);
    else result = db.prepare('DELETE FROM time_entries WHERE id = ?').run(req.params.id);
  } catch { result = db.prepare('DELETE FROM time_entries WHERE id = ?').run(req.params.id); }
  if (result.changes === 0) return res.status(404).json({ error: 'Time entry not found' });
  res.json({ success: true });
});

export default router;
