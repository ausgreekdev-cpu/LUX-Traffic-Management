import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import db from '../db.js';
import { getTier, TIERS } from '../saas/tiers.js';
import { resolveEntitlements, can } from '../saas/entitlements.js';
const requireAuth = authenticate;

const router = express.Router();

// GET /api/billing/plans - list tiers
router.get('/plans', (req, res) => {
  res.json(Object.values(TIERS).map(t => ({
    id: t.id, name: t.name, priceMonthly: t.priceMonthly, priceAnnual: t.priceAnnual,
    seatsIncluded: t.seatsIncluded, extraSeatPrice: t.extraSeatPrice,
    limits: t.limits, features: t.features,
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

// POST /api/billing/checkout - create Stripe Checkout session
router.post('/checkout', requireAuth, async (req, res) => {
  const { priceId, success_url, cancel_url } = req.body;
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Stripe not configured' });
  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const tenantId = req.user.tenant_id || db.prepare('SELECT id FROM tenants LIMIT 1').get()?.id;
    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: tenant?.stripe_customer_id || undefined,
      customer_email: !tenant?.stripe_customer_id ? req.user.email : undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: success_url || `${process.env.APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || `${process.env.APP_URL}/billing/cancel`,
      metadata: { tenant_id: tenantId },
    });
    res.json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
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
