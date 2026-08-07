import db from './db.js';
import { emitEvent } from './events.js';

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

  for (const tmp of tmps) {
    if (tmp.end_date >= todayStr && tmp.end_date <= windowEnd) {
      emitEvent('tmp.expiring', tmp, { window_days: reminderDays });
    } else if (tmp.end_date < todayStr) {
      emitEvent('tmp.expired', tmp);
    }
  }
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

  for (const permit of permits) {
    if (permit.expiry_date >= todayStr && permit.expiry_date <= windowEnd) {
      emitEvent('permit.expiring', permit, { window_days: reminderDays });
    } else if (permit.expiry_date < todayStr) {
      emitEvent('permit.expired', permit);
    }
  }
}

function detectSlaDeadlines() {
  const today = new Date();
  const toISO = (d) => d.toISOString().slice(0, 10);
  const todayStr = toISO(today);

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

export function runScheduledChecks() {
  const reminderDays = Math.max(0, parseInt(getSetting('reminder_days', '14'), 10) || 14);
  detectExpiringTmps(reminderDays);
  detectExpiringPermits(reminderDays);
  detectSlaDeadlines();
  cleanupOldRecords();
  return { ok: true, reminder_days: reminderDays };
}

let intervalHandle = null;

export function startScheduler() {
  if (intervalHandle) return;
  runScheduledChecks();
  intervalHandle = setInterval(runScheduledChecks, 60 * 60 * 1000);
  intervalHandle.unref();
  console.log('Scheduler started (hourly checks for expiring TMPs/permits and SLA deadlines)');
}
