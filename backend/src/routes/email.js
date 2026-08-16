import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authenticate, authorize, roleAtLeast } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { emitEvent } from '../events.js';
import { resetTransporter, sendEmail, renderTemplate, getSmtpConfig, getPostmarkConfig, getProvider } from '../emailer.js';
import { encryptSecret } from '../secrets-crypto.js';
import { paginateResponse } from '../middleware/pagination.js';

const router = Router();
router.use(authenticate);

router.get('/config', roleAtLeast('staff'), (req, res) => {
  const cfg = getSmtpConfig();
  const pm = getPostmarkConfig();
  res.json({
    provider: getProvider(),
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
  const { host, port, secure, user, pass, from_name, from_email, postmark_token, postmark_from_name, postmark_from_email } = req.body || {};
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
  const tx = db.transaction((entries) => {
    for (const [key, value] of Object.entries(entries)) upsert.run(key, value);
  });
  tx(values);
  resetTransporter();
  res.json({ success: true, message: 'Email configuration saved', keys: Object.keys(values) });
});

router.post('/test', roleAtLeast('staff'), (req, res) => {
  const to = req.body.to || process.env.SMTP_USER;
  sendEmail(to, 'LUX Traffic Management - Email Test', 'This is a test email from LUX Traffic Management system.')
    .then(info => {
      res.json({ success: true, messageId: info.messageId });
    }).catch(err => {
      res.status(500).json({ error: 'Failed to send email', details: err.message });
    });
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
  const { name, subject, body, event_type } = req.validated;
  const existing = db.prepare('SELECT id FROM email_templates WHERE name = ?').get(name);
  if (existing) return res.status(409).json({ error: 'A template with this name already exists' });
  const id = uuid();
  db.prepare('INSERT INTO email_templates (id, name, subject, body, event_type) VALUES (?, ?, ?, ?, ?)')
    .run(id, name, subject, body, event_type || null);
  res.status(201).json(db.prepare('SELECT * FROM email_templates WHERE id = ?').get(id));
});

router.put('/templates/:id', authorize('developer'), validate('emailTemplate'), (req, res) => {
  const existing = db.prepare('SELECT * FROM email_templates WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Template not found' });
  const { name, subject, body, event_type } = req.validated;
  db.prepare("UPDATE email_templates SET name = ?, subject = ?, body = ?, event_type = ?, updated_at = datetime('now') WHERE id = ?")
    .run(name, subject, body, event_type || null, req.params.id);
  res.json(db.prepare('SELECT * FROM email_templates WHERE id = ?').get(req.params.id));
});

router.delete('/templates/:id', authorize('developer'), (req, res) => {
  const result = db.prepare('DELETE FROM email_templates WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Template not found' });
  res.json({ success: true });
});

router.post('/templates/:id/preview', roleAtLeast('staff'), (req, res) => {
  const tpl = db.prepare('SELECT * FROM email_templates WHERE id = ?').get(req.params.id);
  if (!tpl) return res.status(404).json({ error: 'Template not found' });
  const rendered = renderTemplate(tpl.name, req.body?.ctx || {});
  res.json(rendered);
});

export default router;
