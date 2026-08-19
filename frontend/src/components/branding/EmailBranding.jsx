import { useState } from 'react';

export default function EmailBranding({ email, onChange, onSave, saving }) {
  const [draft, setDraft] = useState({ ...email });

  const update = (key, value) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    onChange(next);
  };

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Branded HTML email shell</h3>
            <p className="text-xs text-gray-500 mt-1">When enabled, plain-text messages are wrapped in a branded HTML shell (logo header, accent footer). Fully custom templates can add an <code>html_body</code> in Settings → General &amp; System → Email &amp; Webhooks.</p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!draft.enabled} onChange={e => update('enabled', e.target.checked)} className="h-4 w-4 accent-lux-500" />
            <span className="text-sm font-medium">Enabled</span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">From name (branded)</label>
            <input value={draft.from_name || ''} onChange={e => update('from_name', e.target.value)} className="input w-full" placeholder="e.g. City Council — Traffic" />
          </div>
          <div>
            <label className="label">From email (branded)</label>
            <input value={draft.from_email || ''} onChange={e => update('from_email', e.target.value)} className="input w-full" placeholder="no-reply@citycouncil.gov.au" />
          </div>
          <div>
            <label className="label">Accent colour (buttons / rules)</label>
            <div className="flex items-center gap-2">
              <input type="color" value={draft.accent || '#f57f17'} onChange={e => update('accent', e.target.value)} className="h-9 w-12 rounded border border-gray-300 dark:border-gray-600 bg-transparent cursor-pointer" />
              <input type="text" value={draft.accent || ''} onChange={e => update('accent', e.target.value)} className="input w-28" />
            </div>
          </div>
          <div>
            <label className="label">Footer line</label>
            <input value={draft.footer || ''} onChange={e => update('footer', e.target.value)} className="input w-full" placeholder="© City Council — Traffic Management" />
          </div>
        </div>
      </div>

      <div>
        <button onClick={() => onSave(draft)} disabled={saving} className="btn btn-primary">Save email branding</button>
        <p className="text-xs text-gray-500 mt-2">SMTP credentials and editable templates (with <code>html_body</code>) are managed in Settings → General &amp; System → Email &amp; Webhooks.</p>
      </div>
    </div>
  );
}
