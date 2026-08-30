import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import db from '../db.js';
import { getTier, TIERS } from '../saas/tiers.js';
import { resolveEntitlements, can } from '../saas/entitlements.js';
const requireAuth = authenticate;

const router = express.Router();

// GET /api/billing/plans - list tiers with Stripe price IDs (server-provided, no VITE_ leak)
router.get('/plans', (req, res) => {
  const priceMap = {
    starter: { monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY || null, annual: process.env.STRIPE_PRICE_STARTER_ANNUAL || null },
    pro: { monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || null, annual: process.env.STRIPE_PRICE_PRO_ANNUAL || null },
    agency: { monthly: process.env.STRIPE_PRICE_AGENCY_MONTHLY || null, annual: process.env.STRIPE_PRICE_AGENCY_ANNUAL || null },
  };
  res.json(Object.values(TIERS).map(t => ({
    id: t.id, name: t.name, priceMonthly: t.priceMonthly, priceAnnual: t.priceAnnual,
    seatsIncluded: t.seatsIncluded, extraSeatPrice: t.extraSeatPrice,
    limits: t.limits, features: t.features,
    priceIdMonthly: priceMap[t.id]?.monthly || null,
    priceIdAnnual: priceMap[t.id]?.annual || null,
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

// POST /api/billing/checkout - create Stripe Checkout session (supports seats quantity and annual)
router.post('/checkout', requireAuth, async (req, res) => {
  const { priceId, seats, quantity, success_url, cancel_url } = req.body;
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Stripe not configured' });
  const qty = Math.max(1, Number(seats || quantity || 1));
  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const tenantId = req.user.tenant_id || db.prepare('SELECT id FROM tenants LIMIT 1').get()?.id;
    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: tenant?.stripe_customer_id || undefined,
      customer_email: !tenant?.stripe_customer_id ? req.user.email : undefined,
      line_items: [{ price: priceId, quantity: qty }],
      success_url: success_url || `${process.env.APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || `${process.env.APP_URL}/billing/cancel`,
      metadata: { tenant_id: tenantId },
    });
    res.json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// GET /api/billing/usage - seat/project/pdf usage meters
router.get('/usage', requireAuth, (req, res) => {
  const tenantId = req.user.tenant_id || db.prepare('SELECT id FROM tenants LIMIT 1').get()?.id;
  if (!tenantId) return res.status(404).json({ error: 'no_tenant' });
  const ent = resolveEntitlements(tenantId);
  const seatsUsed = db.prepare('SELECT count(*) as c FROM tenant_users WHERE tenant_id = ?').get(tenantId).c;
  const activeProjects = db.prepare("SELECT count(*) as c FROM traffic_management_plans WHERE tenant_id = ? AND status != 'completed'").get(tenantId)?.c || 0;
  const pdfUsed = (() => { try { return db.prepare("SELECT used FROM usage_counters WHERE tenant_id = ? AND feature_key = 'pdf_exports_per_month' AND period = ?").get(tenantId, new Date().toISOString().slice(0,7))?.used || 0; } catch { return 0; } })();
  res.json({ tenantId, plan: ent?.tenant?.plan, seats: { used: seatsUsed, limit: ent?.limits?.seats }, projects: { used: activeProjects, limit: ent?.limits?.active_projects }, pdfs: { used: pdfUsed, limit: ent?.limits?.pdf_exports_per_month } });
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

// POST /api/billing/revenuecat - sync RevenueCat entitlements (mobile)
router.post('/revenuecat', requireAuth, async (req, res) => {
  const { entitlements, revenueCatId } = req.body; // e.g., { pro: true }
  const tenantId = req.user.tenant_id || db.prepare('SELECT id FROM tenants LIMIT 1').get()?.id;
  if (revenueCatId) {
    db.prepare('UPDATE tenants SET revenuecat_user_id = ? WHERE id = ?').run(revenueCatId, tenantId);
  }
  // Map RevenueCat entitlements to our feature keys
  if (entitlements?.pro) {
    db.prepare(`UPDATE tenants SET plan = 'pro' WHERE id = ?`).run(tenantId);
  }
  res.json({ ok: true, tenantId });
});

export default router;
