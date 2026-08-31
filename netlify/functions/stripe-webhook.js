import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

export async function handler(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  if (!stripe) return { statusCode: 503, body: JSON.stringify({ error: 'Stripe not configured' }) };

  const sig = event.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
  } catch (err) {
    console.error('stripe webhook sig fail', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  // Lazy import DB (better-sqlite3 not available in all Netlify runtimes, so wrap)
  let db;
  try {
    const { default: dbMod } = await import('../../backend/src/db.js');
    db = dbMod;
  } catch (e) {
    console.warn('DB unavailable in webhook, logging only', e.message);
    return { statusCode: 200, body: JSON.stringify({ received: true, db: false }) };
  }

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object;
        const tenantId = session.metadata?.tenant_id;
        const customerId = session.customer;
        if (tenantId && customerId) {
          db.prepare('UPDATE tenants SET stripe_customer_id = ?, status = ? WHERE id = ?').run(customerId, 'active', tenantId);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = stripeEvent.data.object;
        const tenant = db.prepare('SELECT id FROM tenants WHERE stripe_customer_id = ?').get(sub.customer);
        if (tenant) {
          // Base plan price id is first item; extra seats may be second item (price_data or dedicated extra price)
          const priceId = sub.items.data[0]?.price.id;
          // Sum quantities across all subscription items to get total seats (base 1 + extras)
          // Fallback to metadata seats if present (checkout now sets metadata seats)
          const metaSeats = sub.metadata?.seats ? Number(sub.metadata.seats) : null;
          const totalQtyFromItems = sub.items.data.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
          // If subscription has 1 base item + extra seat items, total qty = 1 + extraSeats = total seats
          // But if extra seat price_data items were used, they still appear as items. So sum is correct.
          // For backward compatibility where old checkout used qty = seats, sum will still be seats.
          let qty = metaSeats && metaSeats > 0 ? metaSeats : (totalQtyFromItems || 1);
          // Guard: qty at least seatsIncluded? Use max(totalQtyFromItems,1) if meta missing
          if (!metaSeats) qty = totalQtyFromItems || 1;
          // Map priceId to plan - include both monthly and annual
          const planMap = {
            [process.env.STRIPE_PRICE_STARTER_MONTHLY]: 'starter',
            [process.env.STRIPE_PRICE_STARTER_ANNUAL]: 'starter',
            [process.env.STRIPE_PRICE_PRO_MONTHLY]: 'pro',
            [process.env.STRIPE_PRICE_PRO_ANNUAL]: 'pro',
            [process.env.STRIPE_PRICE_AGENCY_MONTHLY]: 'agency',
            [process.env.STRIPE_PRICE_AGENCY_ANNUAL]: 'agency',
          };
          const plan = planMap[priceId] || sub.metadata?.plan || tenant.plan || 'pro';
          db.prepare(`INSERT INTO subscriptions (id, tenant_id, stripe_subscription_id, stripe_price_id, status, quantity, current_period_end)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(stripe_subscription_id) DO UPDATE SET status=excluded.status, quantity=excluded.quantity, current_period_end=excluded.current_period_end`).run(
              sub.id, tenant.id, sub.id, priceId, sub.status, qty, new Date(sub.current_period_end * 1000).toISOString()
          );
          // Sync seats_included from total seats and plan (base + extra)
          db.prepare('UPDATE tenants SET plan = ?, status = ?, seats_included = ?, current_period_end = ? WHERE id = ?').run(plan, sub.status === 'active' ? 'active' : sub.status, qty, new Date(sub.current_period_end * 1000).toISOString(), tenant.id);
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = stripeEvent.data.object;
        db.prepare('UPDATE subscriptions SET status = ? WHERE stripe_subscription_id = ?').run('canceled', sub.id);
        const tenant = db.prepare('SELECT tenant_id FROM subscriptions WHERE stripe_subscription_id = ?').get(sub.id);
        if (tenant) db.prepare('UPDATE tenants SET status = ? WHERE id = ?').run('canceled', tenant.tenant_id);
        break;
      }
      case 'invoice.payment_failed': {
        const inv = stripeEvent.data.object;
        const tenant = db.prepare('SELECT id FROM tenants WHERE stripe_customer_id = ?').get(inv.customer);
        if (tenant) db.prepare('UPDATE tenants SET status = ? WHERE id = ?').run('past_due', tenant.id);
        break;
      }
      default:
        console.log(`Unhandled stripe event ${stripeEvent.type}`);
    }
  } catch (e) {
    console.error('webhook handler error', e);
    return { statusCode: 500, body: JSON.stringify({ error: String(e.message) }) };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
}
