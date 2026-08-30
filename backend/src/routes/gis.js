import crypto from 'crypto';
import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { incrementUsage, enforceLimit, resolveEntitlements } from '../saas/entitlements.js';
import db from '../db.js';

const router = express.Router();

// POST /api/gis/tgs - create TGS diagram (Pro+)
router.post('/tgs', authenticate, requireEntitlement('gis_generator'), (req, res) => {
  const { tmp_id, layout_json } = req.body;
  const tenantId = req.tenantId;
  // Limit check: active_projects already gated elsewhere, here just create
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO tgs (id, tmp_id, layout_json, created_at) VALUES (?, ?, ?, datetime('now'))`).run(id, tmp_id, JSON.stringify(layout_json || {}));
  res.json({ id, tmp_id });
});

// GET /api/gis/export/:tmpId/pdf - metered
router.get('/export/:tmpId/pdf', authenticate, requireEntitlement('gis_generator'), (req, res) => {
  const tenantId = req.tenantId || req.user.tenant_id;
  if (tenantId) {
    const used = (() => { try { return db.prepare("SELECT used FROM usage_counters WHERE tenant_id = ? AND feature_key = 'pdf_exports_per_month' AND period = ?").get(tenantId, new Date().toISOString().slice(0,7))?.used || 0; } catch { return 0; } })();
    const { allowed, limit } = enforceLimit(tenantId, 'pdf_exports_per_month', used);
    if (!allowed) return res.status(402).json({ error: 'limit_exceeded', limit: 'pdf_exports_per_month', limit_value: limit, current: used });
    incrementUsage(tenantId, 'pdf_exports_per_month', 1);
  }
  res.json({ message: 'PDF export stub — integrate council exporters (Phase 4) here. Counts toward pdf_exports_per_month.' });
});

export default router;
