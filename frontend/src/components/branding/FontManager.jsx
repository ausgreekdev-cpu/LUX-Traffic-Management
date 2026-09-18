import { useRef, useState } from 'react';
import api from '../../api';

const SLOTS = ['ui', 'map', 'display'];

const FONT_HINTS = {
  ui: 'App-wide UI font. A TTF is used in PDF exports; WOFF2 is used in the web app.',
  map: 'Optional map-overlay label font (referenced as --font-map).',
  display: 'Feature / heading font — BFC Shine (florist / white-label brand). Used for logos, hero titles, page headers & seals. Upload WOFF2 for web + TTF/OTF for PDF embedding.'
};

export default function FontManager({ typography, onChange, onSave, saving, onError, domain }) {
  const [family, setFamily] = useState({ ui: '', map: '', display: 'BFC Shine' });
  const inputs = useRef({});

  const uploadFont = async (slot, file) => {
    if (!file) return;
    const name = String(file.name || '').toLowerCase();
    const format = name.endsWith('.otf') ? 'otf' : name.endsWith('.woff') ? 'woff' : name.endsWith('.ttf') ? 'ttf' : 'woff2';
    try {
      await api.branding.uploadAsset(`font_${slot}`, file, domain);
      const fallbackFamily = slot === 'display' ? 'BFC Shine' : slot === 'ui' ? 'Brand UI' : 'Brand Map';
      const next = {
        ...typography,
        [slot]: { family: family[slot].trim() || fallbackFamily, src: `font_${slot}`, format }
      };
      onChange(next);
    } catch (err) {
      onError(err.message);
    } finally {
      if (inputs.current[slot]) inputs.current[slot].value = '';
    }
  };

  const removeFont = (slot) => {
    const next = { ...typography };
    delete next[slot];
    onChange(next);
  };

  return (
    <div className="space-y-4">
      {SLOTS.map(slot => (
        <div key={slot} className="card p-4">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3 className="font-semibold">{slot === 'ui' ? 'UI font' : slot === 'display' ? 'Feature font — BFC Shine' : 'Map font'}</h3>
            {typography[slot] && <button onClick={() => removeFont(slot)} className="text-red-500 hover:underline text-xs">Remove</button>}
          </div>
          <p className="text-xs text-gray-500 mb-3">{FONT_HINTS[slot]}</p>
          {typography[slot] ? (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="badge bg-lux-100 text-lux-800 dark:bg-lux-900/40 dark:text-lux-300" style={{ fontFamily: `'${typography[slot].family}', var(--font-display), sans-serif` }}>
                {typography[slot].family}
              </span>
              <span className="text-xs text-gray-500">{typography[slot].format.toUpperCase()} · {typography[slot].src}</span>
              <span className="text-sm" style={{ fontFamily: `'${typography[slot].family}', var(--font-display), sans-serif` }}>Aa Bb Cc 0123456789 — BFC Shine</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                value={family[slot]}
                onChange={e => setFamily(f => ({ ...f, [slot]: e.target.value }))}
                placeholder="Font family name"
                className="input w-40"
              />
              <input
                ref={el => { inputs.current[slot] = el; }}
                type="file"
                accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
                className="hidden"
                id={`font-${slot}`}
                onChange={e => uploadFont(slot, e.target.files[0])}
              />
              <label htmlFor={`font-${slot}`} className="btn btn-secondary btn-sm cursor-pointer">Upload {slot === 'display' ? 'BFC Shine (TTF / OTF / WOFF2)' : 'TTF / WOFF2'}</label>
            </div>
          )}
        </div>
      ))}
      <div>
        <button onClick={() => onSave(typography)} disabled={saving} className="btn btn-primary">Save fonts</button>
        <p className="text-xs text-gray-500 mt-2">WOFF2 is optimised for the web; upload a TTF alongside it when you want the font embedded in PDF exports (PDFKit embeds TTF/OTF only).</p>
      </div>
    </div>
  );
}
