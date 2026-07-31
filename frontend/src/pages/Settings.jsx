import React, { useEffect, useState } from 'react';
import api from '../api.js';

function Card({ title, description, children }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
      <h2 className="text-lg font-semibold mb-1">{title}</h2>
      {description && <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{description}</p>}
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <span className="block text-sm font-medium mb-1">{label}</span>
      {children}
    </label>
  );
}

const inputClass = 'w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500';

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
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
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
          className="mt-2 px-4 py-2 rounded bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-colors">
          Save profile
        </button>
      </Card>

      <Card title="Reminders & notifications" description="How many days before an end/expiry date should a reminder notification be created.">
        <Field label="Reminder window (days)">
          <input type="number" min="0" max="365" className={inputClass + ' max-w-40'} value={form.reminder_days} onChange={set('reminder_days')} />
        </Field>
        <button onClick={() => save(['reminder_days'], 'Reminder settings saved')}
          className="px-4 py-2 rounded bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-colors">
          Save reminders
        </button>
        <p className="text-xs text-gray-400 mt-3">Tip: press Refresh in the notification bell after changing this to generate reminders with the new window.</p>
      </Card>

      <Card title="Appearance">
        <div className="flex gap-2">
          <button onClick={() => toggleTheme('light')}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${theme === 'light' ? 'bg-amber-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200'}`}>
            ☀️ Light
          </button>
          <button onClick={() => toggleTheme('dark')}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${theme === 'dark' ? 'bg-amber-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200'}`}>
            🌙 Dark
          </button>
        </div>
      </Card>

      <Card title="Data" description="Download a complete backup of the database file.">
        <button onClick={() => downloadBackup().catch((err) => alert(err.message))}
          className="px-4 py-2 rounded bg-gray-800 dark:bg-gray-700 hover:bg-gray-700 dark:hover:bg-gray-600 text-white text-sm font-medium transition-colors">
          💾 Download database backup
        </button>
      </Card>
    </div>
  );
}
