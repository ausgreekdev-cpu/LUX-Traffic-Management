import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { emitEvent } from '../events.js';
import { getTransporter, resetTransporter, sendEmail, renderTemplate } from '../emailer.js';

const router = Router();
router.use(authenticate);

router.post('/config', validate('emailConfig'), (req, res) => {
  const { host, port, user, pass } = req.validated;
  if (host) process.env.SMTP_HOST = host;
  if (port) process.env.SMTP_PORT = String(port);
  if (user) process.env.SMTP_USER = user;
  if (pass) process.env.SMTP_PASS = pass;
  resetTransporter();
  res.json({ success: true, message: 'Email configuration updated' });
});

router.post('/test', (req, res) => {
  const to = req.body.to || process.env.SMTP_USER;
  sendEmail(to, 'LUX Traffic Management - Email Test', 'This is a test email from LUX Traffic Management system.')
    .then(info => {
      res.json({ success: true, messageId: info.messageId });
    }).catch(err => {
      res.status(500).json({ error: 'Failed to send email', details: err.message });
    });
});

router.post('/send-tmp', validate('sendEmail'), (req, res) => {
  const { to, subject, body, tmp_id } = req.validated;
  sendEmail(to, subject, body, tmp_id || null)
    .then(info => {
      emitEvent('email.sent', { to, subject, tmp_id: tmp_id || null });
      res.json({ success: true, messageId: info.messageId });
    }).catch(err => {
      res.status(500).json({ error: 'Failed to send email', details: err.message });
    });
});

router.get('/logs', (req, res) => {
  let q = 'SELECT * FROM email_logs';
  const params = [];
  if (req.query.tmp_id) { q += ' WHERE tmp_id = ?'; params.push(req.query.tmp_id); }
  q += ' ORDER BY created_at DESC LIMIT 50';
  res.json(db.prepare(q).all(...params));
});

router.get('/templates', (req, res) => {
  res.json(db.prepare('SELECT * FROM email_templates ORDER BY name').all());
});

router.post('/templates', validate('emailTemplate'), (req, res) => {
  const { name, subject, body, event_type } = req.validated;
  const existing = db.prepare('SELECT id FROM email_templates WHERE name = ?').get(name);
  if (existing) return res.status(409).json({ error: 'A template with this name already exists' });
  const id = uuid();
  db.prepare('INSERT INTO email_templates (id, name, subject, body, event_type) VALUES (?, ?, ?, ?, ?)')
    .run(id, name, subject, body, event_type || null);
  res.status(201).json(db.prepare('SELECT * FROM email_templates WHERE id = ?').get(id));
});

router.put('/templates/:id', validate('emailTemplate'), (req, res) => {
  const existing = db.prepare('SELECT * FROM email_templates WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Template not found' });
  const { name, subject, body, event_type } = req.validated;
  db.prepare("UPDATE email_templates SET name = ?, subject = ?, body = ?, event_type = ?, updated_at = datetime('now') WHERE id = ?")
    .run(name, subject, body, event_type || null, req.params.id);
  res.json(db.prepare('SELECT * FROM email_templates WHERE id = ?').get(req.params.id));
});

router.delete('/templates/:id', (req, res) => {
  const result = db.prepare('DELETE FROM email_templates WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Template not found' });
  res.json({ success: true });
});

router.post('/templates/:id/preview', (req, res) => {
  const tpl = db.prepare('SELECT * FROM email_templates WHERE id = ?').get(req.params.id);
  if (!tpl) return res.status(404).json({ error: 'Template not found' });
  const rendered = renderTemplate(tpl.name, req.body?.ctx || {});
  res.json(rendered);
});

export default router;
