import React, { useEffect, useState } from 'react';
import api from '../api.js';

function Card({ title, description, children }) {
  return (
    <div className="card p-6 mb-6">
      <h2 className="text-lg font-semibold mb-1">{title}</h2>
      {description && <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{description}</p>}
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

const inputClass = 'input w-full';

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [form, setForm] = useState({
    company_name: '', company_abn: '', company_phone: '', company_email: '', company_address: '',
    reminder_days: '14'
  });
  const [theme, setTheme] = useState('light');
  const [saved, setSaved] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.settings.get()
      .then((s) => {
        setSettings(s);
        setForm({
          company_name: s.company_name || '',
          company_abn: s.company_abn || '',
          company_phone: s.company_phone || '',
          company_email: s.company_email || '',
          company_address: s.company_address || '',
          reminder_days: s.reminder_days || '14'
        });
        const t = s.theme === 'dark' ? 'dark' : 'light';
        setTheme(t);
        document.documentElement.classList.toggle('dark', t === 'dark');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async (keys, message) => {
    const payload = {};
    for (const k of keys) payload[k] = form[k];
    await api.settings.update(payload);
    setSettings((s) => ({ ...s, ...payload }));
    setSaved(message);
    setTimeout(() => setSaved(''), 2500);
  };

  const toggleTheme = async (t) => {
    const next = t;
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    await api.settings.update({ theme: next }).catch(() => {});
    setSettings((s) => ({ ...s, theme: next }));
  };

  const downloadBackup = async () => {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/export/db-backup', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('Backup failed');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lux-backup-${new Date().toISOString().slice(0, 10)}.db`;
    a.click();
    URL.revokeObjectURL(blob);
  };

  if (loading) return <p className="text-gray-500">Loading settings…</p>;

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="page-header">Settings</h1>
        <p className="page-sub">Company profile, reminders and appearance</p>
      </div>
      {saved && <p className="mb-4 text-sm text-green-600 dark:text-green-400">{saved}</p>}

      <Card title="Company profile" description="Shown on exported documents and reports.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Company name">
            <input className={inputClass} value={form.company_name} onChange={set('company_name')} placeholder="e.g. LUX Traffic Management" />
          </Field>
          <Field label="ABN / ACN">
            <input className={inputClass} value={form.company_abn} onChange={set('company_abn')} placeholder="e.g. 12 345 678 901" />
          </Field>
          <Field label="Phone">
            <input className={inputClass} value={form.company_phone} onChange={set('company_phone')} placeholder="e.g. 08 9000 0000" />
          </Field>
          <Field label="Email">
            <input className={inputClass} value={form.company_email} onChange={set('company_email')} placeholder="e.g. admin@lux.com.au" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Address">
              <input className={inputClass} value={form.company_address} onChange={set('company_address')} placeholder="e.g. 1 Example St, Perth WA 6000" />
            </Field>
          </div>
        </div>
        <button onClick={() => save(['company_name', 'company_abn', 'company_phone', 'company_email', 'company_address'], 'Company profile saved')}
          className="btn btn-primary mt-2">
          Save profile
        </button>
      </Card>

      <Card title="Reminders & notifications" description="How many days before an end/expiry date should a reminder notification be created.">
        <Field label="Reminder window (days)">
          <input type="number" min="0" max="365" className={inputClass + ' max-w-40'} value={form.reminder_days} onChange={set('reminder_days')} />
        </Field>
        <button onClick={() => save(['reminder_days'], 'Reminder settings saved')}
          className="btn btn-primary">
          Save reminders
        </button>
        <p className="text-xs text-gray-400 mt-3">Tip: press Refresh in the notification bell after changing this to generate reminders with the new window.</p>
      </Card>

      <Card title="Appearance">
        <div className="flex gap-2">
          <button onClick={() => toggleTheme('light')}
            className={`tab ${theme === 'light' ? 'tab-active' : 'tab-inactive'}`}>
            ☀️ Light
          </button>
          <button onClick={() => toggleTheme('dark')}
            className={`tab ${theme === 'dark' ? 'tab-active' : 'tab-inactive'}`}>
            🌙 Dark
          </button>
        </div>
      </Card>

      <Card title="Data" description="Download a complete backup of the database file.">
        <button onClick={() => downloadBackup().catch((err) => alert(err.message))}
          className="btn btn-ghost">
          💾 Download database backup
        </button>
      </Card>
    </div>
  );
}
