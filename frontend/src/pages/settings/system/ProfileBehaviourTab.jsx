import { useEffect, useState } from 'react';
import api from '../../../api';
import { Field, NumberField, SelectField, TextField, ToggleField } from '../../../components/settings/fields';
import SectionCard from '../../../components/settings/SectionCard';
import SaveBar from '../../../components/settings/SaveBar';

export default function ProfileBehaviourTab() {
  const [form, setForm] = useState({
    company_name: '', company_abn: '', company_phone: '', company_email: '', company_address: '',
    reminder_days: '14', reminder_email_enabled: false, reminder_email_to: ''
  });
  const [behaviour, setBehaviour] = useState({
    default_currency: 'AUD', timezone: 'Australia/Perth', date_format: 'yyyymmdd', default_rate: '150',
    session_timeout_minutes: '1440', default_sla_days: '14', risk_high_threshold: '10',
    risk_extreme_threshold: '16', notif_retention_days: '180', email_retention_days: '365', maintenance_mode: false
  });
  const [theme, setTheme] = useState('light');
  const [saved, setSaved] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.settings.get()
      .then((s) => {
        setForm({
          company_name: s.company_name || '', company_abn: s.company_abn || '',
          company_phone: s.company_phone || '', company_email: s.company_email || '',
          company_address: s.company_address || '', reminder_days: s.reminder_days || '14',
          reminder_email_enabled: s.reminder_email_enabled === 'true', reminder_email_to: s.reminder_email_to || ''
        });
        setBehaviour({
          default_currency: s.default_currency || 'AUD', timezone: s.timezone || 'Australia/Perth',
          date_format: s.date_format || 'yyyymmdd', default_rate: s.default_rate || '150',
          session_timeout_minutes: s.session_timeout_minutes || '1440', default_sla_days: s.default_sla_days || '14',
          risk_high_threshold: s.risk_high_threshold || '10', risk_extreme_threshold: s.risk_extreme_threshold || '16',
          notif_retention_days: s.notif_retention_days || '180', email_retention_days: s.email_retention_days || '365',
          maintenance_mode: s.maintenance_mode === 'true'
        });
        const t = s.theme === 'dark' ? 'dark' : 'light';
        setTheme(t);
        document.documentElement.classList.toggle('dark', t === 'dark');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const notify = (msg) => { setSaved(msg); setTimeout(() => setSaved(''), 2500); };
  const runSave = async (fn, message) => {
    setSaving(true);
    try { await fn(); notify(message); } catch (err) { alert(err.message); } finally { setSaving(false); }
  };
  const save = (keys, message) => runSave(async () => {
    const payload = {};
    for (const k of keys) payload[k] = form[k];
    await api.settings.update(payload);
  }, message);

  const toggleTheme = async (t) => {
    setTheme(t);
    document.documentElement.classList.toggle('dark', t === 'dark');
    await api.settings.update({ theme: t }).catch(() => {});
  };

  const saveBehaviour = () => runSave(async () => {
    const payload = Object.fromEntries(Object.entries(behaviour).map(([k, v]) => [k, v === true ? 'true' : v === false ? 'false' : v]));
    await api.settings.update(payload);
  }, 'System behaviour saved');

  if (loading) return <p className="text-gray-500">Loading…</p>;

  return (
    <div>
      <SectionCard title="Company profile" description="Shown on exported documents and reports.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Company name"><TextField value={form.company_name} onChange={(v) => setForm(f => ({ ...f, company_name: v }))} placeholder="e.g. LUX Traffic Management" /></Field>
          <Field label="ABN / ACN"><TextField value={form.company_abn} onChange={(v) => setForm(f => ({ ...f, company_abn: v }))} placeholder="e.g. 12 345 678 901" /></Field>
          <Field label="Phone"><TextField value={form.company_phone} onChange={(v) => setForm(f => ({ ...f, company_phone: v }))} placeholder="e.g. 08 9000 0000" /></Field>
          <Field label="Email"><TextField value={form.company_email} onChange={(v) => setForm(f => ({ ...f, company_email: v }))} placeholder="e.g. admin@lux.com.au" /></Field>
          <div className="sm:col-span-2">
            <Field label="Address"><TextField value={form.company_address} onChange={(v) => setForm(f => ({ ...f, company_address: v }))} placeholder="e.g. 1 Example St, Perth WA 6000" /></Field>
          </div>
        </div>
        <SaveBar onSave={() => save(['company_name', 'company_abn', 'company_phone', 'company_email', 'company_address'], 'Company profile saved')}
          saving={saving} saved={saved} saveLabel="Save profile" />
      </SectionCard>

      <SectionCard title="Appearance" description="Default colour theme applied across the portal.">
        <div className="flex gap-2">
          <button onClick={() => toggleTheme('light')} className={`tab ${theme === 'light' ? 'tab-active' : 'tab-inactive'}`}>☀️ Light</button>
          <button onClick={() => toggleTheme('dark')} className={`tab ${theme === 'dark' ? 'tab-active' : 'tab-inactive'}`}>🌙 Dark</button>
        </div>
      </SectionCard>

      <SectionCard title="Reminders & notifications" description="How many days before an end/expiry date a reminder notification is created.">
        <Field label="Reminder window (days)" hint="Press Refresh in the notification bell to regenerate reminders with the new window.">
          <NumberField className="max-w-40" value={Number(form.reminder_days) || 0} min={0} max={365}
            onChange={(v) => setForm(f => ({ ...f, reminder_days: String(v) }))} />
        </Field>
        <SaveBar onSave={() => save(['reminder_days'], 'Reminder settings saved')} saving={saving} saved={saved} saveLabel="Save reminders" />
      </SectionCard>

      <SectionCard title="System behaviour" description="Defaults and thresholds that control how the system runs.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Default currency">
            <SelectField value={behaviour.default_currency} onChange={(v) => setBehaviour(b => ({ ...b, default_currency: v }))}
              options={[{ value: 'AUD', label: 'AUD ($)' }, { value: 'USD', label: 'USD ($)' }, { value: 'GBP', label: 'GBP (£)' }, { value: 'EUR', label: 'EUR (€)' }, { value: 'NZD', label: 'NZD ($)' }]} />
          </Field>
          <Field label="Timezone"><TextField value={behaviour.timezone} onChange={(v) => setBehaviour(b => ({ ...b, timezone: v }))} placeholder="Australia/Perth" /></Field>
          <Field label="Date format">
            <SelectField value={behaviour.date_format} onChange={(v) => setBehaviour(b => ({ ...b, date_format: v }))}
              options={[{ value: 'yyyymmdd', label: 'YYYY-MM-DD' }, { value: 'ddmmyyyy', label: 'DD/MM/YYYY' }]} />
          </Field>
          <Field label="Default hourly rate" hint="Prefilled in Time Tracking."><NumberField value={Number(behaviour.default_rate) || 0} onChange={(v) => setBehaviour(b => ({ ...b, default_rate: String(v) }))} /></Field>
          <Field label="Session timeout (minutes)" hint="How long a login stays valid."><NumberField value={Number(behaviour.session_timeout_minutes) || 5} min={5} onChange={(v) => setBehaviour(b => ({ ...b, session_timeout_minutes: String(v) }))} /></Field>
          <Field label="Default SLA days" hint="Fallback assessment days when an authority has no SLA rule."><NumberField value={Number(behaviour.default_sla_days) || 1} min={1} onChange={(v) => setBehaviour(b => ({ ...b, default_sla_days: String(v) }))} /></Field>
          <Field label="Risk high threshold" hint="Score at or above this is High."><NumberField value={Number(behaviour.risk_high_threshold) || 0} onChange={(v) => setBehaviour(b => ({ ...b, risk_high_threshold: String(v) }))} /></Field>
          <Field label="Risk extreme threshold" hint="Score at or above this is Extreme."><NumberField value={Number(behaviour.risk_extreme_threshold) || 0} onChange={(v) => setBehaviour(b => ({ ...b, risk_extreme_threshold: String(v) }))} /></Field>
          <Field label="Notification retention (days)" hint="Old notifications are purged by the hourly scan."><NumberField value={Number(behaviour.notif_retention_days) || 7} min={7} onChange={(v) => setBehaviour(b => ({ ...b, notif_retention_days: String(v) }))} /></Field>
          <Field label="Email log retention (days)"><NumberField value={Number(behaviour.email_retention_days) || 7} min={7} onChange={(v) => setBehaviour(b => ({ ...b, email_retention_days: String(v) }))} /></Field>
        </div>
        <ToggleField label="Maintenance mode — block all data changes app-wide" hint="A read-only banner is shown; Settings stays open so you can turn it off."
          checked={behaviour.maintenance_mode} onChange={(v) => setBehaviour(b => ({ ...b, maintenance_mode: v }))} />
        <SaveBar onSave={saveBehaviour} saving={saving} saved={saved} saveLabel="Save behaviour" />
      </SectionCard>
    </div>
  );
}