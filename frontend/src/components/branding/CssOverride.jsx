import { useRef, useState } from 'react';
import { useBranding } from '../../context/Branding';

function validateCss(css) {
  if (!css.trim()) return { ok: true };
  try {
    if (typeof CSSStyleSheet !== 'undefined' && CSSStyleSheet.prototype.replaceSync) {
      new CSSStyleSheet().replaceSync(css);
      return { ok: true };
    }
  } catch (err) {
    return { ok: false, message: err.message };
  }
  return { ok: true };
}

export default function CssOverride({ cssOverride, onChange, onSave, saving, versions, onRestore, onReset }) {
  const { applyDraft } = useBranding();
  const [draft, setDraft] = useState(cssOverride || '');
  const [result, setResult] = useState(null);
  const timer = useRef(null);

  const update = (css) => {
    setDraft(css);
    onChange(css);
    const check = validateCss(css);
    setResult(check);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (check.ok) applyDraft({ css_override: css });
    }, 200);
  };

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h3 className="font-semibold mb-1">Raw CSS / variable override</h3>
        <p className="text-xs text-gray-500 mb-3">
          Inject custom CSS on top of the generated theme. Use <code>var(--brand-*)</code> tokens, override <code>--lux-*</code> / <code>--system-*</code> variables, or restyle components. Changes preview live.
        </p>
        <textarea
          value={draft}
          onChange={e => update(e.target.value)}
          spellCheck="false"
          rows="12"
          placeholder={':root {\n  --brand-primary: #123456;\n  /* … */\n}\n\n.custom-class { … }'}
          className="input w-full font-mono text-xs leading-relaxed"
        />
        {result && (
          <p className={`mt-2 text-xs ${result.ok ? 'text-green-600' : 'text-red-600'}`}>
            {result.ok ? 'CSS is valid — previewing live.' : `CSS error: ${result.message}`}
          </p>
        )}
        <div className="flex gap-2 mt-3 flex-wrap">
          <button onClick={() => onSave(draft)} disabled={saving || (result && !result.ok)} className="btn btn-primary">Save CSS</button>
          <button onClick={() => { setDraft(''); onChange(''); setResult(null); applyDraft({ css_override: '' }); }} className="btn btn-ghost">Clear</button>
          <button onClick={() => { if (confirm('Reset ALL branding to defaults? This cannot be undone (a snapshot is kept).')) onReset(); }} className="btn btn-danger">Reset to defaults</button>
        </div>
      </div>

      <div className="card p-4">
        <h3 className="font-semibold mb-3">Version history</h3>
        {versions.length === 0 ? (
          <p className="text-xs text-gray-500">No snapshots yet. Every save stores the previous state here.</p>
        ) : (
          <ul className="divide-y dark:divide-gray-700">
            {versions.map(v => (
              <li key={v.id} className="flex items-center justify-between gap-2 py-2">
                <div>
                  <p className="text-sm font-medium">{v.label}</p>
                  <p className="text-xs text-gray-500">{v.created_at} · {v.created_by || 'unknown'}</p>
                </div>
                <button onClick={() => onRestore(v.id)} className="text-lux-600 dark:text-lux-400 hover:underline text-xs">Restore</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
