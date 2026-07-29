import { Router } from 'express';
import nodemailer from 'nodemailer';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
router.use(authenticate);

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.example.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return transporter;
}

router.post('/config', validate('emailConfig'), (req, res) => {
  const { host, port, user, pass } = req.validated;
  if (host) process.env.SMTP_HOST = host;
  if (port) process.env.SMTP_PORT = String(port);
  if (user) process.env.SMTP_USER = user;
  if (pass) process.env.SMTP_PASS = pass;
  transporter = null;
  res.json({ success: true, message: 'Email configuration updated' });
});

router.post('/test', (req, res) => {
  const to = req.body.to || process.env.SMTP_USER;
  getTransporter().sendMail({
    from: process.env.SMTP_USER,
    to,
    subject: 'LUX Traffic Management - Email Test',
    text: 'This is a test email from LUX Traffic Management system.'
  }).then(info => {
    db.prepare('INSERT INTO email_logs (id, to_address, subject, body, status) VALUES (?, ?, ?, ?, ?)').run(uuid(), to, 'Test Email', 'Test email sent successfully', 'sent');
    res.json({ success: true, messageId: info.messageId });
  }).catch(err => {
    res.status(500).json({ error: 'Failed to send email', details: err.message });
  });
});

router.post('/send-tmp', validate('sendEmail'), (req, res) => {
  const { to, subject, body, tmp_id } = req.validated;
  getTransporter().sendMail({
    from: process.env.SMTP_USER,
    to,
    subject,
    text: body
  }).then(info => {
    db.prepare('INSERT INTO email_logs (id, to_address, subject, body, tmp_id, status) VALUES (?, ?, ?, ?, ?, ?)').run(uuid(), to, subject, body, tmp_id || null, 'sent');
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
