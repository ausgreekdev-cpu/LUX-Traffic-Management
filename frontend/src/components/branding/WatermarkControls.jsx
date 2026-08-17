import { useState } from 'react';

const STATUS_KEYS = ['draft', 'submitted', 'approved', 'rejected', 'expired', 'cancelled', 'completed'];

export default function WatermarkControls({ watermark, onChange, onSave, saving }) {
  const [draft, setDraft] = useState({ ...watermark });

  const update = (key, value) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    onChange(next);
  };

  const updateStatus = (key, value) => {
    const next = { ...draft, status_text: { ...(draft.status_text || {}), [key]: value } };
    setDraft(next);
    onChange(next);
  };

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold w-32">Mode</span>
          <div className="flex gap-2">
            {[['off', 'Off'], ['status', 'By status'], ['always', 'Always']].map(([v, l]) => (
              <button key={v} onClick={() => update('mode', v)}
                className={`chip ${draft.mode === v ? 'chip-active' : 'chip-inactive'}`}>{l}</button>
            ))}
          </div>
        </div>

        {draft.mode === 'always' && (
          <div>
            <label className="label">Watermark text</label>
            <input value={draft.text || ''} onChange={e => update('text', e.target.value)} className="input w-full" placeholder="FOR PERMIT ONLY" />
          </div>
        )}

        {draft.mode === 'status' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {STATUS_KEYS.map(k => (
              <div key={k}>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1 capitalize">{k.replace(/_/g, ' ')}</label>
                <input value={draft.status_text?.[k] || ''} onChange={e => updateStatus(k, e.target.value)} className="input w-full" placeholder="—" />
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">Opacity (0–1)</label>
            <input type="number" min="0" max="1" step="0.01" value={draft.opacity} onChange={e => update('opacity', parseFloat(e.target.value) || 0)} className="input w-full" />
          </div>
          <div>
            <label className="label">Font size</label>
            <input type="number" min="8" max="160" value={draft.fontSize} onChange={e => update('fontSize', parseInt(e.target.value, 10) || 56)} className="input w-full" />
          </div>
          <div>
            <label className="label">Colour</label>
            <div className="flex items-center gap-2">
              <input type="color" value={draft.color || '#cccccc'} onChange={e => update('color', e.target.value)} className="h-9 w-12 rounded border border-gray-300 dark:border-gray-600 bg-transparent cursor-pointer" />
              <input type="text" value={draft.color || ''} onChange={e => update('color', e.target.value)} className="input w-28" />
            </div>
          </div>
        </div>
      </div>

      <div>
        <button onClick={() => onSave(draft)} disabled={saving} className="btn btn-primary">Save watermark</button>
      </div>
    </div>
  );
}
