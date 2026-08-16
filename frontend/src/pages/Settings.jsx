import { useEffect, useState, useRef } from 'react';
import api from '../api.js';
import { useAppText } from '../context/AppText';

function Card({ title, description, children }) {
  return (
    <div className="card p-6 mb-6">
      <h2 className="text-lg font-semibold mb-1">{title}</h2>
      {description && <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{description}</p>}
      {children}
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block mb-3">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="text-xs text-gray-400 mt-1 block">{hint}</span>}
    </label>
  );
}

function LabelEditor({ items, values, onChange, placeholder }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
      {items.map(({ key, label }) => (
        <div key={key}>
          <label className="text-xs text-gray-400">{label}</label>
          <input className="input w-full" value={values[key] || ''} placeholder={placeholder || label}
            onChange={e => onChange({ ...values, [key]: e.target.value })} />
        </div>
      ))}
    </div>
  );
}

const inputClass = 'input w-full';
const parseJson = (s, fb) => { try { return JSON.parse(s); } catch { return fb || {}; } };

const NAV_ITEMS = [
  { key: '/', label: 'Dashboard' }, { key: '/tmps', label: 'TMPs' }, { key: '/projects', label: 'Projects' },
  { key: '/permits', label: 'Permits' }, { key: '/authorities', label: 'Authorities' },
  { key: '/time-tracking', label: 'Time Tracking' }, { key: '/correspondence', label: 'Correspondence' },
  { key: '/analytics', label: 'Analytics' }, { key: '/clients', label: 'Clients' }, { key: '/sites', label: 'Sites' },
  { key: '/settings', label: 'Settings' }, { key: '/help', label: 'Help & FAQ' },
  { key: '/workflows', label: 'Workflows' }, { key: '/automations', label: 'Automation & Triggers' }, { key: '/users', label: 'Users' }
];

const PAGE_TITLES = [
  { key: 'dashboard', label: 'Dashboard' }, { key: 'tmps', label: 'Traffic Management Plans' },
  { key: 'projects', label: 'Projects' }, { key: 'permits', label: 'Permits' },
  { key: 'authorities', label: 'WA Authorities' }, { key: 'time-tracking', label: 'Time Tracking' },
  { key: 'correspondence', label: 'Correspondence' }, { key: 'analytics', label: 'Analytics' },
  { key: 'clients', label: 'Clients' }, { key: 'sites', label: 'Sites' }, { key: 'settings', label: 'Settings' },
  { key: 'help', label: 'Help & FAQ' }, { key: 'workflows', label: 'Workflows' },
  { key: 'automations', label: 'Automation & Triggers' }, { key: 'users', label: 'Users' }
];

const SECTIONS = [
  { key: 'tmp_details', label: 'Details' }, { key: 'tmp_permits', label: 'Permits' },
  { key: 'tmp_documents', label: 'Documents' }, { key: 'tmp_activity', label: 'Activity' },
  { key: 'tmp_agents', label: 'AI agent checks' }, { key: 'permit_details', label: 'Permit Details' },
  { key: 'permit_sla', label: 'SLA Information' }, { key: 'permit_fees', label: 'Fees' },
  { key: 'permit_triggers', label: 'Workflow Triggers' }, { key: 'permit_compliance', label: 'Compliance check' },
  { key: 'permit_contact', label: 'Contact' }
];

const COLUMN_GROUPS = {
  tmps: { reference: 'Reference', title: 'Title', site: 'Site', status: 'Status', type: 'Type', ends: 'Ends', created: 'Created' },
  permits: { tmp: 'TMP', authority: 'Authority', status: 'Status', complexity: 'Complexity', submitted: 'Submitted', expiry: 'Expiry', signal: '30m Signal', mrwa: 'MRWA' },
  clients: { name: 'Name', company: 'Company', email: 'Email', phone: 'Phone' },
  sites: { name: 'Name', road: 'Road', class: 'Class', speed: 'Speed', aadt: 'AADT', suburb: 'Suburb' },
  users: { name: 'Name', email: 'Email', role: 'Role', created: 'Created' },
  time: { date: 'Date', tmp: 'TMP', cost_code: 'Cost Code', description: 'Description', hours: 'Hours', rate: 'Rate', cost: 'Cost', billable: 'Billable' },
  correspondence: { received: 'Received', from: 'From', subject: 'Subject', tmp: 'TMP', extracted: 'Extracted', review: 'Review' }
};

