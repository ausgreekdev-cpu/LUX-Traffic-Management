import fs from 'fs';
import path from 'path';
import db, { dbPath, isServerless } from './db.js';

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

export async function backupNow({ reason = 'manual' } = {}) {
  if (isServerless) throw new Error('Backups are not available on serverless deployments.');
  const now = new Date().toISOString();
  const stamp = `${now.slice(0, 10)}_${now.slice(11, 19).replace(/:/g, '-')}`;
  const filePath = path.join(backupsDir(), `lux-backup-${stamp}.db`);
  await db.backup(filePath);
  const size = fs.statSync(filePath).size;
  setSetting('auto_backup_last', new Date().toISOString());
  console.log(`[backups] ${reason} backup created: ${path.basename(filePath)} (${size} bytes)`);
  return { name: path.basename(filePath), size };
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
  const cutoff = Date.now() - retentionDays * 86400000;
  let removed = 0;
  for (const n of fs.readdirSync(backupsDir())) {
    if (!n.startsWith('lux-backup-') || !n.endsWith('.db')) continue;
    const p = path.join(backupsDir(), n);
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
