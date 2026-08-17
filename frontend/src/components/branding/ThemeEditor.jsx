import { useEffect, useRef, useState } from 'react';
import { useBranding } from '../../context/Branding';
import { computeCssVars, computeAudit, THEME_DEFAULTS } from '../../utils/theme';

const RAMP_STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'];

function ColorField({ label, value, onChange }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={e => onChange(e.target.value)} className="h-9 w-12 rounded border border-gray-300 dark:border-gray-600 bg-transparent cursor-pointer" />
        <input type="text" value={value} onChange={e => onChange(e.target.value)} className="input w-28" />
      </div>
    </div>
  );
}

export default function ThemeEditor({ value, onChange, onSave, saving }) {
  const { applyDraft } = useBranding();
  const [draft, setDraft] = useState(() => ({ ...THEME_DEFAULTS, ...value }));
  const timer = useRef(null);

  useEffect(() => {
    setDraft({ ...THEME_DEFAULTS, ...value });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.primary]);

  const update = (key, hex) => {
    const next = { ...draft, [key]: hex };
    setDraft(next);
    onChange(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const { vars, themeColor } = computeCssVars(next);
      applyDraft({ cssVars: vars, themeColor });
    }, 180);
  };

  const audit = computeAudit(draft);
  const { theme } = computeCssVars(draft);
  const ramp = theme.ramp;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ColorField label="Primary" value={draft.primary} onChange={h => update('primary', h)} />
        <ColorField label="Secondary" value={draft.secondary} onChange={h => update('secondary', h)} />
        <ColorField label="Accent" value={draft.accent} onChange={h => update('accent', h)} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ColorField label="WIP warning" value={draft.wip_warn} onChange={h => update('wip_warn', h)} />
        <ColorField label="WIP alert" value={draft.wip_alert} onChange={h => update('wip_alert', h)} />
        <ColorField label="Emergency" value={draft.emergency} onChange={h => update('emergency', h)} />
      </div>

      <div className="card p-4">
        <h3 className="font-semibold mb-1">Generated primary ramp</h3>
        <p className="text-xs text-gray-500 mb-3">Auto-derived 50–900 steps from Primary. Dark and light modes use these values with the existing dark: utilities.</p>
        <div className="flex gap-1 flex-wrap">
          {RAMP_STEPS.map(step => (
            <div key={step} className="text-center">
              <div className="h-10 w-14 rounded" style={{ backgroundColor: ramp[step] }} title={`--lux-${step}: ${ramp[step]}`} />
              <div className="text-[9px] text-gray-500 mt-0.5">{step}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-4">
        <h3 className="font-semibold mb-3">WCAG contrast audit</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="table-th">Token</th>
                <th className="table-th">Swatch</th>
                <th className="table-th">White text</th>
                <th className="table-th">Black text</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {audit.map(a => (
                <tr key={a.label} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="table-td font-medium">{a.label}</td>
                  <td className="table-td"><span className="inline-block h-5 w-10 rounded border border-gray-200 dark:border-gray-600" style={{ backgroundColor: a.bg }} /></td>
                  <td className="table-td">
                    <span className={`badge ${a.whiteAA ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{a.whiteAA ? 'AA ✓' : 'AA ✗'} {a.white}:1</span>
                  </td>
                  <td className="table-td">
                    <span className={`badge ${a.blackAA ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{a.blackAA ? 'AA ✓' : 'AA ✗'} {a.black}:1</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500 mt-2">AA (4.5:1) is recommended for body text; 3:1 suffices for large/bold text.</p>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => onSave(draft)} disabled={saving} className="btn btn-primary">Save theme</button>
        <span className="text-xs text-gray-500">Live preview updates as you type.</span>
      </div>
    </div>
  );
}
