import nodemailer from 'nodemailer';
import { v4 as uuid } from 'uuid';
import db from './db.js';

let transporter = null;

export function resetTransporter() {
  transporter = null;
}

export function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.example.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return transporter;
}

export async function sendEmail(to, subject, body, tmpId = null) {
  const info = await getTransporter().sendMail({
    from: process.env.SMTP_USER,
    to,
    subject,
    text: body
  });
  db.prepare('INSERT INTO email_logs (id, to_address, subject, body, tmp_id, status) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuid(), to, subject, body, tmpId || null, 'sent');
  return info;
}
