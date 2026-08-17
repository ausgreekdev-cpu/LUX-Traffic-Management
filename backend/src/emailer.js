import { v4 as uuid } from 'uuid';
import { createRequire } from 'module';
import db from './db.js';
import { decryptSecret } from './secrets-crypto.js';

let transporter = null;
let _nodemailer = null;

const requirePkg = typeof require !== 'undefined' ? require : createRequire(import.meta.url);

function getNodemailer() {
  if (!_nodemailer) _nodemailer = requirePkg('nodemailer');
  return _nodemailer;
}

const getSetting = (key) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : '';
};

export { getSetting };

const env = (name) => process.env[name] !== undefined ? process.env[name] : null;

export function getProvider() {
  const explicit = getSetting('mail_provider');
  if (explicit === 'smtp') return 'smtp';
  if (explicit === 'postmark') return 'postmark';
  return getPostmarkConfig().token ? 'postmark' : 'smtp';
}

export function getPostmarkConfig() {
  const token = decryptSecret(getSetting('postmark_api_token')) || env('POSTMARK_API_TOKEN') ||
    (env('NETLIFY_EMAILS_PROVIDER') === 'postmark' ? env('NETLIFY_EMAILS_PROVIDER_API_KEY') : null);
  const fromName = getSetting('postmark_from_name') || env('POSTMARK_FROM_NAME') || '';
  const fromEmail = getSetting('postmark_from_email') || env('POSTMARK_FROM_EMAIL') || '';
  const stream = getSetting('postmark_message_stream') || env('POSTMARK_MESSAGE_STREAM') || 'outbound';
  return { token, fromName, fromEmail, stream };
}

export function getSmtpConfig() {
  const host = getSetting('smtp_host') || env('SMTP_HOST') || 'smtp.example.com';
  const port = parseInt(getSetting('smtp_port') || env('SMTP_PORT') || '587', 10);
  const secure = (getSetting('smtp_secure') || env('SMTP_SECURE') || 'false') === 'true';
  const user = getSetting('smtp_user') || env('SMTP_USER') || '';
  const pass = decryptSecret(getSetting('smtp_pass')) || env('SMTP_PASS') || '';
  const fromName = getSetting('smtp_from_name') || env('SMTP_FROM_NAME') || '';
  const fromEmail = getSetting('smtp_from_email') || env('SMTP_FROM_EMAIL') || user;
  return { host, port, secure, user, pass, fromName, fromEmail };
}

export function resetTransporter() {
  transporter = null;
}

export function getTransporter() {
  if (transporter) return transporter;
  const cfg = getSmtpConfig();
  const transport = {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure
  };
if (cfg.user) transport.auth = { user: cfg.user, pass: cfg.pass };
  transporter = getNodemailer().createTransport(transport);
  return transporter;
}

function formatFrom(name, email) {
  return email ? (name ? `"${name.replace(/"/g, '\\"')}" <${email}>` : email) : undefined;
}

async function sendPostmark(to, subject, body) {
  const cfg = getPostmarkConfig();
  const from = formatFrom(cfg.fromName, cfg.fromEmail);
  const payload = { From: from, To: to, Subject: subject, TextBody: body };
  if (cfg.stream && cfg.stream !== 'outbound') payload.MessageStream = cfg.stream;
  const res = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': cfg.token
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ErrorCode) {
    const err = new Error(`Postmark ${res.status}: ${data.Message || 'Request failed'}`);
    err.code = data.ErrorCode;
    throw err;
  }
  return { messageId: data.MessageID, provider: 'postmark' };
}

export async function sendEmail(to, subject, body, tmpId = null) {
  let info;
  if (getProvider() === 'postmark') {
    info = await sendPostmark(to, subject, body);
  } else {
    const cfg = getSmtpConfig();
    const from = formatFrom(cfg.fromName, cfg.fromEmail);
    info = await getTransporter().sendMail({
      from,
      to,
      subject,
      text: body
    });
    info.provider = 'smtp';
  }
  db.prepare('INSERT INTO email_logs (id, to_address, subject, body, tmp_id, status) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuid(), to, subject, body, tmpId || null, 'sent');
  return info;
}

export function renderTemplate(name, ctx) {
  const tpl = db.prepare('SELECT * FROM email_templates WHERE name = ?').get(name);
  if (!tpl) return null;
  const fill = (str) => String(str || '').replace(/\{([\w.]+)\}/g, (m, key) => (ctx[key] !== undefined && ctx[key] !== null ? ctx[key] : m));
  return { ...tpl, subject: fill(tpl.subject), body: fill(tpl.body) };
}
