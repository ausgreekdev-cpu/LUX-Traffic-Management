import { Router } from 'express';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { isClientUser } from '../middleware/scope.js';
import { batchIncompleteRequiredStages } from './workflows.js';
import { getTenantId } from '../middleware/tenant.js';

const router = Router();
router.use(authenticate);

// Pre-prepared statements (hoisted for per-request perf)
const stmtTotalTmps = (cid, tenantId) => {
  if (cid) return { sql: 'SELECT COUNT(*) as c FROM traffic_management_plans t INNER JOIN tmp_projects p ON p.id=t.project_id WHERE p.client_id = ?', params: [cid] };
  if (tenantId) return { sql: 'SELECT COUNT(*) as c FROM traffic_management_plans WHERE tenant_id = ?', params: [tenantId] };
  return { sql: 'SELECT COUNT(*) as c FROM traffic_management_plans', params: [] };
};

router.get('/', (req, res) => {
  const cid = isClientUser(req.user) ? req.user.clientId : null;
  const tenantId = getTenantId(req);

  // Use transaction for consistent snapshot + WAL efficiency
  const tx = db.transaction(() => {
    const totalTmps = (() => {
      if (cid) return db.prepare('SELECT COUNT(*) as c FROM traffic_management_plans t INNER JOIN tmp_projects p ON p.id=t.project_id WHERE p.client_id = ?').get(cid).c;
      if (tenantId) return db.prepare('SELECT COUNT(*) as c FROM traffic_management_plans WHERE tenant_id = ?').get(tenantId).c;
      return db.prepare('SELECT COUNT(*) as c FROM traffic_management_plans').get().c;
    })();
    const activeTmps = (() => {
      if (cid) return db.prepare("SELECT COUNT(*) as c FROM traffic_management_plans t INNER JOIN tmp_projects p ON p.id=t.project_id WHERE t.status NOT IN ('completed','cancelled') AND p.client_id = ?").get(cid).c;
      if (tenantId) return db.prepare("SELECT COUNT(*) as c FROM traffic_management_plans WHERE status NOT IN ('completed','cancelled') AND tenant_id = ?").get(tenantId).c;
      return db.prepare("SELECT COUNT(*) as c FROM traffic_management_plans WHERE status NOT IN ('completed','cancelled')").get().c;
    })();
    const totalClients = cid
      ? db.prepare('SELECT COUNT(*) as c FROM clients WHERE id = ?').get(cid).c
      : tenantId ? db.prepare('SELECT COUNT(*) as c FROM clients WHERE tenant_id = ?').get(tenantId).c : db.prepare('SELECT COUNT(*) as c FROM clients').get().c;
    const pendingPermits = (() => {
      if (cid) return db.prepare("SELECT COUNT(*) as c FROM permits pe INNER JOIN traffic_management_plans t ON pe.tmp_id = t.id INNER JOIN tmp_projects p ON p.id=t.project_id WHERE pe.status IN ('submitted','under_review') AND p.client_id = ?").get(cid).c;
      if (tenantId) return db.prepare("SELECT COUNT(*) as c FROM permits pe INNER JOIN traffic_management_plans t ON pe.tmp_id = t.id WHERE pe.status IN ('submitted','under_review') AND t.tenant_id = ?").get(tenantId).c;
      return db.prepare("SELECT COUNT(*) as c FROM permits WHERE status IN ('submitted','under_review')").get().c;
    })();

    // Merged analytics (was separate /analytics/dashboard)
    const totalFeesOwed = (() => {
      try {
        if (tenantId) return db.prepare("SELECT COALESCE(SUM(pf.amount),0) as s FROM permit_fees pf INNER JOIN permits pe ON pf.permit_id=pe.id INNER JOIN traffic_management_plans t ON pe.tmp_id=t.id WHERE pf.status='pending' AND t.tenant_id = ?").get(tenantId).s;
        return db.prepare("SELECT COALESCE(SUM(amount),0) as s FROM permit_fees WHERE status='pending'").get().s;
      } catch { return 0; }
    })();
    const totalBondHeld = (() => {
      try {
        if (tenantId) return db.prepare("SELECT COALESCE(SUM(pf.amount),0) as s FROM permit_fees pf INNER JOIN permits pe ON pf.permit_id=pe.id INNER JOIN traffic_management_plans t ON pe.tmp_id=t.id WHERE pf.fee_type='bond' AND pf.bond_returned=0 AND t.tenant_id = ?").get(tenantId).s;
        return db.prepare("SELECT COALESCE(SUM(amount),0) as s FROM permit_fees WHERE fee_type='bond' AND bond_returned=0").get().s;
      } catch { return 0; }
    })();
    const urgentPermits = (() => {
      try {
        if (cid) return db.prepare("SELECT p.id,p.status,p.expiry_date,au.short_name FROM permits p LEFT JOIN traffic_management_plans t ON p.tmp_id=t.id LEFT JOIN authorities au ON p.authority_id=au.id INNER JOIN tmp_projects pp ON pp.id=t.project_id WHERE p.expiry_date IS NOT NULL AND p.expiry_date>datetime('now') AND pp.client_id=? ORDER BY p.expiry_date ASC LIMIT 5").all(cid);
        if (tenantId) return db.prepare("SELECT p.id,p.status,p.expiry_date,au.short_name FROM permits p LEFT JOIN traffic_management_plans t ON p.tmp_id=t.id LEFT JOIN authorities au ON p.authority_id=au.id WHERE p.expiry_date IS NOT NULL AND p.expiry_date>datetime('now') AND t.tenant_id=? ORDER BY p.expiry_date ASC LIMIT 5").all(tenantId);
        return db.prepare("SELECT p.id,p.status,p.expiry_date,au.short_name FROM permits p LEFT JOIN authorities au ON p.authority_id=au.id WHERE p.expiry_date IS NOT NULL AND p.expiry_date>datetime('now') ORDER BY p.expiry_date ASC LIMIT 5").all();
      } catch { return []; }
    })();

    const recentTmps = (() => {
      if (cid) return db.prepare(`
        SELECT t.*, s.name as site_name, p.name as project_name
        FROM traffic_management_plans t
        LEFT JOIN sites s ON t.site_id = s.id
        LEFT JOIN tmp_projects p ON t.project_id = p.id
        INNER JOIN tmp_projects p2 ON p2.id = t.project_id
        WHERE p2.client_id = ?
        ORDER BY t.created_at DESC LIMIT 5
      `).all(cid);
      if (tenantId) return db.prepare(`
        SELECT t.*, s.name as site_name, p.name as project_name
        FROM traffic_management_plans t
        LEFT JOIN sites s ON t.site_id = s.id
        LEFT JOIN tmp_projects p ON t.project_id = p.id
        WHERE t.tenant_id = ?
        ORDER BY t.created_at DESC LIMIT 5
      `).all(tenantId);
      return db.prepare(`
        SELECT t.*, s.name as site_name, p.name as project_name
        FROM traffic_management_plans t
        LEFT JOIN sites s ON t.site_id = s.id
        LEFT JOIN tmp_projects p ON t.project_id = p.id
        ORDER BY t.created_at DESC LIMIT 5
      `).all();
    })();

    const recentActivity = (() => {
      if (cid) return db.prepare(`
        SELECT a.*, u.name as user_name, t.title as tmp_title
        FROM plan_activities a
        LEFT JOIN users u ON a.user_id = u.id
        LEFT JOIN traffic_management_plans t ON a.tmp_id = t.id
        WHERE a.tmp_id IN (SELECT t2.id FROM traffic_management_plans t2 INNER JOIN tmp_projects p2 ON p2.id = t2.project_id WHERE p2.client_id = ?)
        ORDER BY a.created_at DESC LIMIT 10
      `).all(cid);
      if (tenantId) return db.prepare(`
        SELECT a.*, u.name as user_name, t.title as tmp_title
        FROM plan_activities a
        LEFT JOIN users u ON a.user_id = u.id
        LEFT JOIN traffic_management_plans t ON a.tmp_id = t.id
        WHERE t.tenant_id = ?
        ORDER BY a.created_at DESC LIMIT 10
      `).all(tenantId);
      return db.prepare(`
        SELECT a.*, u.name as user_name, t.title as tmp_title
        FROM plan_activities a
        LEFT JOIN users u ON a.user_id = u.id
        LEFT JOIN traffic_management_plans t ON a.tmp_id = t.id
        ORDER BY a.created_at DESC LIMIT 10
      `).all();
    })();

    const activeTmpsList = (() => {
      if (cid) return db.prepare("SELECT id, reference, title FROM traffic_management_plans t INNER JOIN tmp_projects p ON p.id=t.project_id WHERE t.status NOT IN ('completed','cancelled') AND p.client_id = ?").all(cid);
      if (tenantId) return db.prepare("SELECT id, reference, title FROM traffic_management_plans WHERE status NOT IN ('completed','cancelled') AND tenant_id = ?").all(tenantId);
      return db.prepare("SELECT id, reference, title FROM traffic_management_plans WHERE status NOT IN ('completed','cancelled')").all();
    })();
    const activePermitsList = (() => {
      if (cid) return db.prepare("SELECT p.id, t.reference as tmp_reference, au.short_name as authority FROM permits p LEFT JOIN traffic_management_plans t ON p.tmp_id = t.id LEFT JOIN authorities au ON p.authority_id = au.id INNER JOIN tmp_projects pp ON pp.id = t.project_id WHERE p.status NOT IN ('cancelled','completed','expired') AND pp.client_id = ?").all(cid);
      if (tenantId) return db.prepare("SELECT p.id, t.reference as tmp_reference, au.short_name as authority FROM permits p LEFT JOIN traffic_management_plans t ON p.tmp_id = t.id LEFT JOIN authorities au ON p.authority_id = au.id WHERE p.status NOT IN ('cancelled','completed','expired') AND t.tenant_id = ?").all(tenantId);
      return db.prepare("SELECT p.id, t.reference as tmp_reference, au.short_name as authority FROM permits p LEFT JOIN traffic_management_plans t ON p.tmp_id = t.id LEFT JOIN authorities au ON p.authority_id = au.id WHERE p.status NOT IN ('cancelled','completed','expired')").all();
    })();

    // Batch workflowAttention (was N+1)
    const tmpIds = activeTmpsList.map(t => t.id);
    const permitIds = activePermitsList.map(p => p.id);
    const tmpMissingMap = batchIncompleteRequiredStages('tmp', tmpIds);
    const permitMissingMap = batchIncompleteRequiredStages('permit', permitIds);
    const workflowAttention = [
      ...activeTmpsList.map(t => ({ type: 'tmp', id: t.id, label: `${t.reference || ''} ${t.title}`.trim(), missing: tmpMissingMap.get(t.id) || [] })).filter(t => t.missing.length),
      ...activePermitsList.map(p => ({ type: 'permit', id: p.id, label: `${p.tmp_reference || 'Permit'} • ${p.authority || ''}`.trim(), missing: permitMissingMap.get(p.id) || [] })).filter(p => p.missing.length)
    ].slice(0, 10);

    return { totalTmps, activeTmps, totalClients, pendingPermits, totalFeesOwed, totalBondHeld, urgentPermits, recentTmps, recentActivity, workflowAttention };
  });

  const data = tx();
  // ETag / Cache-Control for polling (30s private)
  const etag = `W/"${data.totalTmps}-${data.activeTmps}-${data.pendingPermits}-${data.recentTmps[0]?.updated_at || ''}"`;
  res.set('Cache-Control', 'private, max-age=30');
  res.set('ETag', etag);
  if (req.headers['if-none-match'] === etag) return res.status(304).end();

  res.json({
    stats: { totalTmps: data.totalTmps, activeTmps: data.activeTmps, totalClients: data.totalClients, pendingPermits: data.pendingPermits, totalFeesOwed: data.totalFeesOwed, totalBondHeld: data.totalBondHeld },
    urgentPermits: data.urgentPermits,
    recentTmps: data.recentTmps,
    recentActivity: data.recentActivity,
    workflowAttention: data.workflowAttention,
    generated_at: new Date().toISOString()
  });
});

export default router;
