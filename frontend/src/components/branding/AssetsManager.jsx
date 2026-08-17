import { useRef } from 'react';
import api from '../../api';

const SLOTS = [
  { slot: 'logo_light', label: 'Logo — light background', hint: 'PNG or SVG with transparency. Min ~512px or vector. Shown on light surfaces.', accept: 'image/png,image/svg+xml,image/webp' },
  { slot: 'logo_dark', label: 'Logo — dark background', hint: 'PNG or SVG with transparency, for the sidebar / login (dark surfaces).', accept: 'image/png,image/svg+xml,image/webp' },
  { slot: 'favicon', label: 'Favicon', hint: 'SVG or PNG. Replaces the browser tab icon.', accept: 'image/png,image/svg+xml,image/x-icon' },
  { slot: 'apple_touch', label: 'Apple touch icon', hint: '180×180 PNG (square).', accept: 'image/png' },
  { slot: 'pwa_192', label: 'PWA icon 192×192', hint: 'Square PNG used for install prompts.', accept: 'image/png' },
  { slot: 'pwa_512', label: 'PWA icon 512×512', hint: 'Square PNG used for install prompts.', accept: 'image/png' },
  { slot: 'splash', label: 'App splash screen', hint: 'PNG splash/screen graphic.', accept: 'image/png' },
  { slot: 'seal', label: 'Seal / stamp overlay', hint: 'Transparent PNG or SVG for engineer sign-off blocks and PDF stamps.', accept: 'image/png,image/svg+xml' }
];

export default function AssetsManager({ assets, onChanged, onError, domain }) {
  const inputs = useRef({});
  const qs = domain ? `?domain=${encodeURIComponent(domain)}` : '';

  const handleUpload = async (slot, file) => {
    if (!file) return;
    try {
      await api.branding.uploadAsset(slot, file, domain);
      onChanged();
    } catch (err) {
      onError(err.message);
    } finally {
      if (inputs.current[slot]) inputs.current[slot].value = '';
    }
  };

  const handleDelete = async (slot) => {
    if (!confirm(`Remove the ${slot} asset?`)) return;
    try {
      await api.branding.deleteAsset(slot, domain);
      onChanged();
    } catch (err) {
      onError(err.message);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {SLOTS.map(s => {
        const has = assets.some(a => a.slot === s.slot);
        return (
          <div key={s.slot} className="card p-4">
            <div className="flex items-start gap-4">
              <div className={`h-20 w-20 shrink-0 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center bg-white ${s.slot === 'logo_dark' ? 'dark:bg-gray-900' : ''}`}>
                {has ? (
                  <img src={`/api/branding/assets/${s.slot}${qs}`} alt={s.label} className="max-h-16 max-w-16 object-contain" />
                ) : (
                  <span className="text-[10px] text-gray-400 text-center px-1">No asset</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-sm">{s.label}</h3>
                <p className="text-xs text-gray-500 mt-1">{s.hint}</p>
                <div className="flex gap-2 mt-2 flex-wrap">
                  <input
                    ref={el => { inputs.current[s.slot] = el; }}
                    type="file"
                    accept={s.accept}
                    className="hidden"
                    id={`asset-${s.slot}`}
                    onChange={e => handleUpload(s.slot, e.target.files[0])}
                  />
                  <label htmlFor={`asset-${s.slot}`} className="btn btn-secondary btn-sm cursor-pointer">{has ? 'Replace' : 'Upload'}</label>
                  {has && <button onClick={() => handleDelete(s.slot)} className="text-red-500 hover:underline text-xs px-2">Remove</button>}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
