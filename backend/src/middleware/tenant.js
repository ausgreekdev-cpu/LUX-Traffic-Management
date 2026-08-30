import db from '../db.js';

export function getTenantId(req) {
  if (req.user?.tenant_id) return req.user.tenant_id;
  if (req.user?.tenantId) return req.user.tenantId;
  if (req.headers['x-tenant-id']) return req.headers['x-tenant-id'];
  try {
    const row = db.prepare('SELECT id FROM tenants LIMIT 1').get();
    return row?.id || null;
  } catch { return null; }
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
