import { useEffect, useRef, useState } from 'react';
import api from '../../../api';
import { Field, NumberField, ToggleField } from '../../../components/settings/fields';
import SectionCard from '../../../components/settings/SectionCard';
import SaveBar from '../../../components/settings/SaveBar';
import { useAuth } from '../../../context/Auth';

const authFetch = (path, options = {}) => {
  const token = localStorage.getItem('token');
  return fetch(path, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` } });
};

export default function DataTab() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'developer';
  const [schedule, setSchedule] = useState({ auto_backup_enabled: false, auto_backup_interval_hours: '24', auto_backup_retention_days: '30' });
  const [backups, setBackups] = useState([]);
  const [restoring, setRestoring] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const [loading, setLoading] = useState(true);
  const restoreRef = useRef(null);

  const notify = (msg) => { setSaved(msg); setTimeout(() => setSaved(''), 2500); };

  const loadBackups = () => authFetch('/api/export/backups')
    .then((res) => res.json())
    .then((body) => setBackups(body.backups || []))
    .catch(() => {});

  useEffect(() => {
    api.settings.get()
      .then((s) => setSchedule({
        auto_backup_enabled: s.auto_backup_enabled === 'true',
        auto_backup_interval_hours: s.auto_backup_interval_hours || '24',
        auto_backup_retention_days: s.auto_backup_retention_days || '30'
      }))
      .catch(() => {});
    loadBackups();
    setLoading(false);
  }, []);

  const downloadBackup = async () => {
    const res = await authFetch('/api/export/db-backup');
    if (!res.ok) throw new Error('Backup failed');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lux-backup-${new Date().toISOString().slice(0, 10)}.db`;
    a.click();
    URL.revokeObjectURL(blob);
  };

  const runBackupNow = async () => {
    setBackingUp(true);
    try {
      const res = await authFetch('/api/export/backups/run', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Backup failed');
      notify('Backup created');
      loadBackups();
    } catch (err) { alert(err.message); } finally { setBackingUp(false); }
  };

  const downloadBackupFile = async (name) => {
    const res = await authFetch(`/api/export/backups/${encodeURIComponent(name)}`);
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(blob);
  };

  const restoreBackupFile = async (name) => {
    if (!window.confirm(`Restore database from backup "${name}"?\n\nThis REPLACES all current data.`)) return;
    setRestoring(true);
    try {
      const res = await authFetch('/api/export/backups/restore', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Restore failed');
      notify(`${body.message} ${body.users ?? ''} users, ${body.tmps ?? ''} TMPs`);
    } catch (err) { alert(`Restore failed: ${err.message}`); } finally { setRestoring(false); }
  };

  const deleteBackupFile = async (name) => {
    if (!window.confirm(`Delete backup "${name}"?`)) return;
    try {
      const res = await authFetch(`/api/export/backups/${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      notify('Backup deleted');
      loadBackups();
    } catch (err) { alert(err.message); }
  };

  const restoreDb = async (file) => {
    if (!file) return;
    if (!window.confirm(`Restore database from "${file.name}"?\n\nThis REPLACES all current data. A safety copy of the current database is kept, but it is strongly recommended to download a backup first.`)) return;
    setRestoring(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await authFetch('/api/export/db-restore', { method: 'POST', body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Restore failed');
      notify(`${body.message} ${body.users ?? ''} users, ${body.tmps ?? ''} TMPs`);
    } catch (err) {
      alert(`Restore failed: ${err.message}`);
    } finally {
      setRestoring(false);
      if (restoreRef.current) restoreRef.current.value = '';
    }
  };

  const saveSchedule = async () => {
    setSaving(true);
    try {
      await api.settings.update({
        auto_backup_enabled: String(schedule.auto_backup_enabled),
        auto_backup_interval_hours: schedule.auto_backup_interval_hours,
        auto_backup_retention_days: schedule.auto_backup_retention_days
      });
      notify('Backup schedule saved');
    } catch (err) { alert(err.message); } finally { setSaving(false); }
  };

  if (loading) return <p className="text-gray-500">Loading…</p>;

  return (
    <div>
      <SectionCard title="Data" description="Download a complete backup of the database file, or restore from one.">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => downloadBackup().catch((err) => alert(err.message))} className="btn btn-ghost">💾 Download database backup</button>
          {isAdmin && (
            <>
              <input ref={restoreRef} type="file" accept=".db,application/x-sqlite3" className="hidden"
                onChange={(e) => restoreDb(e.target.files[0])} />
              <button onClick={() => restoreRef.current?.click()} disabled={restoring} className="btn btn-ghost">{restoring ? 'Restoring…' : '↩ Restore database from backup'}</button>
              <button onClick={runBackupNow} disabled={backingUp} className="btn btn-ghost">{backingUp ? 'Backing up…' : '📀 Back up now'}</button>
            </>
          )}
        </div>
        {isAdmin && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Restore replaces all current data with the uploaded backup. Only SQLite database files are accepted.</p>}
      </SectionCard>

      {isAdmin && (
        <SectionCard title="Scheduled backups" description="Create a timestamped backup file on the hourly scan and keep the newest few. Stored next to the database in the backups folder.">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ToggleField label="Enable scheduled backups" checked={schedule.auto_backup_enabled} onChange={(v) => setSchedule(s => ({ ...s, auto_backup_enabled: v }))} />
            <Field label="Interval (hours)"><NumberField value={Number(schedule.auto_backup_interval_hours) || 1} min={1} onChange={(v) => setSchedule(s => ({ ...s, auto_backup_interval_hours: String(v) }))} /></Field>
            <Field label="Keep for (days)"><NumberField value={Number(schedule.auto_backup_retention_days) || 1} min={1} onChange={(v) => setSchedule(s => ({ ...s, auto_backup_retention_days: String(v) }))} /></Field>
          </div>
          <SaveBar onSave={saveSchedule} saving={saving} saved={saved} saveLabel="Save backup schedule" />

          <div className="mt-4">
            <p className="label">Existing backups</p>
            {backups.length === 0 ? (
              <p className="text-xs text-gray-400">No backups on disk yet.</p>
            ) : (
              <div className="space-y-1">
                {backups.map(b => (
                  <div key={b.name} className="flex items-center gap-2 text-xs bg-gray-50 dark:bg-gray-800 rounded px-2 py-1">
                    <span className="font-mono truncate flex-1">{b.name}</span>
                    <span className="text-gray-400 shrink-0">{(b.size / 1024 / 1024).toFixed(1)} MB</span>
                    <span className="text-gray-400 shrink-0">{String(b.modified).slice(0, 19).replace('T', ' ')}</span>
                    <button onClick={() => downloadBackupFile(b.name)} className="text-lux-600 dark:text-lux-400 hover:underline shrink-0">Download</button>
                    <button onClick={() => restoreBackupFile(b.name)} disabled={restoring} className="text-lux-600 dark:text-lux-400 hover:underline shrink-0">Restore</button>
                    <button onClick={() => deleteBackupFile(b.name)} className="text-red-500 hover:underline shrink-0">Delete</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SectionCard>
      )}
    </div>
  );
}