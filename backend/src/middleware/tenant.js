import db from '../db.js';

export function getTenantId(req) {
  // Primary: JWT-bound tenant (prevents header spoof)
  if (req.user?.tenant_id) return req.user.tenant_id;
  if (req.user?.tenantId) return req.user.tenantId;
  // Fallback for old JWTs without tenant_id: lookup tenant_users
  if (req.user?.id) {
    try {
      const link = db.prepare('SELECT tenant_id FROM tenant_users WHERE user_id = ? LIMIT 1').get(req.user.id);
      if (link?.tenant_id) return link.tenant_id;
    } catch {}
  }
  // Header only if user is actually member of that tenant
  const headerTenant = req.headers['x-tenant-id'];
  if (headerTenant && req.user?.id) {
    try {
      const ok = db.prepare('SELECT 1 FROM tenant_users WHERE user_id = ? AND tenant_id = ?').get(req.user.id, String(headerTenant).trim());
      if (ok) return String(headerTenant).trim();
    } catch {}
  } else if (headerTenant) {
    // For unauthenticated, allow header but log (used for public branding)
    return String(headerTenant).trim();
  }
  // No fallback LIMIT 1 - require explicit tenant; for dev single-tenant, caller should handle fallback
  return null;
}

export function getTenantIdWithFallback(req) {
  const id = getTenantId(req);
  if (id) return id;
  try { return db.prepare('SELECT id FROM tenants LIMIT 1').get()?.id || null; } catch { return null; }
}

export function requireTenant(req, res, next) {
  const tenantId = getTenantId(req);
  if (!tenantId) return res.status(401).json({ error: 'tenant_not_resolved' });
  try {
    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
    if (!tenant) return res.status(404).json({ error: 'tenant_not_found' });
    if (['paused','past_due','canceled'].includes(tenant.status)) {
      return res.status(402).json({ error: 'tenant_inactive', status: tenant.status, message: `Account ${tenant.status}. Please update billing at /billing.` });
    }
    req.tenantId = tenantId;
    req.tenant = tenant;
    next();
  } catch (e) {
    return res.status(500).json({ error: String(e.message) });
  }
}

// Helper to add tenant_id filter to a query
export function tenantWhere(req, column = 'tenant_id') {
  const tenantId = getTenantId(req);
  if (!tenantId) return { clause: '', params: [] };
  return { clause: `${column} = ?`, params: [tenantId] };
}
