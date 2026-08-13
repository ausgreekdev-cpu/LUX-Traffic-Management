import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import db, { dbPath, isServerless, reopenDatabase } from './db.js';

function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value);
}

export function backupsDir() {
  const dir = path.join(path.dirname(dbPath), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function secondaryBackupsDir() {
  const configured = process.env.LUX_SECONDARY_BACKUP_DIR;
  if (configured) {
    fs.mkdirSync(configured, { recursive: true });
    return configured;
  }
  const home = os.homedir();
  if (!home) return null;
  const dir = path.join(home, 'LUX Backup');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function uploadBackupToBlobs(filePath, backupName, size) {
  const hasBlobEnv = process.env.NETLIFY_BLOBS_SITE_ID && process.env.NETLIFY_BLOBS_TOKEN;
  if (process.env.LUX_BLOB_BACKUP_ENABLED !== 'true' || !hasBlobEnv) return;
  try {
    const { getStore } = await import('@netlify/blobs');
    const store = getStore({
      name: 'lux-db-backups',
      siteID: process.env.NETLIFY_BLOBS_SITE_ID,
      token: process.env.NETLIFY_BLOBS_TOKEN
    });
    const bytes = fs.readFileSync(filePath);
    await Promise.race([
      store.set(`backups/${backupName}`, bytes, { metadata: { size, at: new Date().toISOString() } }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('offsite upload timed out')), 8000))
    ]);
    console.log(`[backups] offsite copy uploaded to Netlify Blobs: ${backupName} (${size} bytes)`);
  } catch (err) {
    console.warn(`[backups] offsite copy failed (non-fatal): ${err.message}`);
  }
}

export async function backupNow({ reason = 'manual' } = {}) {
  if (isServerless) throw new Error('Backups are not available on serverless deployments.');
  const now = new Date().toISOString();
  const stamp = `${now.slice(0, 10)}_${now.slice(11, 19).replace(/:/g, '-')}`;
  const fileName = `lux-backup-${stamp}.db`;
  const filePath = path.join(backupsDir(), fileName);
  await db.backup(filePath);
  const size = fs.statSync(filePath).size;
  const secondary = secondaryBackupsDir();
  if (secondary) {
    try {
      await db.backup(path.join(secondary, fileName));
      pruneBackupsIn(secondary, Math.max(1, parseInt(getSetting('auto_backup_retention_days', '30'), 10) || 30));
    } catch (err) {
      console.warn(`[backups] secondary copy failed: ${err.message}`);
    }
  }
  setSetting('auto_backup_last', new Date().toISOString());
  await uploadBackupToBlobs(filePath, fileName, size);
  console.log(`[backups] ${reason} backup created: ${fileName} (${size} bytes)`);
  return { name: fileName, size };
}

export function listBackups() {
  if (isServerless) return [];
  return fs.readdirSync(backupsDir())
    .filter((n) => n.startsWith('lux-backup-') && n.endsWith('.db'))
    .map((n) => {
      const st = fs.statSync(path.join(backupsDir(), n));
      return { name: n, size: st.size, modified: st.mtime.toISOString() };
    })
    .sort((a, b) => b.modified.localeCompare(a.modified));
}

export function pruneBackups(retentionDays) {
  return pruneBackupsIn(backupsDir(), retentionDays);
}

export function pruneBackupsIn(dir, retentionDays) {
  const cutoff = Date.now() - retentionDays * 86400000;
  let removed = 0;
  for (const n of fs.readdirSync(dir)) {
    if (!n.startsWith('lux-backup-') || !n.endsWith('.db')) continue;
    const p = path.join(dir, n);
    if (fs.statSync(p).mtimeMs < cutoff) {
      try { fs.unlinkSync(p); removed++; } catch {}
    }
  }
  return removed;
}

export function isAutoBackupDue() {
  if (isServerless) return false;
  if (getSetting('auto_backup_enabled', 'false') !== 'true') return false;
  const intervalH = Math.max(1, parseInt(getSetting('auto_backup_interval_hours', '24'), 10) || 24);
  const last = getSetting('auto_backup_last', '');
  if (!last) return true;
  const lastMs = Date.parse(last);
  if (Number.isNaN(lastMs)) return true;
  return Date.now() - lastMs >= intervalH * 3600000;
}

export async function maybeAutoBackup() {
  if (!isAutoBackupDue()) return null;
  const retention = Math.max(1, parseInt(getSetting('auto_backup_retention_days', '30'), 10) || 30);
  const result = await backupNow({ reason: 'scheduled' });
  const removed = pruneBackups(retention);
  console.log(`[backups] retention: removed ${removed} old backup(s) (>${retention} days)`);
  return result;
}

// Startup/health self-check: run integrity check against the live DB. If it
// fails, restore the most recent backup that itself passes integrity_check and
// reopen the database. Local desktop only — no-op on serverless.
export function verifyDatabaseHealth() {
  if (isServerless) return { ok: true, note: 'serverless: integrity handled at restore time' };
  let result;
  try {
    result = db.pragma('integrity_check', { simple: true });
  } catch (err) {
    return { ok: false, error: `integrity_check threw: ${err.message}` };
  }
  if (result === 'ok') return { ok: true };

  console.error(`[backups] integrity_check FAILED -> ${result}`);
  const candidates = listBackups().sort((a, b) => b.modified.localeCompare(a.modified));
  for (const backup of candidates) {
    const filePath = path.join(backupsDir(), backup.name);
    let check = null;
    try {
      check = new Database(filePath, { readonly: true });
      if (check.pragma('integrity_check', { simple: true }) !== 'ok') continue;
      check.close();
      check = null;
      try { fs.copyFileSync(filePath, dbPath); }
      catch (err) { console.error(`[backups] auto-restore copy failed: ${err.message}`); return { ok: false, error: err.message }; }
      reopenDatabase();
      console.log(`[backups] auto-restored ${dbPath} from backup ${backup.name}`);
      return { ok: true, restoredFrom: backup.name };
    } catch {
      try { check && check.close(); } catch {}
    }
  }
  return { ok: false, error: 'integrity failed and no valid backup found' };
}
