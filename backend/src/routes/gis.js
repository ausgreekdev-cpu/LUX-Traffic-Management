import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireEntitlement } from '../middleware/entitlement.js';
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
  // In production: generate PDF via pdfkit + map snapshot
  res.json({ message: 'PDF export stub — integrate council exporters (Phase 4) here. Counts toward pdf_exports_per_month.' });
});

export default router;
