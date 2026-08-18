import { v4 as uuid } from 'uuid';
import { createRequire } from 'module';
import db from './db.js';
import { decryptSecret } from './secrets-crypto.js';
import { getPublicSummary, getBrandingRow, THEME_DEFAULTS } from './branding.js';

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
  const pass = decryptSecret(getSetting('smtp_pass')) || env('SMTP_PASSWORD') || env('SMTP_PASS') || '';
  const fromName = getSetting('smtp_from_name') || env('SMTP_FROM_NAME') || '';
  const fromEmail = getSetting('smtp_from_email') || env('SMTP_FROM_EMAIL') || user;
  const ciphers = env('SMTP_CIPHERS') || '';
  return { host, port, secure, user, pass, fromName, fromEmail, ciphers };
}

export function resetTransporter() {
  if (transporter) {
    try { transporter.close(); } catch {}
  }
  transporter = null;
}

export function getTransporter() {
  if (transporter) return transporter;
  const cfg = getSmtpConfig();
  const transport = {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    // Connection pooling — reuse warm sockets across sends within one instance.
    pool: true,
    maxConnections: 3,
    maxMessages: 50,
    // TLS: Microsoft 365 requires TLS 1.2+ and STARTTLS on port 587. Node has
    // removed SSLv3 entirely, so we pin a modern minimum instead of the legacy
    // 'SSLv3' cipher string. SMTP_CIPHERS can override the cipher list if ever
    // needed for an unusual provider.
    minVersion: 'TLSv1.2',
    requireTLS: !cfg.secure
  };
  if (cfg.ciphers) transport.ciphers = cfg.ciphers;
  if (cfg.user) transport.auth = { user: cfg.user, pass: cfg.pass };
  transporter = getNodemailer().createTransport(transport);
  return transporter;
}

// ----------------------------------------------------------------- retries

const RETRYABLE_SMTP_CODES = new Set(['421', '450', '451', '452', '454']);
const RETRYABLE_NET_CODES = new Set(['ESOCKET', 'ECONNECTION', 'ETIMEDOUT', 'ECONNRESET', 'EPIPE', 'ECONNREFUSED', 'EAI_AGAIN']);

// Retry only genuinely transient failures (throttling, 4xx retryable codes,
// connection blips). Auth/relay/permanent 5xx errors fail fast.
function isTransientError(err) {
  const code = String(err?.code || '');
  const response = String(err?.response || '');
  if (RETRYABLE_NET_CODES.has(code)) return true;
  if (RETRYABLE_SMTP_CODES.has(code)) return true;
  const match = response.match(/\b(\d{3})\b/);
  return !!match && String(match[1]).startsWith('4');
}

async function sendWithRetry(fn, attempts = 3, baseDelayMs = 750) {
  let lastErr;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === attempts - 1 || !isTransientError(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt));
    }
  }
  throw lastErr;
}

// Map provider error signatures to actionable, human-readable hints.
export function classifySmtpError(err) {
  const message = String(err?.message || '');
  const response = String(err?.response || '');
  const code = String(err?.code || '');
  const blob = message + ' ' + response;
  if (/5\.7\.(8|139|14|34)|535|basic authentication|authentication failed/i.test(blob)) {
    return 'Authentication failed. For Microsoft 365 this usually means SMTP AUTH is blocked: disable Security Defaults and/or enable SMTP AUTH for the mailbox (Set-CASMailbox -SmtpClientAuthenticationDisabled $false), or use an app password when MFA is enforced.';
  }
  if (/5\.7\.57|530|smtp auth not enabled/i.test(blob)) {
    return 'SMTP AUTH is not enabled for this mailbox. Ask the tenant admin to enable SMTP AUTH (Set-CASMailbox -SmtpClientAuthenticationDisabled $false), then wait up to an hour.';
  }
  if (/454|4\.7\.0|throttl|too many|temporar/i.test(blob)) {
    return 'The provider throttled the request. Microsoft 365 rate-limits per mailbox/IP — retrying automatically, but frequent sends may need to be spread out.';
  }
  if (/^421|421 /.test(blob)) {
    return 'Mail server busy or IP throttled (421). Wait and retry; repeated 421s may indicate the sending IP is restricted.';
  }
  if (/ECONNECTION|ETIMEDOUT|ESOCKET|ECONNREFUSED|EAI_AGAIN/.test(code)) {
    return 'Network connection failed — confirm the host is reachable and outbound port 587 (STARTTLS) is not blocked by a firewall/VPN.';
  }
  if (/starttls|tls|ssl|socket/i.test(blob) && !/certificate/i.test(blob)) {
    return 'TLS negotiation failed — the server rejected STARTTLS. For Microsoft 365 use port 587 with STARTTLS (do not use 465 unless you also set "Use TLS/SSL" on).';
  }
  return null;
}

