import db from './db.js';
import { emitEvent } from './events.js';
import { sendEmail, getSmtpConfig } from './emailer.js';
import { maybeAutoBackup } from './backups.js';

function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function detectExpiringTmps(reminderDays) {
  const today = new Date();
  const toISO = (d) => d.toISOString().slice(0, 10);
  const windowEnd = toISO(new Date(today.getTime() + reminderDays * 86400000));
  const todayStr = toISO(today);

  const tmps = db.prepare(`
    SELECT * FROM traffic_management_plans
    WHERE end_date IS NOT NULL AND end_date != ''
      AND status NOT IN ('completed','cancelled')
  `).all();

  const expiring = [];
  const expired = [];
  for (const tmp of tmps) {
    if (tmp.end_date >= todayStr && tmp.end_date <= windowEnd) {
      emitEvent('tmp.expiring', tmp, { window_days: reminderDays });
      expiring.push(tmp);
    } else if (tmp.end_date < todayStr) {
      emitEvent('tmp.expired', tmp);
      expired.push(tmp);
    }
  }
  return { expiring, expired };
}

function detectExpiringPermits(reminderDays) {
  const today = new Date();
  const toISO = (d) => d.toISOString().slice(0, 10);
  const windowEnd = toISO(new Date(today.getTime() + reminderDays * 86400000));
  const todayStr = toISO(today);

  const permits = db.prepare(`
    SELECT pe.*, t.title as tmp_title, t.reference as tmp_reference, t.created_by as tmp_created_by
    FROM permits pe
    LEFT JOIN traffic_management_plans t ON pe.tmp_id = t.id
    WHERE pe.expiry_date IS NOT NULL AND pe.expiry_date != ''
      AND pe.status IN ('approved')
  `).all();

  const expiring = [];
  const expired = [];
  for (const permit of permits) {
    if (permit.expiry_date >= todayStr && permit.expiry_date <= windowEnd) {
      emitEvent('permit.expiring', permit, { window_days: reminderDays });
      expiring.push(permit);
    } else if (permit.expiry_date < todayStr) {
      emitEvent('permit.expired', permit);
      expired.push(permit);
    }
  }
  return { expiring, expired };
}

function detectSlaDeadlines() {
  const today = new Date();

  const permits = db.prepare(`
    SELECT pe.*, t.title as tmp_title, t.reference as tmp_reference, t.created_by as tmp_created_by
    FROM permits pe
    LEFT JOIN traffic_management_plans t ON pe.tmp_id = t.id
    WHERE pe.status IN ('submitted','under_review')
      AND pe.expiry_date IS NOT NULL AND pe.expiry_date != ''
  `).all();

  for (const permit of permits) {
    const due = new Date(permit.expiry_date);
    const daysLeft = Math.ceil((due.getTime() - today.getTime()) / 86400000);
    if (daysLeft >= 0 && daysLeft <= 14) {
      emitEvent('sla.deadline_approaching', permit, { days_left: daysLeft });
    } else if (daysLeft < 0) {
      emitEvent('sla.overdue', permit, { days_overdue: Math.abs(daysLeft) });
    }
  }
}

function cleanupOldRecords() {
  const notifDays = Math.max(7, parseInt(getSetting('notif_retention_days', '180'), 10) || 180);
  const emailDays = Math.max(7, parseInt(getSetting('email_retention_days', '365'), 10) || 365);
  const cutoff = (days) => new Date(Date.now() - days * 86400000).toISOString();
  const removedNotifications = db.prepare('DELETE FROM notifications WHERE created_at < ?').run(cutoff(notifDays)).changes;
  const removedEmails = db.prepare('DELETE FROM email_logs WHERE created_at < ?').run(cutoff(emailDays)).changes;
  if (removedNotifications || removedEmails) {
    console.log(`Retention cleanup: removed ${removedNotifications} notifications, ${removedEmails} email log entries`);
  }
}

export async function runScheduledChecks() {
  const reminderDays = Math.max(0, parseInt(getSetting('reminder_days', '14'), 10) || 14);
  const tmpResults = detectExpiringTmps(reminderDays);
  const permitResults = detectExpiringPermits(reminderDays);
  detectSlaDeadlines();
  cleanupOldRecords();
  try {
    await maybeAutoBackup();
  } catch (err) {
    console.error('Auto-backup failed:', err.message);
  }
  await sendReminderDigest({ ...tmpResults, ...permitResults }, reminderDays);
  return { ok: true, reminder_days: reminderDays };
}

async function sendReminderDigest({ expiring = [], expired = [], expiringPermits = [], expiredPermits = [] }, reminderDays) {
  try {
    if (getSetting('reminder_email_enabled', 'false') !== 'true') return;
    const cfg = getSmtpConfig();
    if (!cfg.host || cfg.host === 'smtp.example.com' || !cfg.fromEmail) return;

    const configured = String(getSetting('reminder_email_to', '')).trim();
    const recipients = configured
      ? configured.split(',').map(s => s.trim()).filter(Boolean)
      : db.prepare("SELECT email FROM users WHERE role IN ('developer','manager') AND email != ''").all().map(u => u.email);
    if (!recipients.length) return;

    const lines = [];
    const count = expiring.length + expired.length + expiringPermits.length + expiredPermits.length;
    if (expiring.length) {
      lines.push(`TMPs expiring within ${reminderDays} days:`);
      for (const t of expiring) lines.push(`  - ${t.reference} (${t.title}) ends ${t.end_date}`);
    }
    if (expired.length) {
      lines.push('TMPs past their end date (not completed):');
      for (const t of expired) lines.push(`  - ${t.reference} (${t.title}) ended ${t.end_date}`);
    }
    if (expiringPermits.length) {
      lines.push(`Approved permits expiring within ${reminderDays} days:`);
      for (const p of expiringPermits) lines.push(`  - ${p.tmp_reference || p.id} (${p.authority_id}) expires ${p.expiry_date}`);
    }
    if (expiredPermits.length) {
      lines.push('Approved permits past expiry:');
      for (const p of expiredPermits) lines.push(`  - ${p.tmp_reference || p.id} (${p.authority_id}) expired ${p.expiry_date}`);
    }
    if (!lines.length) return;

    const appName = getSetting('app_name', 'LUX Traffic Management');
    const body = `${appName} reminder summary\n${'='.repeat(40)}\n\n${lines.join('\n')}\n`;
    for (const to of recipients) {
      await sendEmail(to, `${appName} — ${count} item${count === 1 ? '' : 's'} need attention`, body);
    }
    console.log(`Reminder digest emailed to ${recipients.length} recipient(s): ${count} item(s)`);
  } catch (err) {
    console.error('Reminder digest email failed:', err.message);
  }
}

let intervalHandle = null;

export function startScheduler() {
  if (intervalHandle) return;
  runScheduledChecks();
  intervalHandle = setInterval(runScheduledChecks, 60 * 60 * 1000);
  intervalHandle.unref();
  console.log('Scheduler started (hourly checks for expiring TMPs/permits and SLA deadlines)');
}
