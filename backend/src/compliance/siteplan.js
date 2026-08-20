// Deterministic SVG site-plan diagram rendered from a TGS layout.
// Kept dependency-free so the export route can serve it as a static asset.

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function safeParse(str) {
  try { return JSON.parse(str); } catch { return {}; }
}

function mmToX(mm, range = 200) {
  return Math.round(50 + (Math.min(Math.max(mm, 0), range) / range) * 700);
}

export function buildSitePlanSvg({ tmp = {}, site = {}, tgs = null }) {
  const layout = tgs?.layout_json ? safeParse(tgs.layout_json) : {};
  const working = layout.working_hours || {};
  const footpath = layout.footpath || {};
  const closures = Array.isArray(layout.closures) ? layout.closures : [];
  const detours = Array.isArray(layout.detours) ? layout.detours : [];
  const busStops = layout.bus_stops || 0;
  const vms = layout.vms || 0;

  const title = tmp.reference ? `${tmp.reference} - ${tmp.title || ''}` : (tmp.title || 'Site Plan');
  const siteLabel = site.name || site.road_name || 'Unnamed site';
  const hours = working.start && working.end ? `${working.start} - ${working.end}` : 'Hours TBC';
  const widthNote = footpath.min_width_m ? `Footpath width ${footpath.min_width_m} m` : '';

  const patterns = `
    <defs>
      <pattern id="hatch" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
        <rect width="8" height="8" fill="#ef4444" opacity="0.85"/>
        <line x1="0" y1="0" x2="0" y2="8" stroke="#ffffff" stroke-width="2"/>
      </pattern>
    </defs>`;

  const closureEls = closures.map((c) => {
    const x1 = mmToX(c.from_m ?? 0);
    const x2 = mmToX(c.to_m ?? 100);
    return `
      <rect x="${x1}" y="170" width="${Math.max(20, x2 - x1)}" height="110" fill="url(#hatch)" stroke="#b91c1c" stroke-width="1.5"/>
      <text x="${(x1 + x2) / 2}" y="160" font-size="12" font-weight="bold" fill="#b91c1c" text-anchor="middle">${esc(c.label || 'CLOSED')}</text>`;
  }).join('');

  const detourEls = detours.map((d, i) => {
    const y = 310 + i * 28;
    return `
      <path d="M 50 ${y} L 750 ${y}" fill="none" stroke="#059669" stroke-width="3" stroke-dasharray="10 6"/>
      <path d="M 730 ${y - 6} L 750 ${y} L 730 ${y + 6}" fill="#059669"/>
      <text x="56" y="${y - 8}" font-size="11" fill="#059669" font-weight="bold">${esc(d.label || `Detour ${i + 1}`)}</text>`;
  }).join('');

  const busEls = Array.from({ length: Math.min(busStops, 6) }, (_, i) => {
    const x = 120 + i * 90;
    return `<rect x="${x}" y="150" width="26" height="14" rx="3" fill="#4338ca" stroke="#312e81" stroke-width="1"/>
      <circle cx="${x + 13}" cy="157" r="3.5" fill="#ffffff"/>`;
  }).join('');

  const vmsEls = Array.from({ length: Math.min(vms, 4) }, (_, i) => {
    const x = 150 + i * 80;
    return `<rect x="${x}" y="132" width="40" height="26" rx="3" fill="#1d4ed8" stroke="#1e3a8a" stroke-width="1"/>
      <text x="${x + 20}" y="149" font-size="9" fill="#ffffff" text-anchor="middle">VMS</text>`;
  }).join('');

  const workingDays = Array.isArray(layout.working_days) && layout.working_days.length
    ? layout.working_days.join(', ')
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="460" viewBox="0 0 800 460" font-family="Segoe UI, Arial, sans-serif">
${patterns}
  <rect x="0" y="0" width="800" height="460" fill="#ffffff"/>
  <text x="50" y="34" font-size="18" font-weight="bold" fill="#111827">${esc(title)}</text>
  <text x="50" y="54" font-size="12" fill="#4b5563">${esc(siteLabel)} · ${esc(hours)}${widthNote ? ' · ' + esc(widthNote) : ''}${workingDays ? ' · ' + esc(workingDays) : ''}</text>

  <text x="50" y="108" font-size="12" font-weight="bold" fill="#374151">Footpath</text>
  <rect x="50" y="135" width="700" height="35" fill="#f5e6c8" stroke="#b45309" stroke-width="1"/>
  ${vmsEls}
  ${busEls}

  <rect x="50" y="170" width="700" height="110" fill="#e2e8f0" stroke="#475569" stroke-width="2"/>
  <line x1="50" y1="225" x2="750" y2="225" stroke="#94a3b8" stroke-width="2" stroke-dasharray="16 10"/>
  ${closureEls}
  <text x="400" y="196" font-size="11" fill="#475569" text-anchor="middle">CARRIAGEWAY</text>
  <text x="400" y="258" font-size="11" fill="#475569" text-anchor="middle">CLEAR PATH ≥ 1.2 m</text>

  <rect x="50" y="280" width="700" height="35" fill="#f5e6c8" stroke="#b45309" stroke-width="1"/>
  <text x="50" y="338" font-size="12" font-weight="bold" fill="#374151">Footpath</text>

  ${detourEls}

  <line x1="50" y1="390" x2="750" y2="390" stroke="#d1d5db" stroke-width="1"/>
  <text x="50" y="412" font-size="11" fill="#374151" font-weight="bold">LEGEND</text>
  <rect x="50" y="422" width="14" height="14" fill="url(#hatch)" stroke="#b91c1c" stroke-width="1"/>
  <text x="72" y="434" font-size="10" fill="#4b5563">Closure</text>
  <path d="M 140 429 L 160 429" stroke="#059669" stroke-width="3" stroke-dasharray="10 6"/>
  <text x="168" y="434" font-size="10" fill="#4b5563">Detour</text>
  <rect x="230" y="422" width="16" height="14" rx="2" fill="#1d4ed8"/>
  <text x="252" y="434" font-size="10" fill="#4b5563">VMS</text>
  <rect x="300" y="422" width="16" height="14" rx="3" fill="#4338ca"/>
  <text x="322" y="434" font-size="10" fill="#4b5563">Bus stop</text>
</svg>`;
}