const STATUS_ITEMS = [
  { key: 'draft', label: 'Draft' }, { key: 'submitted', label: 'Submitted' }, { key: 'under_review', label: 'Under review' },
  { key: 'approved', label: 'Approved' }, { key: 'rejected', label: 'Rejected' }, { key: 'expired', label: 'Expired' },
  { key: 'cancelled', label: 'Cancelled' }, { key: 'completed', label: 'Completed' }
];

const COMPLEXITY_ITEMS = [
  { key: 'simple', label: 'Simple' }, { key: 'standard', label: 'Standard' },
  { key: 'complex', label: 'Complex' }, { key: 'complex_with_notice', label: 'Complex + notice' }
];

export default function Settings() {
  const { pageTitle } = useAppText();
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({
    company_name: '', company_abn: '', company_phone: '', company_email: '', company_address: '',
    reminder_days: '14', webhook_secret: '', reminder_email_enabled: false, reminder_email_to: '',
    auto_backup_enabled: false, auto_backup_interval_hours: '24', auto_backup_retention_days: '30'
  });
  const [branding, setBranding] = useState({ app_name: '', login_subtitle: '', footer_text: '', pdf_footer_text: '' });
  const [navLabels, setNavLabels] = useState({});
  const [pageTitles, setPageTitles] = useState({});
  const [sections, setSections] = useState({});
  const [columns, setColumns] = useState({});
  const [statusLabels, setStatusLabels] = useState({});
  const [complexityLabels, setComplexityLabels] = useState({});
  const [legal, setLegal] = useState({ privacy_policy: '', terms_of_service: '' });
  const [behaviour, setBehaviour] = useState({
    default_currency: 'AUD', timezone: 'Australia/Perth', date_format: 'yyyymmdd', default_rate: '150',
    session_timeout_minutes: '1440', default_sla_days: '14', risk_high_threshold: '10',
    risk_extreme_threshold: '16', notif_retention_days: '180', email_retention_days: '365', maintenance_mode: false
  });
  const [smtp, setSmtp] = useState({ provider: 'smtp', mail_provider: '', host: '', port: '587', secure: false, user: '', pass: '', has_pass: false, from_name: '', from_email: '', postmark_token: '', has_postmark_token: false, postmark_from_name: '', postmark_from_email: '' });
  const [emailLogs, setEmailLogs] = useState([]);
  const [emailBusy, setEmailBusy] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [webhookHas, setWebhookHas] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [theme, setTheme] = useState('light');
  const [saved, setSaved] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.settings.get()
      .then((s) => {
        setForm({
          company_name: s.company_name || '',
          company_abn: s.company_abn || '',
          company_phone: s.company_phone || '',
          company_email: s.company_email || '',
          company_address: s.company_address || '',
          reminder_days: s.reminder_days || '14',
          webhook_secret: '',
          reminder_email_enabled: s.reminder_email_enabled === 'true',
          reminder_email_to: s.reminder_email_to || '',
          auto_backup_enabled: s.auto_backup_enabled === 'true',
          auto_backup_interval_hours: s.auto_backup_interval_hours || '24',
          auto_backup_retention_days: s.auto_backup_retention_days || '30'
        });
        setWebhookHas(!!s.webhook_secret);
        loadBackups();
        setBranding({
          app_name: s.app_name || '',
          login_subtitle: s.login_subtitle || '',
          footer_text: s.footer_text || '',
          pdf_footer_text: s.pdf_footer_text || ''
        });
        setNavLabels(parseJson(s.nav_labels_json));
        setPageTitles(parseJson(s.page_titles_json));
        setSections(parseJson(s.sections_json));
        setColumns(parseJson(s.columns_json));
        setStatusLabels(parseJson(s.status_labels_json));
        setComplexityLabels(parseJson(s.complexity_labels_json));
        setLegal({ privacy_policy: s.privacy_policy || '', terms_of_service: s.terms_of_service || '' });
        setBehaviour({
          default_currency: s.default_currency || 'AUD',
          timezone: s.timezone || 'Australia/Perth',
          date_format: s.date_format || 'yyyymmdd',
          default_rate: s.default_rate || '150',
          session_timeout_minutes: s.session_timeout_minutes || '1440',
          default_sla_days: s.default_sla_days || '14',
          risk_high_threshold: s.risk_high_threshold || '10',
          risk_extreme_threshold: s.risk_extreme_threshold || '16',
          notif_retention_days: s.notif_retention_days || '180',
          email_retention_days: s.email_retention_days || '365',
          maintenance_mode: s.maintenance_mode === 'true'
        });
        const t = s.theme === 'dark' ? 'dark' : 'light';
        setTheme(t);
        document.documentElement.classList.toggle('dark', t === 'dark');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    api.auth.me().then(setUser).catch(() => {});
    api.email.getConfig().then(setSmtp).catch(() => {});
    api.email.logs().then(setEmailLogs).catch(() => {});
  }, []);

  const notify = (msg) => { setSaved(msg); setTimeout(() => setSaved(''), 2500); };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async (keys, message) => {
    const payload = {};
    for (const k of keys) payload[k] = form[k];
    await api.settings.update(payload);
    notify(message);
  };

  const saveJson = async (key, obj, message) => {
    await api.settings.update({ [key]: JSON.stringify(obj) });
    notify(message);
  };

  const saveScalar = async (key, value, message) => {
    await api.settings.update({ [key]: String(value) });
    notify(message);
  };

  const toggleTheme = async (t) => {
    setTheme(t);
    document.documentElement.classList.toggle('dark', t === 'dark');
    await api.settings.update({ theme: t }).catch(() => {});
  };

  const saveSmtp = async () => {
    setEmailBusy(true);
    try {
      await api.email.config({
        provider: smtp.mail_provider || '',
        host: smtp.host, port: smtp.port, secure: smtp.secure,
        user: smtp.user, pass: smtp.pass, from_name: smtp.from_name, from_email: smtp.from_email,
        postmark_token: smtp.postmark_token, postmark_from_name: smtp.postmark_from_name, postmark_from_email: smtp.postmark_from_email
      });
      api.email.getConfig().then(setSmtp).catch(() => {});
      notify('Email settings saved');
    } catch (err) { alert(err.message); }
    finally { setEmailBusy(false); }
  };

  const sendTestEmail = async () => {
    setEmailBusy(true);
    try {
      const res = await api.email.test(testTo || undefined);
      notify(`Test email sent: ${res.messageId}`);
      api.email.logs().then(setEmailLogs).catch(() => {});
    } catch (err) {
      alert(`Test failed: ${err.message}`);
    } finally { setEmailBusy(false); }
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

  const restoreRef = useRef(null);
  const [restoring, setRestoring] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [backups, setBackups] = useState([]);
  const loadBackups = () => {
    const token = localStorage.getItem('token');
    return fetch('/api/export/backups', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((body) => setBackups(body.backups || []))
      .catch(() => {});
  };
  const runBackupNow = async () => {
    setBackingUp(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/export/backups/run', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Backup failed');
      notify('Backup created');
      loadBackups();
    } catch (err) { alert(err.message); }
    finally { setBackingUp(false); }
  };
  const downloadBackupFile = async (name) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/export/backups/${encodeURIComponent(name)}`, { headers: { Authorization: `Bearer ${token}` } });
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
      const token = localStorage.getItem('token');
      const res = await fetch('/api/export/backups/restore', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Restore failed');
      notify(`${body.message} ${body.users ?? ''} users, ${body.tmps ?? ''} TMPs`);
    } catch (err) { alert(`Restore failed: ${err.message}`); }
    finally { setRestoring(false); }
  };
  const deleteBackupFile = async (name) => {
    if (!window.confirm(`Delete backup "${name}"?`)) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/export/backups/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
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
      const token = localStorage.getItem('token');
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/export/db-restore', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
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

  if (loading) return <p className="text-gray-500">Loading settings…</p>;

  const isAdmin = user?.role === 'developer';

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="page-header">{pageTitle('settings', 'Settings')}</h1>
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

      <Card title="Email (Postmark or SMTP)" description="Outgoing mail used for notifications, rule emails and tests. Settings persist in the database and override the POSTMARK_* / SMTP_* environment variables at runtime. Postmark is used automatically when an API token is saved.">
        <div className="mb-4">
          <span className="label">Active provider</span>
          <p className="text-sm font-semibold">{smtp.provider === 'postmark' ? 'Postmark (API)' : 'SMTP'}</p>
          <div className="flex items-center gap-4 mt-2 text-sm">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="mail_provider" checked={smtp.mail_provider === 'smtp'} onChange={() => setSmtp(s => ({ ...s, mail_provider: 'smtp' }))} />
              Use SMTP
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="mail_provider" checked={smtp.mail_provider === 'postmark'} onChange={() => setSmtp(s => ({ ...s, mail_provider: 'postmark' }))} />
              Use Postmark
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="mail_provider" checked={smtp.mail_provider !== 'smtp' && smtp.mail_provider !== 'postmark'} onChange={() => setSmtp(s => ({ ...s, mail_provider: '' }))} />
              Auto (Postmark when a token is saved)
            </label>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Pick a provider explicitly, or leave Auto. Without a stored Postmark token, Auto falls back to SMTP.</p>
        </div>

        <div className="border rounded p-3 mb-4 bg-gray-50 dark:bg-gray-800">
          <p className="label">Postmark</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="API token" hint={smtp.has_postmark_token ? 'Stored — leave blank to keep the existing token.' : undefined}>
              <input type={showSecret ? 'text' : 'password'} className={inputClass + ' font-mono'} value={smtp.postmark_token}
                onChange={e => setSmtp(s => ({ ...s, postmark_token: e.target.value }))} placeholder={smtp.has_postmark_token ? '••••••••' : 'Server API token (starts with a UUID)'} />
            </Field>
            <div className="flex items-end pb-3">
              <button type="button" onClick={() => setShowSecret(!showSecret)} className="btn btn-ghost">{showSecret ? 'Hide' : 'Show'}</button>
            </div>
            <Field label="From name">
              <input className={inputClass} value={smtp.postmark_from_name} onChange={e => setSmtp(s => ({ ...s, postmark_from_name: e.target.value }))} placeholder="e.g. LUX Traffic Management" />
            </Field>
            <Field label="From email" hint="Must be a sender signature verified in Postmark.">
              <input className={inputClass} value={smtp.postmark_from_email} onChange={e => setSmtp(s => ({ ...s, postmark_from_email: e.target.value }))} placeholder="e.g. admin@lux.com.au" />
            </Field>
          </div>
        </div>

        <div className="border rounded p-3 bg-gray-50 dark:bg-gray-800">
          <p className="label">SMTP (fallback)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="SMTP host">
              <input className={inputClass} value={smtp.host} onChange={e => setSmtp(s => ({ ...s, host: e.target.value }))} placeholder="e.g. smtp.gmail.com" />
            </Field>
            <Field label="Port">
              <input type="number" className={inputClass} value={smtp.port} onChange={e => setSmtp(s => ({ ...s, port: e.target.value }))} placeholder="587" />
            </Field>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={smtp.secure} onChange={e => setSmtp(s => ({ ...s, secure: e.target.checked }))} />
              Use TLS/SSL (check for port 465, uncheck for 587 STARTTLS)
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Username">
              <input className={inputClass} value={smtp.user} onChange={e => setSmtp(s => ({ ...s, user: e.target.value }))} placeholder="e.g. admin@lux.com.au" />
            </Field>
            <Field label="Password" hint={smtp.has_pass ? 'Stored — leave blank to keep the existing password.' : undefined}>
              <input type="password" className={inputClass + ' font-mono'} value={smtp.pass}
                onChange={e => setSmtp(s => ({ ...s, pass: e.target.value }))} placeholder={smtp.has_pass ? '••••••••' : 'App password or mailbox password'} />
            </Field>
            <Field label="From name">
              <input className={inputClass} value={smtp.from_name} onChange={e => setSmtp(s => ({ ...s, from_name: e.target.value }))} placeholder="e.g. LUX Traffic Management" />
            </Field>
            <Field label="From email">
              <input className={inputClass} value={smtp.from_email} onChange={e => setSmtp(s => ({ ...s, from_email: e.target.value }))} placeholder="e.g. admin@lux.com.au" />
            </Field>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <button onClick={saveSmtp} disabled={emailBusy} className="btn btn-primary">Save email settings</button>
          <button onClick={sendTestEmail} disabled={emailBusy} className="btn btn-ghost">
            {emailBusy ? 'Working…' : 'Send test email'}
          </button>
          <input value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="Test recipient (optional)" className="input flex-1" />
        </div>
        <div className="mt-4 border-t pt-3">
          <p className="label">Reminder digest</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Send one summary email on each hourly scan when TMPs or permits are expiring/expired. Leave recipients blank to use all admin user emails.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.reminder_email_enabled} onChange={e => setForm(f => ({ ...f, reminder_email_enabled: e.target.checked }))} />
              Send reminder digest emails
            </label>
            <input value={form.reminder_email_to} onChange={e => setForm(f => ({ ...f, reminder_email_to: e.target.value }))} placeholder="Recipients (comma-separated, optional)" className="input" />
          </div>
          <button onClick={() => save(['reminder_email_enabled', 'reminder_email_to'], 'Reminder digest settings saved')} className="btn btn-primary mt-2">Save digest settings</button>
        </div>
        {emailLogs.length > 0 && (
          <div className="mt-4">
            <p className="label">Recent email log</p>
            <div className="text-xs space-y-1 max-h-40 overflow-y-auto bg-gray-50 dark:bg-gray-800 rounded p-2">
              {emailLogs.slice(0, 8).map(l => (
                <p key={l.id} className="truncate">
                  <span className="text-gray-400">{l.created_at}</span> → {l.to_address} · {l.subject} · <span className={l.status === 'sent' ? 'text-green-600' : 'text-red-500'}>{l.status}</span>
                </p>
              ))}
            </div>
          </div>
        )}
        <p className="text-xs text-gray-400 mt-3">Need help? See <b>docs/email-setup.md</b> for a full provider-by-provider guide.</p>
      </Card>

      <Card title="Inbound webhooks" description="Point your email/webhook provider here to ingest correspondence and match it to TMPs. Payloads appear on the Correspondence page for review.">
        <div className="space-y-3">
          <Field label="Webhook secret">
            <div className="flex gap-2">
              <input type={showSecret ? 'text' : 'password'} className={inputClass + ' font-mono'} value={form.webhook_secret} onChange={set('webhook_secret')} placeholder={webhookHas ? 'Stored — leave blank to keep it' : 'Leave blank for unauthenticated delivery'} />
              <button type="button" onClick={() => setShowSecret(!showSecret)} className="btn btn-ghost shrink-0">{showSecret ? 'Hide' : 'Show'}</button>
            </div>
          </Field>
          <Field label="Endpoint URLs">
            <div className="space-y-1">
              {['mailgun', 'sendgrid', 'postmark', 'generic'].map(p => (
                <p key={p} className="text-xs font-mono text-gray-500 bg-gray-50 dark:bg-gray-800 rounded px-2 py-1 truncate">
                  POST {window.location.origin}/api/integrations/webhook/{p}
                </p>
              ))}
            </div>
          </Field>
          <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
            <p>Signature: HMAC-SHA256 hex digest of the raw request body, sent as <code className="font-mono">x-lux-signature</code> or <code className="font-mono">x-webhook-signature</code>.</p>
            <p>Body may include <code className="font-mono">sender/from</code>, <code className="font-mono">subject</code> and <code className="font-mono">text/body</code> fields; emails are parsed for a TMP reference and outcome keywords (approved, rejected, request info…).</p>
          </div>
          <button onClick={async () => {
            try {
              if (form.webhook_secret) await api.settings.update({ webhook_secret: form.webhook_secret });
              setWebhookHas(!!form.webhook_secret || webhookHas);
              setForm(f => ({ ...f, webhook_secret: '' }));
              notify('Webhook settings saved');
            } catch (err) { alert(err.message); }
          }} className="btn btn-primary">
            Save webhook settings
          </button>
        </div>
      </Card>

      <Card title="Data" description="Download a complete backup of the database file, or restore from one.">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => downloadBackup().catch((err) => alert(err.message))}
            className="btn btn-ghost">
            💾 Download database backup
          </button>
          {isAdmin && (
            <>
              <input ref={restoreRef} type="file" accept=".db,application/x-sqlite3" className="hidden"
                onChange={(e) => restoreDb(e.target.files[0])} />
              <button onClick={() => restoreRef.current?.click()} disabled={restoring}
                className="btn btn-ghost">
                {restoring ? 'Restoring…' : '↩ Restore database from backup'}
              </button>
              <button onClick={runBackupNow} disabled={backingUp}
                className="btn btn-ghost">
                {backingUp ? 'Backing up…' : '📀 Back up now'}
              </button>
            </>
          )}
        </div>
        {isAdmin && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Restore replaces all current data with the uploaded backup. Only SQLite database files are accepted.</p>}

        {isAdmin && (
          <div className="mt-5 border-t pt-4">
            <p className="label">Scheduled backups</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Create a timestamped backup file on the hourly scan and keep the newest few. Stored next to the database in the <code className="font-mono">backups</code> folder.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.auto_backup_enabled} onChange={e => setForm(f => ({ ...f, auto_backup_enabled: e.target.checked }))} />
                Enable scheduled backups
              </label>
              <Field label="Interval (hours)">
                <input type="number" min="1" className={inputClass} value={form.auto_backup_interval_hours} onChange={set('auto_backup_interval_hours')} />
              </Field>
              <Field label="Keep for (days)">
                <input type="number" min="1" className={inputClass} value={form.auto_backup_retention_days} onChange={set('auto_backup_retention_days')} />
              </Field>
            </div>
            <button onClick={() => save(['auto_backup_enabled', 'auto_backup_interval_hours', 'auto_backup_retention_days'], 'Backup schedule saved')}
              className="btn btn-primary mt-2">Save backup schedule</button>

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
                      <span className="text-gray-400 shrink-0">{b.modified.slice(0, 19).replace('T', ' ')}</span>
                      <button onClick={() => downloadBackupFile(b.name)} className="text-lux-600 dark:text-lux-400 hover:underline shrink-0">Download</button>
                      <button onClick={() => restoreBackupFile(b.name)} disabled={restoring} className="text-lux-600 dark:text-lux-400 hover:underline shrink-0">Restore</button>
                      <button onClick={() => deleteBackupFile(b.name)} className="text-red-500 hover:underline shrink-0">Delete</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      {isAdmin && (
        <>
          <div className="mb-6 mt-10">
            <h2 className="text-lg font-semibold">Developer & branding</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Administrator-only customisation — rename menus, pages, columns and statuses, edit legal content and tune system behaviour. Overrides stored in the database; leave a field blank to keep the default.</p>
          </div>

          <Card title="App branding" description="Applied to the login screen, sidebar and exported documents.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="App name">
                <input className={inputClass} value={branding.app_name} onChange={e => setBranding(b => ({ ...b, app_name: e.target.value }))} placeholder="LUX Traffic Management" />
              </Field>
              <Field label="Login subtitle">
                <input className={inputClass} value={branding.login_subtitle} onChange={e => setBranding(b => ({ ...b, login_subtitle: e.target.value }))} placeholder="Traffic management made simple" />
              </Field>
              <Field label="Footer text" hint="Shown at the bottom of the sidebar.">
                <input className={inputClass} value={branding.footer_text} onChange={e => setBranding(b => ({ ...b, footer_text: e.target.value }))} placeholder="© LUX Traffic Management" />
              </Field>
              <Field label="PDF footer text" hint="Printed at the bottom of exported PDFs.">
                <input className={inputClass} value={branding.pdf_footer_text} onChange={e => setBranding(b => ({ ...b, pdf_footer_text: e.target.value }))} placeholder="Confidential — for internal use only" />
              </Field>
            </div>
            <button onClick={() => saveScalar('app_name', branding.app_name, 'App branding saved')
              .then(() => saveScalar('login_subtitle', branding.login_subtitle))
              .then(() => saveScalar('footer_text', branding.footer_text))
              .then(() => saveScalar('pdf_footer_text', branding.pdf_footer_text))} className="btn btn-primary mt-2">
              Save branding
            </button>
          </Card>

          <Card title="Menu names" description="Rename items in the sidebar navigation.">
            <LabelEditor items={NAV_ITEMS} values={navLabels} onChange={setNavLabels} />
            <button onClick={() => saveJson('nav_labels_json', navLabels, 'Menu names saved')} className="btn btn-primary">Save menu names</button>
          </Card>

          <Card title="Page titles & sub-category names" description="Rename page headings and section headings on TMP and permit detail pages.">
            <p className="label">Page headings</p>
            <LabelEditor items={PAGE_TITLES} values={pageTitles} onChange={setPageTitles} />
            <p className="label">Detail-page sections</p>
            <LabelEditor items={SECTIONS} values={sections} onChange={setSections} />
            <button onClick={() => saveJson('page_titles_json', pageTitles, 'Page titles saved')
              .then(() => saveJson('sections_json', sections, 'Section names saved'))} className="btn btn-primary">Save titles</button>
          </Card>

          <Card title="Table columns" description="Rename column headers on the list pages.">
            {Object.entries(COLUMN_GROUPS).map(([page, items]) => (
              <div key={page} className="mb-3">
                <p className="label capitalize">{page}</p>
                <LabelEditor items={Object.entries(items).map(([key, label]) => ({ key, label }))}
                  values={columns[page] || {}} onChange={(v) => setColumns(c => ({ ...c, [page]: v }))} />
              </div>
            ))}
            <button onClick={() => saveJson('columns_json', columns, 'Column names saved')} className="btn btn-primary">Save columns</button>
          </Card>

          <Card title="Status & complexity labels" description="Rename how statuses and complexity levels are displayed (badge colours stay the same).">
            <p className="label">Statuses</p>
            <LabelEditor items={STATUS_ITEMS} values={statusLabels} onChange={setStatusLabels} />
            <p className="label">Complexity</p>
            <LabelEditor items={COMPLEXITY_ITEMS} values={complexityLabels} onChange={setComplexityLabels} />
            <button onClick={() => saveJson('status_labels_json', statusLabels, 'Status labels saved')
              .then(() => saveJson('complexity_labels_json', complexityLabels, 'Complexity labels saved'))} className="btn btn-primary">Save labels</button>
          </Card>

          <Card title="Legal content" description="Privacy policy and terms of service — linked from the login screen and shown in Help.">
            <Field label="Privacy policy">
              <textarea rows={5} className={inputClass + ' font-mono text-xs'} value={legal.privacy_policy}
                onChange={e => setLegal(l => ({ ...l, privacy_policy: e.target.value }))} placeholder="Describe how collected data is used, stored and shared…" />
            </Field>
            <Field label="Terms of service">
              <textarea rows={5} className={inputClass + ' font-mono text-xs'} value={legal.terms_of_service}
                onChange={e => setLegal(l => ({ ...l, terms_of_service: e.target.value }))} placeholder="Acceptable use, liability, disclaimers…" />
            </Field>
            <button onClick={() => saveScalar('privacy_policy', legal.privacy_policy, 'Legal content saved')
              .then(() => saveScalar('terms_of_service', legal.terms_of_service))} className="btn btn-primary">Save legal content</button>
          </Card>

          <Card title="System behaviour" description="Defaults and thresholds that control how the system runs.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Default currency">
                <select className={inputClass} value={behaviour.default_currency} onChange={e => setBehaviour(b => ({ ...b, default_currency: e.target.value }))}>
                  <option value="AUD">AUD ($)</option><option value="USD">USD ($)</option>
                  <option value="GBP">GBP (£)</option><option value="EUR">EUR (€)</option><option value="NZD">NZD ($)</option>
                </select>
              </Field>
              <Field label="Timezone">
                <input className={inputClass} value={behaviour.timezone} onChange={e => setBehaviour(b => ({ ...b, timezone: e.target.value }))} placeholder="Australia/Perth" />
              </Field>
              <Field label="Date format">
                <select className={inputClass} value={behaviour.date_format} onChange={e => setBehaviour(b => ({ ...b, date_format: e.target.value }))}>
                  <option value="yyyymmdd">YYYY-MM-DD</option><option value="ddmmyyyy">DD/MM/YYYY</option>
                </select>
              </Field>
              <Field label="Default hourly rate" hint="Prefilled in Time Tracking.">
                <input type="number" className={inputClass} value={behaviour.default_rate} onChange={e => setBehaviour(b => ({ ...b, default_rate: e.target.value }))} />
              </Field>
              <Field label="Session timeout (minutes)" hint="How long a login stays valid before re-authentication.">
                <input type="number" min="5" className={inputClass} value={behaviour.session_timeout_minutes} onChange={e => setBehaviour(b => ({ ...b, session_timeout_minutes: e.target.value }))} />
              </Field>
              <Field label="Default SLA days" hint="Fallback assessment days when an authority has no SLA rule.">
                <input type="number" min="1" className={inputClass} value={behaviour.default_sla_days} onChange={e => setBehaviour(b => ({ ...b, default_sla_days: e.target.value }))} />
              </Field>
              <Field label="Risk high threshold" hint="Score at or above this is High.">
                <input type="number" className={inputClass} value={behaviour.risk_high_threshold} onChange={e => setBehaviour(b => ({ ...b, risk_high_threshold: e.target.value }))} />
              </Field>
              <Field label="Risk extreme threshold" hint="Score at or above this is Extreme.">
                <input type="number" className={inputClass} value={behaviour.risk_extreme_threshold} onChange={e => setBehaviour(b => ({ ...b, risk_extreme_threshold: e.target.value }))} />
              </Field>
              <Field label="Notification retention (days)" hint="Old notifications are purged by the hourly scan.">
                <input type="number" min="7" className={inputClass} value={behaviour.notif_retention_days} onChange={e => setBehaviour(b => ({ ...b, notif_retention_days: e.target.value }))} />
              </Field>
              <Field label="Email log retention (days)">
                <input type="number" min="7" className={inputClass} value={behaviour.email_retention_days} onChange={e => setBehaviour(b => ({ ...b, email_retention_days: e.target.value }))} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer mb-3">
              <input type="checkbox" checked={behaviour.maintenance_mode}
                onChange={e => setBehaviour(b => ({ ...b, maintenance_mode: e.target.checked }))} />
              Maintenance mode — block all data changes app-wide (read-only banner shown; Settings remains open so you can turn it off)
            </label>
            <button onClick={() => {
              const payload = Object.fromEntries(Object.entries(behaviour).map(([k, v]) => [k, v === true ? 'true' : v === false ? 'false' : v]));
              api.settings.update(payload).then(() => notify('System behaviour saved'));
            }} className="btn btn-primary">Save behaviour</button>
          </Card>
        </>
      )}
    </div>
  );
}