// Startup health probe — logs whether the configured SMTP endpoint accepts a
// connection and authenticates. Returns a structured result, never throws.
export async function verifySmtpConnection() {
  const cfg = getSmtpConfig();
  const base = { provider: 'smtp', host: cfg.host, port: cfg.port, secure: cfg.secure, user: cfg.user };
  try {
    await getTransporter().verify();
    return { ...base, ok: true };
  } catch (err) {
    return { ...base, ok: false, error: err.message, code: err.code || null, response: err.response || null, hint: classifySmtpError(err) };
  }
}

function formatFrom(name, email) {
  return email ? (name ? `"${name.replace(/"/g, '\\"')}" <${email}>` : email) : undefined;
}

async function sendPostmark(to, subject, body, html) {
  const cfg = getPostmarkConfig();
  const from = formatFrom(cfg.fromName, cfg.fromEmail);
  const payload = { From: from, To: to, Subject: subject, TextBody: body };
  if (html) payload.HtmlBody = html;
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

function siteBase() {
  return process.env.URL || process.env.SITE_URL || 'https://lux-official.netlify.app';
}

// Plain-text messages are auto-wrapped in a white-labelled HTML shell when the
// brand has email branding enabled. Fully editable templates use html_body.
export function buildBrandedHtml(text, subject) {
  const summary = getPublicSummary();
  const email = getBrandingRow()?.email || {};
  const accent = email.accent || summary.themeColor || THEME_DEFAULTS.primary;
  const footer = email.footer || '';
  const logo = summary.assets.logoLight ? siteBase() + summary.assets.logoLight : null;
  const app = summary.appName || 'LUX Traffic Management';
  const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const bodyHtml = String(text || '').replace(/\r?\n/g, '<br>');
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb">
${logo
    ? `<tr><td style="padding:20px 24px 0;text-align:center"><img src="${esc(logo)}" alt="${esc(app)}" height="48" style="max-height:48px;max-width:200px;object-fit:contain"/></td></tr>`
    : `<tr><td style="padding:20px 24px 0;text-align:center;font-weight:bold;color:#111827;font-size:16px">${esc(app)}</td></tr>`}
${subject ? `<tr><td style="padding:8px 24px 0;text-align:center;color:#374151;font-size:13px">${esc(subject)}</td></tr>` : ''}
<tr><td style="padding:16px 24px;color:#111827;font-size:14px;line-height:1.6">${bodyHtml}</td></tr>
${footer ? `<tr><td style="padding:12px 24px 16px;color:#6b7280;font-size:12px;border-top:1px solid ${esc(accent)};text-align:center">${esc(footer)}</td></tr>` : ''}
</table></td></tr></table></body></html>`;
}

function emailBrandingEnabled() {
  return !!(getBrandingRow()?.email?.enabled);
}

export async function sendEmail(to, subject, body, tmpId = null, opts = {}) {
  const html = opts.html || (emailBrandingEnabled() ? buildBrandedHtml(body, subject) : undefined);
  let info;
  if (getProvider() === 'postmark') {
    info = await sendWithRetry(() => sendPostmark(to, subject, body, html));
  } else {
    const cfg = getSmtpConfig();
    const from = formatFrom(cfg.fromName, cfg.fromEmail);
    const mail = { from, to, subject, text: body };
    if (html) mail.html = html;
    info = await sendWithRetry(() => getTransporter().sendMail(mail));
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
  return { ...tpl, subject: fill(tpl.subject), body: fill(tpl.body), html_body: tpl.html_body ? fill(tpl.html_body) : tpl.html_body };
}
