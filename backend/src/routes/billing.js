import express from 'express';
import crypto from 'crypto';
import { authenticate, authorize } from '../middleware/auth.js';
import db from '../db.js';
import { getTier, TIERS } from '../saas/tiers.js';
import { resolveEntitlements, can } from '../saas/entitlements.js';
const requireAuth = authenticate;

const router = express.Router();

// Helper: build price maps from env (monthly/annual base + extra seat)
function getPriceMap() {
  return {
    starter: { monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY || null, annual: process.env.STRIPE_PRICE_STARTER_ANNUAL || null },
    pro: { monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || null, annual: process.env.STRIPE_PRICE_PRO_ANNUAL || null },
    agency: { monthly: process.env.STRIPE_PRICE_AGENCY_MONTHLY || null, annual: process.env.STRIPE_PRICE_AGENCY_ANNUAL || null },
  };
}
function getExtraPriceMap() {
  return {
    starter: { monthly: process.env.STRIPE_PRICE_STARTER_EXTRA_MONTHLY || process.env.STRIPE_PRICE_EXTRA_STARTER_MONTHLY || process.env.STRIPE_PRICE_EXTRA_SEAT_MONTHLY || null, annual: process.env.STRIPE_PRICE_STARTER_EXTRA_ANNUAL || process.env.STRIPE_PRICE_EXTRA_STARTER_ANNUAL || process.env.STRIPE_PRICE_EXTRA_SEAT_ANNUAL || null },
    pro: { monthly: process.env.STRIPE_PRICE_PRO_EXTRA_MONTHLY || process.env.STRIPE_PRICE_EXTRA_PRO_MONTHLY || process.env.STRIPE_PRICE_EXTRA_SEAT_MONTHLY || null, annual: process.env.STRIPE_PRICE_PRO_EXTRA_ANNUAL || process.env.STRIPE_PRICE_EXTRA_PRO_ANNUAL || process.env.STRIPE_PRICE_EXTRA_SEAT_ANNUAL || null },
    agency: { monthly: process.env.STRIPE_PRICE_AGENCY_EXTRA_MONTHLY || process.env.STRIPE_PRICE_EXTRA_AGENCY_MONTHLY || process.env.STRIPE_PRICE_EXTRA_SEAT_MONTHLY || null, annual: process.env.STRIPE_PRICE_AGENCY_EXTRA_ANNUAL || process.env.STRIPE_PRICE_EXTRA_AGENCY_ANNUAL || process.env.STRIPE_PRICE_EXTRA_SEAT_ANNUAL || null },
  };
}

// GET /api/billing/plans - list tiers with Stripe price IDs (server-provided, no VITE_ leak)
router.get('/plans', (req, res) => {
  const priceMap = getPriceMap();
  const extraMap = getExtraPriceMap();
  res.json(Object.values(TIERS).map(t => ({
    id: t.id, name: t.name, priceMonthly: t.priceMonthly, priceAnnual: t.priceAnnual,
    seatsIncluded: t.seatsIncluded, extraSeatPrice: t.extraSeatPrice,
    limits: t.limits, features: t.features,
    priceIdMonthly: priceMap[t.id]?.monthly || null,
    priceIdAnnual: priceMap[t.id]?.annual || null,
    extraPriceIdMonthly: extraMap[t.id]?.monthly || null,
    extraPriceIdAnnual: extraMap[t.id]?.annual || null,
  })));
});

// GET /api/billing/entitlements - current tenant entitlements
router.get('/entitlements', requireAuth, (req, res) => {
  const tenantId = req.user.tenant_id || db.prepare('SELECT id FROM tenants LIMIT 1').get()?.id;
  if (!tenantId) return res.status(404).json({ error: 'no_tenant' });
  const ent = resolveEntitlements(tenantId);
  res.json(ent);
});

// GET /api/billing/tenant - current tenant
router.get('/tenant', requireAuth, (req, res) => {
  const tenantId = req.user.tenant_id || db.prepare('SELECT id FROM tenants LIMIT 1').get()?.id;
  const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
  res.json(tenant);
});

