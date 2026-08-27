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

// Usage meter for pdf exports etc.
export function meterUsage(featureKey) {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = function(body) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const tenantId = req.tenantId || req.user?.tenant_id;
          if (tenantId) import('../saas/entitlements.js').then(m => m.incrementUsage(tenantId, featureKey, 1)).catch(()=>{});
        } catch {}
      }
      return originalJson(body);
    };
    next();
  };
}
