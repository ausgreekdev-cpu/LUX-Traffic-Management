import { can, limitFor, checkUsage, enforceLimit } from '../saas/entitlements.js';
import db from '../db.js';

/**
 * Middleware to enforce feature gating.
 * Usage: app.post('/api/tmps', auth, requireEntitlement('gis_generator'), handler)
 */
export function requireEntitlement(featureKey) {
  return (req, res, next) => {
    const tenantId = req.user?.tenant_id || req.headers['x-tenant-id'] || req.query.tenant_id;
    // Fallback to default tenant for single-tenant dev
    const effectiveTenantId = tenantId || db.prepare('SELECT id FROM tenants LIMIT 1').get()?.id;
    if (!effectiveTenantId) return res.status(401).json({ error: 'tenant_not_resolved' });
    if (!can(effectiveTenantId, featureKey)) {
      return res.status(402).json({
        error: 'upgrade_required',
        feature: featureKey,
        message: `Feature '${featureKey}' requires upgrade. Current plan does not include it.`,
      });
    }
    req.tenantId = effectiveTenantId;
    next();
  };
}

export function requireLimit(limitKey, countResolver) {
  return async (req, res, next) => {
    const tenantId = req.tenantId || req.user?.tenant_id || db.prepare('SELECT id FROM tenants LIMIT 1').get()?.id;
    if (!tenantId) return res.status(401).json({ error: 'tenant_not_resolved' });
    const current = typeof countResolver === 'function' ? await countResolver(req, tenantId) : 0;
    const { allowed, limit } = enforceLimit(tenantId, limitKey, current);
    if (!allowed) {
      return res.status(402).json({
        error: 'limit_exceeded',
        limit: limitKey,
        limit_value: limit,
        current,
        message: `Limit '${limitKey}' exceeded (${current}/${limit}). Upgrade required.`,
      });
    }
    req.tenantId = tenantId;
    next();
  };
}

// Usage meter for pdf exports etc. Wraps json/send/end to count only on 2xx success.
// Used for pdf_exports_per_month (and storage/api if needed). Handles both JSON and streamed PDF (res.end).
export function meterUsage(featureKey) {
  return (req, res, next) => {
    let counted = false;
    const doIncrement = () => {
      if (counted) return;
      // If route uses manual recordPdfUsage guard, skip double count
      if (req._pdfCounted) return;
      counted = true;
      try {
        const tenantId = req.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'];
        if (tenantId && res.statusCode >= 200 && res.statusCode < 300) {
          import('../saas/entitlements.js').then(m => m.incrementUsage(tenantId, featureKey, 1)).catch(()=>{});
        }
      } catch {}
    };
    const originalJson = res.json.bind(res);
    res.json = function(body) {
      if (res.statusCode >= 200 && res.statusCode < 300) doIncrement();
      return originalJson(body);
    };
    const originalSend = res.send.bind(res);
    res.send = function(body) {
      if (res.statusCode >= 200 && res.statusCode < 300) doIncrement();
      return originalSend(body);
    };
    const originalEnd = res.end.bind(res);
    res.end = function(...args) {
      // For streamed PDFs (pdfkit pipe): res.end is called on finish with 200
      if (!counted && res.statusCode >= 200 && res.statusCode < 300) {
        // Check that this wasn't already counted via json/send, and that content-type is pdf or success
        const ct = res.getHeader('content-type') || '';
        if (String(ct).includes('pdf') || res.writableFinished === false) doIncrement();
      }
      return originalEnd(...args);
    };
    // Also hook finish event as fallback
    res.on('finish', () => {
      if (!counted && res.statusCode >= 200 && res.statusCode < 300) {
        // Only count if we explicitly handled? Avoid double-count for non-pdf
      }
    });
    next();
  };
}
