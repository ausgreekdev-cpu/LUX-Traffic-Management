import { useEffect, useState } from 'react';
import api from '../../../api';
import { Field, TextField, ToggleField } from '../../../components/settings/fields';
import SectionCard from '../../../components/settings/SectionCard';
import SaveBar from '../../../components/settings/SaveBar';

export default function EmailWebhooksTab() {
  const [smtp, setSmtp] = useState({
    provider: 'smtp', mail_provider: '', host: '', port: '587', secure: false, user: '', pass: '',
    has_pass: false, from_name: '', from_email: '', postmark_token: '', has_postmark_token: false,
    postmark_from_name: '', postmark_from_email: ''
  });
  const [emailLogs, setEmailLogs] = useState([]);
  const [emailBusy, setEmailBusy] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [digest, setDigest] = useState({ reminder_email_enabled: false, reminder_email_to: '' });
  const [webhookSecret, setWebhookSecret] = useState('');
  const [webhookHas, setWebhookHas] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.settings.get()
      .then((s) => {
        setWebhookHas(!!s.webhook_secret);
        setDigest({ reminder_email_enabled: s.reminder_email_enabled === 'true', reminder_email_to: s.reminder_email_to || '' });
      })
      .catch(() => {});
    api.email.getConfig().then(setSmtp).catch(() => {});
    api.email.logs().then(setEmailLogs).catch(() => {});
    Promise.allSettled([api.email.getConfig(), api.email.logs()])
      .then(() => setLoading(false));
  }, []);

  const notify = (msg) => { setSaved(msg); setTimeout(() => setSaved(''), 2500); };

  const saveSmtp = async () => {
    setEmailBusy(true);
    try {
      await api.email.config({
        provider: smtp.mail_provider || '', host: smtp.host, port: smtp.port, secure: smtp.secure,
        user: smtp.user, pass: smtp.pass, from_name: smtp.from_name, from_email: smtp.from_email,
        postmark_token: smtp.postmark_token, postmark_from_name: smtp.postmark_from_name, postmark_from_email: smtp.postmark_from_email
      });
      api.email.getConfig().then(setSmtp).catch(() => {});
      notify('Email settings saved');
    } catch (err) { alert(err.message); } finally { setEmailBusy(false); }
  };

  const sendTestEmail = async () => {
    setEmailBusy(true);
    try {
      const res = await api.email.test(testTo || undefined);
      notify(`Test email sent: ${res.messageId}`);
      api.email.logs().then(setEmailLogs).catch(() => {});
    } catch (err) {
      const tx = err.transport ? `\n(${err.transport.provider || ''} ${err.transport.host}:${err.transport.port})` : '';
      alert(`Test failed: ${err.message}${tx}${err.hint ? `\n\n${err.hint}` : ''}`);
    } finally { setEmailBusy(false); }
  };

  const saveDigest = async () => {
    setSaving(true);
    try {
      await api.settings.update({ reminder_email_enabled: String(digest.reminder_email_enabled), reminder_email_to: digest.reminder_email_to });
      notify('Reminder digest settings saved');
    } catch (err) { alert(err.message); } finally { setSaving(false); }
  };

  const saveWebhook = async () => {
    setSaving(true);
    try {
      if (webhookSecret) await api.settings.update({ webhook_secret: webhookSecret });
      setWebhookHas(!!webhookSecret || webhookHas);
      setWebhookSecret('');
      notify('Webhook settings saved');
    } catch (err) { alert(err.message); } finally { setSaving(false); }
  };

  if (loading) return <p className="text-gray-500">Loading…</p>;

  return (
    <div>
      <SectionCard title="Email (Postmark or SMTP)" description="Outgoing mail used for notifications, rule emails and tests. Settings persist in the database and override the POSTMARK_* / SMTP_* environment variables at runtime. Postmark is used automatically when an API token is saved.">
        <div className="mb-4">
          <span className="label">Active provider</span>
          <p className="text-sm font-semibold">{smtp.provider === 'postmark' ? 'Postmark (API)' : 'SMTP'}</p>
          <div className="flex items-center gap-4 mt-2 text-sm flex-wrap">
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
              <input type={showSecret ? 'text' : 'password'} className="input w-full font-mono" value={smtp.postmark_token}
                onChange={e => setSmtp(s => ({ ...s, postmark_token: e.target.value }))} placeholder={smtp.has_postmark_token ? '••••••••' : 'Server API token (starts with a UUID)'} />
            </Field>
            <div className="flex items-end pb-3">
              <button type="button" onClick={() => setShowSecret(!showSecret)} className="btn btn-ghost">{showSecret ? 'Hide' : 'Show'}</button>
            </div>
            <Field label="From name">
              <input className="input w-full" value={smtp.postmark_from_name} onChange={e => setSmtp(s => ({ ...s, postmark_from_name: e.target.value }))} placeholder="e.g. LUX Traffic Management" />
            </Field>
            <Field label="From email" hint="Must be a sender signature verified in Postmark.">
              <input className="input w-full" value={smtp.postmark_from_email} onChange={e => setSmtp(s => ({ ...s, postmark_from_email: e.target.value }))} placeholder="e.g. admin@lux.com.au" />
            </Field>
          </div>
        </div>

        <div className="border rounded p-3 bg-gray-50 dark:bg-gray-800">
          <p className="label">SMTP (fallback)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="SMTP host">
              <input className="input w-full" value={smtp.host} onChange={e => setSmtp(s => ({ ...s, host: e.target.value }))} placeholder="e.g. smtp.gmail.com" />
            </Field>
            <Field label="Port">
              <input type="number" className="input w-full" value={smtp.port} onChange={e => setSmtp(s => ({ ...s, port: e.target.value }))} placeholder="587" />
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
              <input className="input w-full" value={smtp.user} onChange={e => setSmtp(s => ({ ...s, user: e.target.value }))} placeholder="e.g. admin@lux.com.au" />
            </Field>
            <Field label="Password" hint={smtp.has_pass ? 'Stored — leave blank to keep the existing password.' : undefined}>
              <input type="password" className="input w-full font-mono" value={smtp.pass}
                onChange={e => setSmtp(s => ({ ...s, pass: e.target.value }))} placeholder={smtp.has_pass ? '••••••••' : 'App password or mailbox password'} />
            </Field>
            <Field label="From name">
              <input className="input w-full" value={smtp.from_name} onChange={e => setSmtp(s => ({ ...s, from_name: e.target.value }))} placeholder="e.g. LUX Traffic Management" />
            </Field>
            <Field label="From email">
              <input className="input w-full" value={smtp.from_email} onChange={e => setSmtp(s => ({ ...s, from_email: e.target.value }))} placeholder="e.g. admin@lux.com.au" />
            </Field>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button onClick={saveSmtp} disabled={emailBusy} className="btn btn-primary">Save email settings</button>
          <button onClick={sendTestEmail} disabled={emailBusy} className="btn btn-ghost">{emailBusy ? 'Working…' : 'Send test email'}</button>
          <input value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="Test recipient (optional)" className="input flex-1 min-w-40" />
        </div>

        <div className="mt-4 border-t pt-3">
          <p className="label">Reminder digest</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Send one summary email on each hourly scan when TMPs or permits are expiring/expired. Leave recipients blank to use all admin user emails.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ToggleField label="Send reminder digest emails" checked={digest.reminder_email_enabled} onChange={(v) => setDigest(d => ({ ...d, reminder_email_enabled: v }))} />
            <TextField value={digest.reminder_email_to} onChange={(v) => setDigest(d => ({ ...d, reminder_email_to: v }))} placeholder="Recipients (comma-separated, optional)" />
          </div>
          <SaveBar onSave={saveDigest} saving={saving} saved={saved} saveLabel="Save digest settings" />
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
        <p className="text-xs text-gray-400 mt-1">Email <b>templates</b> (subject, plain-text body, optional <code>html_body</code>) are authored under <b>Traffic Engine → Automation → Email templates</b> — the branded HTML shell is configured under <b>Branding → Email &amp; Domain</b>.</p>
      </SectionCard>

      <SectionCard title="Inbound webhooks" description="Point your email/webhook provider here to ingest correspondence and match it to TMPs. Payloads appear on the Correspondence page for review.">
        <div className="space-y-3">
          <Field label="Webhook secret">
            <div className="flex gap-2">
              <input type={showSecret ? 'text' : 'password'} className="input w-full font-mono" value={webhookSecret}
                onChange={e => setWebhookSecret(e.target.value)} placeholder={webhookHas ? 'Stored — leave blank to keep it' : 'Leave blank for unauthenticated delivery'} />
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
            <p>Body may include <code className="font-mono">sender/from</code>, <code className="font-mono">subject</code> and <code className="font-mono">text/body</code> fields; emails are parsed for a TMP reference and outcome keywords.</p>
          </div>
          <SaveBar onSave={saveWebhook} saving={saving} saved={saved} saveLabel="Save webhook settings" />
        </div>
      </SectionCard>
    </div>
  );
}