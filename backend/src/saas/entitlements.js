import db from '../db.js';
import { getTier, isFeatureAllowed, getLimit } from './tiers.js';

/**
 * Entitlement resolver — combines Stripe plan + DB overrides + usage counters.
 * Usage: await checkEntitlement(tenantId, 'gis_generator') or checkLimit(tenantId, 'active_projects')
 */

export function getTenant(tenantId) {
  if (!tenantId) return null;
  return db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
}

export function getTenantBySlug(slug) {
  return db.prepare('SELECT * FROM tenants WHERE slug = ?').get(slug);
}

export function resolveEntitlements(tenantId) {
  const tenant = getTenant(tenantId);
  if (!tenant) return null;
  const tier = getTier(tenant.plan);
  // Apply active overrides (not expired)
  const overrides = db.prepare(`
    SELECT feature_key, limit_value FROM tenant_overrides
    WHERE tenant_id = ? AND (expires_at IS NULL OR expires_at > datetime('now'))
  `).all(tenantId);
  const features = { ...tier.features };
  const limits = { ...tier.limits };
  for (const o of overrides) {
    // Feature gating overrides: if limit_value is 'true'/'false' treat as feature
    if (o.limit_value === 'true' || o.limit_value === 'false') {
      features[o.feature_key] = o.limit_value === 'true';
    } else if (o.limit_value !== null) {
      // Try numeric limit override
      const num = Number(o.limit_value);
      if (!Number.isNaN(num)) limits[o.feature_key] = num;
      else limits[o.feature_key] = o.limit_value;
    } else {
      features[o.feature_key] = true;
    }
  }
  return { tenant, tier, features, limits, overrides };
}

export function can(tenantId, featureKey) {
  const ent = resolveEntitlements(tenantId);
  if (!ent) return false;
  return !!ent.features[featureKey];
}

export function limitFor(tenantId, limitKey) {
  const ent = resolveEntitlements(tenantId);
  if (!ent) return 0;
  return ent.limits[limitKey];
}

export function checkUsage(tenantId, featureKey) {
  const period = new Date().toISOString().slice(0,7); // YYYY-MM
  const row = db.prepare('SELECT used FROM usage_counters WHERE tenant_id = ? AND feature_key = ? AND period = ?').get(tenantId, featureKey, period);
  return row ? row.used : 0;
}

export function incrementUsage(tenantId, featureKey, delta = 1) {
  const period = new Date().toISOString().slice(0,7);
  db.prepare(`
    INSERT INTO usage_counters (tenant_id, feature_key, period, used, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(tenant_id, feature_key, period) DO UPDATE SET used = used + ?, updated_at = datetime('now')
  `).run(tenantId, featureKey, period, delta, delta);
}

export function enforceLimit(tenantId, limitKey, currentCount) {
  const limit = limitFor(tenantId, limitKey);
  if (limit === Infinity) return { allowed: true, limit };
  const allowed = currentCount < limit;
  return { allowed, limit, current: currentCount };
}

// Developer override helpers
export function grantOverride({ tenantId, featureKey, limitValue = 'true', reason, grantedBy, expiresAt }) {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO tenant_overrides (id, tenant_id, feature_key, limit_value, reason, granted_by, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, tenantId, featureKey, limitValue, reason, grantedBy, expiresAt || null);
  // Audit
  db.prepare(`INSERT INTO admin_audit_log (id, actor_id, action, target_tenant, metadata_json) VALUES (?, ?, ?, ?, ?)`).run(
    crypto.randomUUID(), grantedBy, 'grant_override', tenantId, JSON.stringify({ featureKey, limitValue, reason, expiresAt })
  );
  return id;
}

export function revokeOverride(overrideId, actorId) {
  const row = db.prepare('SELECT * FROM tenant_overrides WHERE id = ?').get(overrideId);
  if (!row) return false;
  db.prepare('DELETE FROM tenant_overrides WHERE id = ?').run(overrideId);
  db.prepare(`INSERT INTO admin_audit_log (id, actor_id, action, target_tenant, metadata_json) VALUES (?, ?, ?, ?, ?)`).run(
    crypto.randomUUID(), actorId, 'revoke_override', row.tenant_id, JSON.stringify({ overrideId, featureKey: row.feature_key })
  );
  return true;
}

export function extendTrial(tenantId, days, actorId) {
  const tenant = getTenant(tenantId);
  if (!tenant) throw new Error('tenant not found');
  const currentEnd = tenant.trial_ends_at ? new Date(tenant.trial_ends_at) : new Date();
  currentEnd.setDate(currentEnd.getDate() + days);
  const iso = currentEnd.toISOString();
  db.prepare(`UPDATE tenants SET trial_ends_at = ?, updated_at = datetime('now') WHERE id = ?`).run(iso, tenantId);
  db.prepare(`INSERT INTO admin_audit_log (id, actor_id, action, target_tenant, metadata_json) VALUES (?, ?, ?, ?, ?)`).run(
    crypto.randomUUID(), actorId, 'extend_trial', tenantId, JSON.stringify({ days, new_trial_ends_at: iso })
  );
  return iso;
}

export function pauseTenant(tenantId, untilIso, actorId) {
  db.prepare(`UPDATE tenants SET status = 'paused', updated_at = datetime('now') WHERE id = ?`).run(tenantId);
  db.prepare(`INSERT INTO admin_audit_log (id, actor_id, action, target_tenant, metadata_json) VALUES (?, ?, ?, ?, ?)`).run(
    crypto.randomUUID(), actorId, 'pause_tenant', tenantId, JSON.stringify({ until: untilIso })
  );
}