// POST /api/billing/portal - create Stripe Customer Portal session (stub if no Stripe key)
router.post('/portal', requireAuth, async (req, res) => {
  const tenantId = req.user.tenant_id || db.prepare('SELECT id FROM tenants LIMIT 1').get()?.id;
  const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
  if (!process.env.STRIPE_SECRET_KEY || !tenant?.stripe_customer_id) {
    return res.json({ url: null, message: 'Stripe not configured - use Developer Override or set STRIPE_SECRET_KEY' });
  }
  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripe_customer_id,
      return_url: req.body.return_url || process.env.APP_URL || 'https://lux-official.netlify.app',
    });
    res.json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// POST /api/billing/checkout - create Stripe Checkout session (base + extra seats, not plan*seats)
router.post('/checkout', requireAuth, async (req, res) => {
  const { priceId, seats, quantity, success_url, cancel_url, planId, annual: annualFlag } = req.body;
  if (!priceId) return res.status(400).json({ error: 'priceId required' });
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Stripe not configured' });
  const requestedSeats = Math.max(1, Number(seats || quantity || 1));
  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const tenantId = req.user.tenant_id || db.prepare('SELECT id FROM tenants LIMIT 1').get()?.id;
    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
    // Resolve tier: prefer explicit planId, else reverse-map priceId to tier, else tenant.plan fallback
    let tierId = planId || null;
    if (!tierId) {
      const priceMap = getPriceMap();
      for (const [tid, v] of Object.entries(priceMap)) {
        if (v.monthly === priceId || v.annual === priceId) { tierId = tid; break; }
      }
    }
    if (!tierId && tenant?.plan && TIERS[tenant.plan]) tierId = tenant.plan;
    if (!tierId) tierId = 'pro';
    const tier = getTier(tierId);
    // Determine if annual: check priceId against annual env or explicit flag
    const priceMap = getPriceMap();
    const isAnnual = typeof annualFlag === 'boolean' ? annualFlag : (priceMap[tierId]?.annual === priceId || [process.env.STRIPE_PRICE_STARTER_ANNUAL, process.env.STRIPE_PRICE_PRO_ANNUAL, process.env.STRIPE_PRICE_AGENCY_ANNUAL].includes(priceId));
    const seatsIncluded = tier.seatsIncluded === Infinity ? requestedSeats : tier.seatsIncluded;
    const extraSeats = Math.max(0, requestedSeats - seatsIncluded);

    // Build line items: base qty 1 + extra seats separate line item (not seats * plan)
    const line_items = [{ price: priceId, quantity: 1 }];
    if (extraSeats > 0 && tier.extraSeatPrice > 0) {
      const extraMap = getExtraPriceMap();
      const extraPriceId = isAnnual ? extraMap[tier.id]?.annual : extraMap[tier.id]?.monthly;
      const genericExtra = isAnnual ? (process.env.STRIPE_PRICE_EXTRA_SEAT_ANNUAL || null) : (process.env.STRIPE_PRICE_EXTRA_SEAT_MONTHLY || process.env.STRIPE_PRICE_EXTRA_SEAT || null);
      const finalExtraPriceId = extraPriceId || genericExtra || null;
      if (finalExtraPriceId) {
        line_items.push({ price: finalExtraPriceId, quantity: extraSeats });
      } else {
        // Inline price_data fallback: unit_amount = extraSeatPrice cents (annual discounted -20%)
        const unitAmount = isAnnual ? Math.round(tier.extraSeatPrice * 100 * 12 * 0.8) : tier.extraSeatPrice * 100;
        const interval = isAnnual ? 'year' : 'month';
        line_items.push({
          price_data: {
            currency: 'aud',
            unit_amount: unitAmount,
            product_data: { name: `${tier.name} Extra Seat` },
            recurring: { interval },
          },
          quantity: extraSeats,
        });
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: tenant?.stripe_customer_id || undefined,
      customer_email: !tenant?.stripe_customer_id ? req.user.email : undefined,
      line_items,
      success_url: success_url || `${process.env.APP_URL || 'https://lux-official.netlify.app'}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || `${process.env.APP_URL || 'https://lux-official.netlify.app'}/billing/cancel`,
      metadata: { tenant_id: tenantId, plan: tier.id, seats: String(requestedSeats), extra_seats: String(extraSeats), is_annual: String(!!isAnnual) },
    });
    res.json({ url: session.url, extraSeats, seatsIncluded, isAnnual });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// GET /api/billing/usage - seat/project/pdf/storage/api_calls usage meters
router.get('/usage', requireAuth, (req, res) => {
  const tenantId = req.user.tenant_id || db.prepare('SELECT id FROM tenants LIMIT 1').get()?.id;
  if (!tenantId) return res.status(404).json({ error: 'no_tenant' });
  const ent = resolveEntitlements(tenantId);
  const seatsUsed = db.prepare('SELECT count(*) as c FROM tenant_users WHERE tenant_id = ?').get(tenantId).c;
  const activeProjects = db.prepare("SELECT count(*) as c FROM traffic_management_plans WHERE tenant_id = ? AND status != 'completed'").get(tenantId)?.c || 0;
  const periodMonth = new Date().toISOString().slice(0,7);
  const periodDay = new Date().toISOString().slice(0,10);
  const pdfUsed = (() => { try { return db.prepare("SELECT used FROM usage_counters WHERE tenant_id = ? AND feature_key = 'pdf_exports_per_month' AND period = ?").get(tenantId, periodMonth)?.used || 0; } catch { return 0; } })();
  const apiCallsUsed = (() => { try { return db.prepare("SELECT used FROM usage_counters WHERE tenant_id = ? AND feature_key = 'api_calls_per_day' AND period = ?").get(tenantId, periodDay)?.used || 0; } catch { return 0; } })();
  // Storage used (sum of document + photo + branding sizes for tenant)
  let storageBytes = 0;
  try {
    const d = db.prepare('SELECT SUM(size) as s FROM documents WHERE tenant_id = ?').get(tenantId)?.s || 0;
    const p = db.prepare('SELECT SUM(size) as s FROM site_photos WHERE tenant_id = ?').get(tenantId)?.s || 0;
    let b = 0;
    try { b = db.prepare('SELECT SUM(size) as s FROM branding_assets WHERE tenant_id = ?').get(tenantId)?.s || 0; } catch {}
    storageBytes = Number(d||0) + Number(p||0) + Number(b||0);
  } catch {}
  const storageGb = storageBytes / (1024*1024*1024);
  res.json({
    tenantId, plan: ent?.tenant?.plan,
    seats: { used: seatsUsed, limit: ent?.limits?.seats },
    projects: { used: activeProjects, limit: ent?.limits?.active_projects },
    pdfs: { used: pdfUsed, limit: ent?.limits?.pdf_exports_per_month, period: periodMonth },
    storage_gb: { used: Number(storageGb.toFixed(3)), used_bytes: storageBytes, limit: ent?.limits?.storage_gb },
    storage: { used: Number(storageGb.toFixed(3)), used_bytes: storageBytes, limit: ent?.limits?.storage_gb },
    api_calls: { used: apiCallsUsed, limit: ent?.limits?.api_calls_per_day, period: periodDay },
    apiCalls: { used: apiCallsUsed, limit: ent?.limits?.api_calls_per_day, period: periodDay },
  });
});

// GET /api/billing/invoices - list recent Stripe invoices
router.get('/invoices', requireAuth, async (req, res) => {
  const tenantId = req.user.tenant_id || db.prepare('SELECT id FROM tenants LIMIT 1').get()?.id;
  const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
  if (!process.env.STRIPE_SECRET_KEY || !tenant?.stripe_customer_id) return res.json([]);
  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const invoices = await stripe.invoices.list({ customer: tenant.stripe_customer_id, limit: 10 });
    res.json(invoices.data.map(i => ({ id: i.id, amount: i.amount_due, status: i.status, created: i.created, hosted_url: i.hosted_invoice_url })));
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

// Helper: map RevenueCat entitlements object to plan id (highest tier wins)
function resolvePlanFromEntitlements(entitlements) {
  if (!entitlements || typeof entitlements !== 'object') return null;
  const keys = Object.keys(entitlements).filter(k => !!entitlements[k]);
  const lower = keys.map(k => String(k).toLowerCase());
  const has = (substr) => lower.some(k => k.includes(substr));
  // Priority: enterprise > agency > pro > starter
  if (has('enterprise')) return 'enterprise';
  if (has('agency')) return 'agency';
  if (has('pro')) return 'pro';
  if (has('starter')) return 'starter';
  // Exact match fallback
  for (const cand of ['enterprise','agency','pro','starter']) {
    if (lower.includes(cand)) return cand;
  }
  return null;
}

// POST /api/billing/revenuecat - sync RevenueCat entitlements (mobile) with uniqueness + aliasing
router.post('/revenuecat', requireAuth, async (req, res) => {
  const { entitlements, revenueCatId, aliases, appUserId } = req.body; // entitlements: { pro: true, starter: true } etc.
  const tenantId = req.user.tenant_id || db.prepare('SELECT id FROM tenants LIMIT 1').get()?.id;
  const rcId = revenueCatId || appUserId || null;
  if (rcId) {
    // RevenueCatId uniqueness check
    try {
      const existing = db.prepare('SELECT id FROM tenants WHERE revenuecat_user_id = ?').get(rcId);
      if (existing && existing.id !== tenantId) {
        // Aliasing: if aliases contains the existing owner's previous id, allow transfer; otherwise treat as alias collision
        const aliasList = Array.isArray(aliases) ? aliases : [];
        // If this sync includes an alias that matches existing tenant's rc id, it's a legitimate alias transfer
        // For now allow transfer after clearing previous owner (RevenueCat alias behavior)
        db.prepare('UPDATE tenants SET revenuecat_user_id = NULL, updated_at = datetime(\'now\') WHERE id = ?').run(existing.id);
        db.prepare('INSERT INTO admin_audit_log (id, actor_id, action, target_tenant, metadata_json) VALUES (?, ?, ?, ?, ?)').run(
          crypto.randomUUID(), req.user.id || null, 'revenuecat_alias_transfer', tenantId, JSON.stringify({ fromTenant: existing.id, revenueCatId: rcId, aliases: aliasList })
        );
      }
      db.prepare('UPDATE tenants SET revenuecat_user_id = ?, updated_at = datetime(\'now\') WHERE id = ?').run(rcId, tenantId);
      // Persist aliases if provided
      if (Array.isArray(aliases) && aliases.length) {
        for (const alias of aliases.slice(0, 10)) {
          try { db.prepare('INSERT OR IGNORE INTO entitlements (id, tenant_id, feature_key, limit_value) VALUES (?, ?, ?, ?)').run(crypto.randomUUID(), tenantId, `revenuecat_alias:${alias}`, String(alias)); } catch {}
        }
      }
    } catch (e) {
      return res.status(500).json({ error: 'revenuecat alias failed: ' + String(e.message) });
    }
  }
  // Map RevenueCat entitlements to our plan (handle starter/agency/enterprise/annual)
  const plan = resolvePlanFromEntitlements(entitlements);
  if (plan && TIERS[plan]) {
    try {
      db.prepare(`UPDATE tenants SET plan = ?, status = 'active', updated_at = datetime('now') WHERE id = ?`).run(plan, tenantId);
      db.prepare('INSERT INTO admin_audit_log (id, actor_id, action, target_tenant, metadata_json) VALUES (?, ?, ?, ?, ?)').run(
        crypto.randomUUID(), req.user.id || null, 'revenuecat_sync', tenantId, JSON.stringify({ plan, entitlements, revenueCatId: rcId })
      );
    } catch (e) {
      return res.status(500).json({ error: String(e.message) });
    }
  }
  // Also handle annual flag: if any entitlement key contains 'annual', we could store billing interval
  const isAnnual = entitlements && Object.keys(entitlements).some(k => String(k).toLowerCase().includes('annual') && entitlements[k]);
  res.json({ ok: true, tenantId, plan: plan || null, revenueCatId: rcId, isAnnual: !!isAnnual });
});

// POST /api/billing/revenuecat/webhook - RevenueCat webhook (verification via REVENUECAT_WEBHOOK_SECRET)
router.post('/revenuecat/webhook', async (req, res) => {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ error: 'REVENUECAT_WEBHOOK_SECRET not configured' });
  // Verify Authorization header: RevenueCat sends Authorization: Bearer <secret> or X-Authorization etc.
  const auth = req.headers['authorization'] || req.headers['x-revenuecat-secret'] || req.headers['x-authorization'] || '';
  const raw = String(auth).trim();
  const token = raw.startsWith('Bearer ') ? raw.slice(7).trim() : raw;
  if (token !== secret) {
    // Also check query token fallback ?token=
    if (req.query?.authorization !== secret && req.query?.token !== secret) {
      return res.status(401).json({ error: 'invalid webhook secret' });
    }
  }
  // Parse RevenueCat event payload (supports multiple shapes)
  let payload = req.body;
  // If rawBody exists and body is not parsed, try parse
  if (!payload || typeof payload !== 'object') {
    try { payload = JSON.parse(req.rawBody || '{}'); } catch { payload = {}; }
  }
  try {
    // RevenueCat webhook types: event fields at top level or nested event
    const event = payload.event || payload;
    const type = event.type || event.event_type || payload.type || '';
    const appUserId = event.app_user_id || event.appUserId || payload.app_user_id || payload.appUserId || null;
    const productId = event.product_id || event.productId || payload.product_id || '';
    const entitlementIds = event.entitlement_ids || event.entitlementIds || Object.keys(event.entitlements || {}) || [];
    const entitlementsRaw = event.entitlements || payload.entitlements || {};
    // Build entitlements map for plan resolver
    let entMap = {};
    if (Array.isArray(entitlementIds) && entitlementIds.length) {
      for (const eid of entitlementIds) entMap[String(eid).toLowerCase()] = true;
    }
    if (entitlementsRaw && typeof entitlementsRaw === 'object') {
      for (const k of Object.keys(entitlementsRaw)) entMap[String(k).toLowerCase()] = true;
    }
    if (productId) entMap[String(productId).toLowerCase()] = true;

    const plan = resolvePlanFromEntitlements(entMap);

    if (!appUserId) {
      return res.json({ ok: true, ignored: 'no app_user_id' });
    }

    // Find tenant by revenuecat_user_id
    let tenant = db.prepare('SELECT id, revenuecat_user_id FROM tenants WHERE revenuecat_user_id = ?').get(appUserId);
    // Handle aliasing/transfers: RevenueCat TRANSFER event has transferred_from / transferred_to
    if (!tenant && type && String(type).toUpperCase().includes('TRANSFER')) {
      const fromId = event.transferred_from || event.transferredFrom || event.aliases?.[0];
      const toId = event.transferred_to || event.transferredTo || appUserId;
      if (fromId) {
        const fromTenant = db.prepare('SELECT id FROM tenants WHERE revenuecat_user_id = ?').get(fromId);
        if (fromTenant) {
          // Transfer alias to new id
          db.prepare('UPDATE tenants SET revenuecat_user_id = ?, updated_at = datetime(\'now\') WHERE id = ?').run(toId, fromTenant.id);
          tenant = { id: fromTenant.id };
          db.prepare('INSERT INTO admin_audit_log (id, actor_id, action, target_tenant, metadata_json) VALUES (?, ?, ?, ?, ?)').run(
            crypto.randomUUID(), null, 'revenuecat_webhook_transfer', tenant.id, JSON.stringify({ from: fromId, to: toId, type })
          );
        }
      }
    }

    if (!tenant) {
      // No matching tenant — log and ack (don't 404, let RevenueCat know we received)
      return res.json({ ok: true, ignored: 'no tenant for app_user_id', appUserId });
    }

    // Handle purchase/renewal -> set plan active; cancellation/expiration -> maybe downgrade?
    const lowerType = String(type).toLowerCase();
    if (lowerType.includes('cancellation') || lowerType.includes('expiration') || lowerType.includes('billing_issue')) {
      // Don't immediately downgrade enterprise/agency on billing issue; mark past_due or keep plan but set status
      const newStatus = lowerType.includes('billing_issue') ? 'past_due' : 'canceled';
      db.prepare('UPDATE tenants SET status = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newStatus, tenant.id);
      db.prepare('INSERT INTO admin_audit_log (id, actor_id, action, target_tenant, metadata_json) VALUES (?, ?, ?, ?, ?)').run(
        crypto.randomUUID(), null, 'revenuecat_webhook_cancellation', tenant.id, JSON.stringify({ type, productId, entMap })
      );
    } else if (plan) {
      db.prepare('UPDATE tenants SET plan = ?, status = \'active\', updated_at = datetime(\'now\') WHERE id = ?').run(plan, tenant.id);
      db.prepare('INSERT INTO admin_audit_log (id, actor_id, action, target_tenant, metadata_json) VALUES (?, ?, ?, ?, ?)').run(
        crypto.randomUUID(), null, 'revenuecat_webhook_sync', tenant.id, JSON.stringify({ type, plan, productId, entMap })
      );
    }

    res.json({ ok: true, tenantId: tenant.id, plan: plan || null, type });
  } catch (e) {
    console.error('revenuecat webhook error', e);
    res.status(500).json({ error: String(e.message) });
  }
});

export default router;
