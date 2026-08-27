import crypto from 'crypto';
import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import db from '../db.js';
import { grantOverride, revokeOverride, extendTrial, pauseTenant, resolveEntitlements } from '../saas/entitlements.js';
import { TIERS } from '../saas/tiers.js';

const router = express.Router();

// All admin routes require developer role (super-admin)
router.use(authenticate, authorize('developer'));

// GET /api/admin/tenants
router.get('/tenants', (req, res) => {
  const tenants = db.prepare('SELECT * FROM tenants ORDER BY created_at DESC').all();
  res.json(tenants);
});

// GET /api/admin/tenants/:id/entitlements
router.get('/tenants/:id/entitlements', (req, res) => {
  const ent = resolveEntitlements(req.params.id);
  if (!ent) return res.status(404).json({ error: 'tenant_not_found' });
  const overrides = db.prepare('SELECT * FROM tenant_overrides WHERE tenant_id = ? ORDER BY created_at DESC').all(req.params.id);
  const usage = db.prepare('SELECT * FROM usage_counters WHERE tenant_id = ?').all(req.params.id);
  res.json({ ...ent, overrides, usage });
});

// POST /api/admin/tenants/:id/override - grant feature/limit bypass
router.post('/tenants/:id/override', (req, res) => {
  const { featureKey, limitValue = 'true', reason, expiresAt } = req.body;
  if (!featureKey) return res.status(400).json({ error: 'featureKey required' });
  const id = grantOverride({
    tenantId: req.params.id,
    featureKey,
    limitValue: String(limitValue),
    reason: reason || 'manual override',
    grantedBy: req.user.id,
    expiresAt: expiresAt || null,
  });
  res.json({ id, featureKey, limitValue });
});

// DELETE /api/admin/overrides/:overrideId
router.delete('/overrides/:overrideId', (req, res) => {
  const ok = revokeOverride(req.params.overrideId, req.user.id);
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

// POST /api/admin/tenants/:id/extend-trial
router.post('/tenants/:id/extend-trial', (req, res) => {
  const { days = 14 } = req.body;
  const newEnd = extendTrial(req.params.id, Number(days), req.user.id);
  res.json({ new_trial_ends_at: newEnd });
});

// POST /api/admin/tenants/:id/pause
router.post('/tenants/:id/pause', (req, res) => {
  const { until } = req.body;
  pauseTenant(req.params.id, until || null, req.user.id);
  res.json({ ok: true, status: 'paused' });
});

// POST /api/admin/tenants/:id/plan - manually set plan (bypass Stripe)
router.post('/tenants/:id/plan', (req, res) => {
  const { plan } = req.body;
  if (!TIERS[plan]) return res.status(400).json({ error: 'invalid plan', valid: Object.keys(TIERS) });
  db.prepare(`UPDATE tenants SET plan = ?, updated_at = datetime('now') WHERE id = ?`).run(plan, req.params.id);
  db.prepare(`INSERT INTO admin_audit_log (id, actor_id, action, target_tenant, metadata_json) VALUES (?, ?, ?, ?, ?)`).run(
    crypto.randomUUID(), req.user.id, 'set_plan', req.params.id, JSON.stringify({ plan })
  );
  res.json({ ok: true, plan });
});

// GET /api/admin/audit
router.get('/audit', (req, res) => {
  const logs = db.prepare('SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT 100').all();
  res.json(logs);
});

export default router;
