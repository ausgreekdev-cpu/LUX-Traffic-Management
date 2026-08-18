import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authenticate, authorize, roleAtLeast } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { emitEvent } from '../events.js';
import { resetTransporter, sendEmail, getSmtpConfig, getPostmarkConfig, getProvider, getSetting, verifySmtpConnection, classifySmtpError } from '../emailer.js';
import { encryptSecret } from '../secrets-crypto.js';
import { paginateResponse } from '../middleware/pagination.js';

const router = Router();
router.use(authenticate);

router.get('/config', roleAtLeast('staff'), (req, res) => {
  const cfg = getSmtpConfig();
  const pm = getPostmarkConfig();
  res.json({
    provider: getProvider(),
    mail_provider: getSetting('mail_provider'),
    host: cfg.host === 'smtp.example.com' ? '' : cfg.host,
    port: String(cfg.port),
    secure: cfg.secure,
    user: cfg.user,
    pass: '',
    has_pass: !!cfg.pass,
    from_name: cfg.fromName,
    from_email: cfg.fromEmail,
    postmark_token: '',
    has_postmark_token: !!pm.token,
    postmark_from_name: pm.fromName,
    postmark_from_email: pm.fromEmail,
    source: 'settings'
  });
});

router.post('/config', authorize('developer'), (req, res) => {
  const { host, port, secure, user, pass, from_name, from_email, postmark_token, postmark_from_name, postmark_from_email, provider } = req.body || {};
  const upsert = db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  const values = {};
  if (host !== undefined) values.smtp_host = String(host).trim();
  if (port !== undefined) values.smtp_port = String(parseInt(port, 10) || 587);
  if (secure !== undefined) values.smtp_secure = secure ? 'true' : 'false';
  if (user !== undefined) values.smtp_user = String(user).trim();
  if (pass !== undefined && String(pass).length > 0) values.smtp_pass = encryptSecret(String(pass));
  if (from_name !== undefined) values.smtp_from_name = String(from_name).trim();
  if (from_email !== undefined) values.smtp_from_email = String(from_email).trim();
  if (postmark_token !== undefined && String(postmark_token).length > 0) values.postmark_api_token = encryptSecret(String(postmark_token).trim());
  if (postmark_from_name !== undefined) values.postmark_from_name = String(postmark_from_name).trim();
  if (postmark_from_email !== undefined) values.postmark_from_email = String(postmark_from_email).trim();
  if (provider !== undefined && (provider === 'smtp' || provider === 'postmark')) values.mail_provider = String(provider);
  const tx = db.transaction((entries) => {
    for (const [key, value] of Object.entries(entries)) upsert.run(key, value);
  });
  tx(values);
  resetTransporter();
  res.json({ success: true, message: 'Email configuration saved', keys: Object.keys(values) });
});

router.post('/test', roleAtLeast('staff'), async (req, res) => {
  const cfg = getSmtpConfig();
  const provider = getProvider();
  const transport = { provider, host: cfg.host, port: cfg.port, secure: cfg.secure, user: cfg.user, from: cfg.fromEmail || cfg.user };
  const to = String(req.body?.to || '').trim() || cfg.fromEmail || process.env.SMTP_USER;
  if (!to) {
    return res.status(400).json({ success: false, error: 'No recipient — provide a "to" email.', transport });
  }
  try {
    const info = await sendEmail(to, 'LUX Traffic Management - Email Test', 'This is a test email from LUX Traffic Management system.');
    res.json({ success: true, messageId: info.messageId, transport });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
      code: err.code || null,
      response: err.response || null,
      hint: classifySmtpError(err),
      transport
    });
  }
});

router.get('/verify', roleAtLeast('staff'), async (req, res) => {
  const result = await verifySmtpConnection();
  res.json(result);
});

router.post('/send-tmp', roleAtLeast('staff'), validate('sendEmail'), (req, res) => {
  const { to, subject, body, tmp_id } = req.validated;
  sendEmail(to, subject, body, tmp_id || null)
    .then(info => {
      emitEvent('email.sent', { to, subject, tmp_id: tmp_id || null });
      res.json({ success: true, messageId: info.messageId });
    }).catch(err => {
      res.status(500).json({ error: 'Failed to send email', details: err.message });
    });
});

router.get('/logs', roleAtLeast('manager'), (req, res) => {
  let q = 'SELECT * FROM email_logs';
  const params = [];
  if (req.query.tmp_id) { q += ' WHERE tmp_id = ?'; params.push(req.query.tmp_id); }
  q += ' ORDER BY created_at DESC';
  res.json(paginateResponse(req, db.prepare(q).all(...params)));
});

router.get('/templates', roleAtLeast('staff'), (req, res) => {
  res.json(db.prepare('SELECT * FROM email_templates ORDER BY name').all());
});

router.post('/templates', authorize('developer'), validate('emailTemplate'), (req, res) => {
  const { name, subject, body, event_type, html_body } = req.validated;
  const existing = db.prepare('SELECT id FROM email_templates WHERE name = ?').get(name);
  if (existing) return res.status(409).json({ error: 'A template with this name already exists' });
  const id = uuid();
  db.prepare('INSERT INTO email_templates (id, name, subject, body, event_type, html_body) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, name, subject, body, event_type || null, html_body || null);
  res.status(201).json(db.prepare('SELECT * FROM email_templates WHERE id = ?').get(id));
});

router.put('/templates/:id', authorize('developer'), validate('emailTemplate'), (req, res) => {
  const existing = db.prepare('SELECT * FROM email_templates WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Template not found' });
  const { name, subject, body, event_type, html_body } = req.validated;
  db.prepare("UPDATE email_templates SET name = ?, subject = ?, body = ?, event_type = ?, html_body = ?, updated_at = datetime('now') WHERE id = ?")
    .run(name, subject, body, event_type || null, html_body || null, req.params.id);
  res.json(db.prepare('SELECT * FROM email_templates WHERE id = ?').get(req.params.id));
});

router.delete('/templates/:id', authorize('developer'), (req, res) => {
  const result = db.prepare('DELETE FROM email_templates WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Template not found' });
  res.json({ success: true });
});

const fillPlaceholders = (str, ctx) => String(str || '').replace(/\{([\w.]+)\}/g, (m, key) => (ctx[key] !== undefined && ctx[key] !== null ? ctx[key] : m));

// Render an unsaved draft (editor preview) — inline template data + ctx.
router.post('/templates/preview', roleAtLeast('staff'), (req, res) => {
  const draft = req.body?.draft || {};
  const ctx = req.body?.ctx || {};
  res.json({
    subject: fillPlaceholders(draft.subject, ctx),
    body: fillPlaceholders(draft.body, ctx),
    html_body: draft.html_body ? fillPlaceholders(draft.html_body, ctx) : (draft.html_body || null)
  });
});

router.post('/templates/:id/preview', roleAtLeast('staff'), (req, res) => {
  const tpl = db.prepare('SELECT * FROM email_templates WHERE id = ?').get(req.params.id);
  if (!tpl) return res.status(404).json({ error: 'Template not found' });
  const draft = req.body?.draft || {};
  const merged = { ...tpl, ...draft };
  const ctx = req.body?.ctx || {};
  res.json({
    subject: fillPlaceholders(merged.subject, ctx),
    body: fillPlaceholders(merged.body, ctx),
    html_body: merged.html_body ? fillPlaceholders(merged.html_body, ctx) : (merged.html_body || null)
  });
});

export default router;
