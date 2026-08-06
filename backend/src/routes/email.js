import { Router } from 'express';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { emitEvent } from '../events.js';
import { getTransporter, resetTransporter, sendEmail } from '../emailer.js';

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

export default router;
