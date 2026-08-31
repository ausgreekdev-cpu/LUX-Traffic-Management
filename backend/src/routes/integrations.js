import { Router } from 'express';
import crypto from 'crypto';
import { randomUUID } from 'crypto';
import db from '../db.js';
import { ingestCorrespondence, reviewCorrespondence } from '../correspondence.js';
import { authenticate, roleAtLeast } from '../middleware/auth.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { decryptSecret } from '../secrets-crypto.js';

const router = Router();

function logDelivery({ provider, status, statusCode = null, error = null, correspondenceId = null, tmpReference = null }) {
  try {
    db.prepare(`
      INSERT INTO webhook_deliveries (id, provider, endpoint, status, status_code, error, correspondence_id, tmp_reference)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), String(provider), '/webhook/' + provider, status, statusCode, error, correspondenceId, tmpReference);
  } catch {}
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function verifySignature(req, secret) {
  const provided = req.headers['x-lux-signature'] || req.headers['x-webhook-signature'];
  if (!provided) return false;
  const expected = crypto.createHmac('sha256', secret).update(req.rawBody || '').digest('hex');
  const a = Buffer.from(provided.trim());
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function extractEmail(b, provider) {
  const p = (o, keys) => { for (const k of keys) { if (o && o[k]) return o[k]; } return null; };
  if (provider === 'mailgun') {
    return { sender: p(b, ['sender', 'from']), subject: p(b, ['subject', 'Subject']), text: p(b, ['stripped-text', 'body-plain', 'body-html']) };
  }
  if (provider === 'sendgrid') {
    return { sender: p(b, ['from']), subject: p(b, ['subject']), text: p(b, ['text']) };
  }
  if (provider === 'postmark') {
    return { sender: p(b, ['From']), subject: p(b, ['Subject']), text: p(b, ['TextBody']) };
  }
  return { sender: p(b, ['sender', 'from', 'email', 'From']), subject: p(b, ['subject', 'Subject']), text: p(b, ['text', 'body', 'message', 'TextBody']) };
}

router.post('/webhook/:provider', (req, res) => {
  const provider = String(req.params.provider || 'generic').toLowerCase();
  const secret = decryptSecret(getSetting('webhook_secret'));
  if (secret && !verifySignature(req, secret)) {
    logDelivery({ provider, status: 'failed', statusCode: 401, error: 'Invalid webhook signature' });
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }
  const b = req.body || {};
  const email = extractEmail(b, provider);
  if (!email.text && !email.subject) {
    logDelivery({ provider, status: 'failed', statusCode: 400, error: 'No subject or body content provided' });
    return res.status(400).json({ error: 'No subject or body content provided' });
  }
  const result = ingestCorrespondence({
    source: provider === 'generic' ? 'webhook' : `${provider} inbound`,
    provider,
    sender: String(email.sender || '').slice(0, 255),
    subject: String(email.subject || '').slice(0, 255),
    raw_text: String(email.text || ''),
    received_at: b.timestamp || b.Date || new Date().toISOString()
  });
  logDelivery({ provider, status: 'received', statusCode: 202, correspondenceId: result.id, tmpReference: result.tmp_reference });
  res.status(202).json({ received: true, correspondence_id: result.id, tmp_reference: result.tmp_reference, matched: !!result.permit_id, extracted_status: result.extracted_status });
});

router.get('/correspondence', authenticate, roleAtLeast('manager'), requireEntitlement('api_access'), (req, res) => {
  let q = 'SELECT * FROM correspondence';
  const where = [];
  const params = [];
  if (req.query.review_status) { where.push('review_status = ?'); params.push(req.query.review_status); }
  if (req.query.tmp_id) { where.push('matched_tmp_id = ?'); params.push(req.query.tmp_id); }
  if (where.length) q += ' WHERE ' + where.join(' AND ');
  q += ' ORDER BY created_at DESC LIMIT ?';
  params.push(Math.min(200, Math.max(1, parseInt(req.query.limit) || 50)));
  res.json({ data: db.prepare(q).all(...params) });
});

router.post('/correspondence/:id/review', authenticate, roleAtLeast('manager'), requireEntitlement('api_access'), (req, res) => {
  const { review_status } = req.body || {};
  const result = reviewCorrespondence(req.params.id, { review_status, by: req.user?.id || null });
  if (!result) return res.status(404).json({ error: 'Correspondence not found' });
  res.json(result);
});

export default router;
