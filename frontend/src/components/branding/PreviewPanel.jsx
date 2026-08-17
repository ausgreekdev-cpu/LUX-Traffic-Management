import { useBranding } from '../../context/Branding';

const SAMPLE_COLUMNS = [
  { name: 'Drafting', wip: '2/2' },
  { name: 'Client Review', wip: '1/3' },
  { name: 'Safety Audit', wip: '2/2' },
  { name: 'Council Pending', wip: '1/1' }
];

const SAMPLE_CARDS = [
  ['REF-1001', 'High St intersection upgrade', 'draft', false],
  ['REF-1002', 'School zone signage refresh', 'draft', false],
  ['REF-1003', 'Road closure — festival', 'submitted', true],
  ['REF-1004', 'Night works pavement', 'review', false]
];

function PfdBlockLabel(type) {
  const map = {
    company_name: 'Company Name', logo: 'LOGO', plan_title: 'Plan Title', reference: 'Reference: REF-1001',
    permit_number: 'Permit: City Council #2281', accreditation: 'ABN 12 345 678 901', generated_at: 'Generated: 2026-08-17',
    page_number: 'Page 1', company_details: '08 9000 0000 | ops@company.com.au', seal: 'SEAL', text: 'Custom text'
  };
  return map[type] || type;
}

export default function PreviewPanel({ pdfLayout, watermark, assets }) {
  const { branding } = useBranding();
  const hasLogo = assets && assets.some(a => a.slot === 'logo_dark' || a.slot === 'logo_light');
  const wmText = watermark && watermark.mode !== 'off'
    ? (watermark.mode === 'status' ? watermark.status_text?.approved || 'APPROVED' : watermark.text)
    : '';

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h3 className="font-semibold mb-1">Live Kanban preview</h3>
        <p className="text-xs text-gray-500 mb-3">Real components themed by the current brand — updates as you edit.</p>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-3 py-2 bg-gray-900 text-white flex items-center gap-2">
            <div className={`h-6 w-6 rounded bg-lux-500 flex items-center justify-center`}>
              <span className="text-[9px] font-black text-gray-900">LUX</span>
            </div>
            <span className="text-xs font-semibold">{branding?.appName || 'Traffic Management'}</span>
            <span className="ml-auto flex gap-1">
              <span className="emg-soft text-[8px] px-1.5 py-0.5 rounded font-bold">EMERGENCY</span>
              <span className="text-[8px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 font-bold">WIP 2/2</span>
            </span>
          </div>
          <div className="p-2 grid grid-cols-4 gap-2 bg-gray-50 dark:bg-gray-900">
            {SAMPLE_COLUMNS.map((c, i) => (
              <div key={c.name} className="min-h-24 rounded-lg bg-gray-100 dark:bg-gray-700/40 p-1.5">
                <div className="flex items-center justify-between px-1 mb-1">
                  <span className="text-[9px] font-bold truncate">{c.name}</span>
                  <span className={`text-[9px] font-semibold ${i === 1 || i === 2 ? 'text-[color:var(--system-wip-warn)]' : 'text-gray-400'}`}>{c.wip}</span>
                </div>
                {SAMPLE_CARDS.filter((_, idx) => idx % 4 === i).map(([ref, title, , emg]) => (
                  <div key={ref} className={`bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-1.5 mb-1 ${emg ? 'emg-lane-border' : ''}`}>
                    <p className="text-[9px] font-medium leading-tight truncate">{title}</p>
                    <p className="text-[8px] font-mono text-gray-400 mt-0.5">{ref}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <span className={`text-[7px] px-1 rounded ${emg ? 'emg-chip' : 'bg-lux-500 text-white'}`}>{emg ? 'EMERGENCY' : title.length > 14 ? 'IN REVIEW' : 'ACTIVE'}</span>
                      <span className="ml-auto h-3.5 w-3.5 rounded-full bg-lux-500 text-gray-900 flex items-center justify-center text-[7px] font-bold">JD</span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-4">
        <h3 className="font-semibold mb-1">Traffic Control Plan preview</h3>
        <p className="text-xs text-gray-500 mb-3">HTML mirror of the saved PDF layout (header blocks, watermark, footer).</p>
        <div className="relative aspect-[1/1.414] max-h-96 w-full bg-white rounded-lg border border-gray-300 overflow-hidden shadow-inner mx-auto">
          {wmText && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
              style={{ transform: 'rotate(-30deg)', color: watermark.color || '#cccccc', opacity: watermark.opacity ?? 0.14, fontSize: watermark.fontSize ? watermark.fontSize / 3 : 18, fontWeight: 700 }}>
              {wmText}
            </div>
          )}
          <div className="absolute top-0 inset-x-0 px-4 pt-3 border-b border-gray-200" style={{ minHeight: '44px' }}>
            {(pdfLayout.header || []).map(b => {
              const align = b.align === 'center' ? 'justify-center' : b.align === 'right' ? 'justify-end' : 'justify-start';
              return (
                <div key={b.id} className={`flex ${align} py-0.5`} style={{ fontSize: Math.min(b.size || 10, 14), color: b.color || '#000' }}>
                  {b.type === 'logo' || b.type === 'seal'
                    ? (hasLogo ? <span className="inline-block h-6 w-16 rounded bg-gray-200 border border-gray-300 text-center text-[8px] leading-6 text-gray-500">{b.type === 'logo' ? 'LOGO' : 'SEAL'}</span>
                      : <span className="text-[10px] text-gray-400 italic">(upload a {b.type} asset)</span>)
                    : <span className="font-medium truncate">{PfdBlockLabel(b.type)}</span>}
                </div>
              );
            })}
            {(!pdfLayout.header || pdfLayout.header.length === 0) && (
              <p className="text-[10px] text-gray-400 italic">No header blocks — using default company header.</p>
            )}
          </div>
          <div className="absolute inset-x-0 px-4 py-3">
            <p className="text-sm font-bold text-gray-800">Traffic Management Plan</p>
            <div className="mt-2 space-y-1">
              {['Reference: TMP-2026-0142', 'Title: High St intersection upgrade', 'Status: Submitted', 'Site: High St, Perth', 'Project: Festival Road Works'].map(l => (
                <p key={l} className="text-[10px] text-gray-600 border-b border-dashed border-gray-100 pb-0.5">{l}</p>
              ))}
            </div>
            <div className="mt-3">
              <p className="text-[10px] font-semibold text-gray-700 mb-1">Workflow checklist</p>
              {['[X] TMP drawing prepared', '[X] Internal review', '[X] Client sign-off', '[ ] Council submission'].map(s => (
                <p key={s} className="text-[9px] text-gray-500">{s}</p>
              ))}
            </div>
          </div>
          <div className="absolute bottom-0 inset-x-0 px-4 pb-3 pt-2 border-t border-gray-200 bg-gray-50/80">
            {(pdfLayout.footer || []).map(b => {
              const align = b.align === 'center' ? 'justify-center' : b.align === 'right' ? 'justify-end' : 'justify-start';
              return (
                <div key={b.id} className={`flex ${align} py-0.5`} style={{ fontSize: Math.min(b.size || 8, 10), color: b.color || '#666' }}>
                  <span className="truncate">{PfdBlockLabel(b.type)}</span>
                </div>
              );
            })}
            {(pdfLayout.footer || []).length === 0 && <p className="text-[9px] text-gray-400 text-center">Page 1</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
