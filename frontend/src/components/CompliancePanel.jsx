import { useState, useEffect, useCallback } from 'react';
import api from '../api';
import { useAuth, hasRole } from '../context/Auth';

const WORK_TYPES = [
  { value: 'general', label: 'General works' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'event', label: 'Event' },
  { value: 'footpath_utility', label: 'Footpath / utility' },
  { value: 'skip_bin_hoarding', label: 'Skip bin / hoarding' }
];

const DAYS = [
  { value: 'mon', label: 'Mon' },
  { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' },
  { value: 'sat', label: 'Sat' },
  { value: 'sun', label: 'Sun' }
];

const EMPTY_LAYOUT = () => ({
  work_type: 'general',
  working_hours: { start: '07:00', end: '17:00' },
  working_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
  road_lanes: 2,
  closures: [],
  detours: [],
  footpath: { min_width_m: 2, closed: false, min_clear_path_mm: 1200, signed_alternate: false, ramp_gradient_1in14: false },
  bus_stops: 0,
  bus_stop_relocation_planned: false,
  school_zone_proximity_m: null,
  clearway_nearby: false,
  signalised_intersection_within_30m: false,
  pedestrian_zones: 0,
  vms: 0,
  emergency_access_corridor: false,
  tactile_indicators: false,
  loading_zone_reserved: false,
  resident_notice_planned: false,
  mrwa_referral_planned: false,
  rail_authority_approved: false
});

const Field = ({ label, children, className = '' }) => (
  <label className={`block ${className}`}>
    <span className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</span>
    {children}
  </label>
);

const inputCls = 'w-full input text-sm';
const checkCls = 'h-4 w-4 rounded border-gray-300 text-lux-600 focus:ring-lux-500 dark:bg-gray-700 dark:border-gray-600';

function verdictBadge(verdict) {
  if (verdict === 'ok') return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300';
  if (verdict === 'warn') return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300';
  return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
}

export default function CompliancePanel({ tmpId, tmp, canEdit }) {
  const { user } = useAuth();
  const isDev = hasRole(user, 'developer');
  const [layout, setLayout] = useState(EMPTY_LAYOUT());
  const [check, setCheck] = useState(null);
  const [ruleCount, setRuleCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showSitePlan, setShowSitePlan] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.compliance.getTgs(tmpId),
      api.compliance.rules()
    ]).then(([tgsRes, rules]) => {
      const existing = tgsRes.tgs?.layout || null;
      if (existing) {
        setLayout({
          ...EMPTY_LAYOUT(),
          ...existing,
          working_hours: { ...EMPTY_LAYOUT().working_hours, ...(existing.working_hours || {}) },
          footpath: { ...EMPTY_LAYOUT().footpath, ...(existing.footpath || {}) }
        });
      } else if (tmp && tmp.work_type) {
        setLayout((l) => ({ ...l, work_type: tmp.work_type }));
      }
      setCheck(tgsRes.check);
      setRuleCount(rules.data ? rules.data.length : (Array.isArray(rules) ? rules.length : 0));
    }).catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [tmpId, tmp]);

  useEffect(() => { load(); }, [load]);

  const setField = (path, value) => {
    setLayout((prev) => {
      const next = { ...prev };
      const parts = path.split('.');
      let cur = next;
      for (let i = 0; i < parts.length - 1; i += 1) cur = cur[parts[i]];
      cur[parts[parts.length - 1]] = value;
      return next;
    });
  };

  const toggleDay = (day) => {
    setLayout((prev) => {
      const days = prev.working_days.includes(day)
        ? prev.working_days.filter((d) => d !== day)
        : [...prev.working_days, day];
      return { ...prev, working_days: days };
    });
  };

  const toggleResolved = async (ruleId) => {
    const resolutions = { ...(check?.resolutions || {}) };
    resolutions[ruleId] = !resolutions[ruleId];
    await save(resolutions);
  };

  const save = async (extraResolutions) => {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    try {
      const payload = { work_type: layout.work_type, layout };
      if (extraResolutions) payload.resolutions = extraResolutions;
      const res = await api.compliance.saveTgs(tmpId, payload);
      setCheck(res.check);
    } catch (err) { setError(err.message); }
    setSaving(false);
  };

  const runCheck = async () => {
    setSaving(true);
    setError(null);
    try {
      setCheck(await api.compliance.check(tmpId));
    } catch (err) { setError(err.message); }
    setSaving(false);
  };

  const reseed = async () => {
    if (!isDev) return;
    try { await api.compliance.seedRules(); const rules = await api.compliance.rules(); setRuleCount(rules.data ? rules.data.length : rules.length); } catch (err) { setError(err.message); }
  };

  if (loading) return <div className="card p-4 text-sm text-gray-500">Loading TGS & compliance...</div>;

  const findings = (check?.findings || []).filter((f) => f.severity === 'violation' || f.severity === 'warning');
  const violations = findings.filter((f) => f.severity === 'violation' && !f.resolved);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Traffic Guidance Scheme & Compliance</h2>
          {check && (
            <span className={`badge ${verdictBadge(check.verdict)}`}>{check.verdict.toUpperCase()}</span>
          )}
          {check && <span className="text-xs text-gray-500">{Math.round(check.score)}/100 · {check.rules_checked} rules · {new Date(check.checked_at).toLocaleString()}</span>}
        </div>
        <div className="flex items-center gap-2">
          {isDev && <button onClick={reseed} className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">Reseed defaults</button>}
          <button onClick={runCheck} className="btn btn-secondary btn-sm" disabled={saving}>Run check</button>
          {canEdit && <button onClick={() => save()} className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Saving...' : 'Save TGS'}</button>}
        </div>
      </div>

      {error && <div className="mb-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">{error}</div>}

      {!check ? (
        <p className="text-sm text-gray-500 mb-3">No compliance check run yet. Complete the TGS profile and save, or run a check.</p>
      ) : violations.length > 0 ? (
        <p className="text-sm mb-3 text-red-700 dark:text-red-300 font-medium">{violations.length} unresolved violation(s) — submission is blocked until resolved.</p>
      ) : (
        <p className="text-sm mb-3 text-green-700 dark:text-green-300 font-medium">No unresolved violations — the plan can be submitted.</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Work type">
              <select className={inputCls} value={layout.work_type || 'general'} disabled={!canEdit} onChange={(e) => setField('work_type', e.target.value)}>
                {WORK_TYPES.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
              </select>
            </Field>
            <Field label="Road lanes">
              <input type="number" min="1" max="8" className={inputCls} value={layout.road_lanes || 2} disabled={!canEdit} onChange={(e) => setField('road_lanes', Number(e.target.value))} />
            </Field>
            <Field label="Start time">
              <input type="time" className={inputCls} value={layout.working_hours?.start || '07:00'} disabled={!canEdit} onChange={(e) => setField('working_hours.start', e.target.value)} />
            </Field>
            <Field label="End time">
              <input type="time" className={inputCls} value={layout.working_hours?.end || '17:00'} disabled={!canEdit} onChange={(e) => setField('working_hours.end', e.target.value)} />
            </Field>
          </div>

          <Field label="Working days">
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d) => (
                <button key={d.value} type="button" disabled={!canEdit}
                  onClick={() => toggleDay(d.value)}
                  className={`px-2 py-1 rounded-md text-xs border transition ${(layout.working_days || []).includes(d.value) ? 'bg-lux-600 text-white border-lux-600' : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600'}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </Field>

          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-3">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Footpath</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Min width (m)">
                <input type="number" step="0.1" min="0" className={inputCls} value={layout.footpath?.min_width_m ?? ''} disabled={!canEdit} onChange={(e) => setField('footpath.min_width_m', e.target.value === '' ? null : Number(e.target.value))} />
              </Field>
              <Field label="Min clear path (mm)">
                <input type="number" step="100" min="0" className={inputCls} value={layout.footpath?.min_clear_path_mm ?? ''} disabled={!canEdit} onChange={(e) => setField('footpath.min_clear_path_mm', e.target.value === '' ? null : Number(e.target.value))} />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300"><input type="checkbox" className={checkCls} checked={!!layout.footpath?.closed} disabled={!canEdit} onChange={(e) => setField('footpath.closed', e.target.checked)} /> Footpath closed</label>
              <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300"><input type="checkbox" className={checkCls} checked={!!layout.footpath?.signed_alternate} disabled={!canEdit} onChange={(e) => setField('footpath.signed_alternate', e.target.checked)} /> Signed alternate</label>
              <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300"><input type="checkbox" className={checkCls} checked={!!layout.footpath?.ramp_gradient_1in14} disabled={!canEdit} onChange={(e) => setField('footpath.ramp_gradient_1in14', e.target.checked)} /> Ramp ≤ 1:14</label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Bus stops affected">
              <input type="number" min="0" className={inputCls} value={layout.bus_stops ?? 0} disabled={!canEdit} onChange={(e) => setField('bus_stops', Number(e.target.value))} />
            </Field>
            <Field label="School-zone proximity (m)">
              <input type="number" min="0" className={inputCls} value={layout.school_zone_proximity_m ?? ''} disabled={!canEdit} onChange={(e) => setField('school_zone_proximity_m', e.target.value === '' ? null : Number(e.target.value))} />
            </Field>
            <Field label="Pedestrian zones">
              <input type="number" min="0" className={inputCls} value={layout.pedestrian_zones ?? 0} disabled={!canEdit} onChange={(e) => setField('pedestrian_zones', Number(e.target.value))} />
            </Field>
            <Field label="VMS deployed">
              <input type="number" min="0" className={inputCls} value={layout.vms ?? 0} disabled={!canEdit} onChange={(e) => setField('vms', Number(e.target.value))} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300"><input type="checkbox" className={checkCls} checked={!!layout.bus_stop_relocation_planned} disabled={!canEdit} onChange={(e) => setField('bus_stop_relocation_planned', e.target.checked)} /> Bus-stop relocation planned</label>
            <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300"><input type="checkbox" className={checkCls} checked={!!layout.clearway_nearby} disabled={!canEdit} onChange={(e) => setField('clearway_nearby', e.target.checked)} /> Clearway nearby</label>
            <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300"><input type="checkbox" className={checkCls} checked={!!layout.signalised_intersection_within_30m} disabled={!canEdit} onChange={(e) => setField('signalised_intersection_within_30m', e.target.checked)} /> Signalised intersection within 30 m</label>
            <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300"><input type="checkbox" className={checkCls} checked={!!layout.emergency_access_corridor} disabled={!canEdit} onChange={(e) => setField('emergency_access_corridor', e.target.checked)} /> Emergency access corridor</label>
            <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300"><input type="checkbox" className={checkCls} checked={!!layout.tactile_indicators} disabled={!canEdit} onChange={(e) => setField('tactile_indicators', e.target.checked)} /> Tactile indicators</label>
            <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300"><input type="checkbox" className={checkCls} checked={!!layout.loading_zone_reserved} disabled={!canEdit} onChange={(e) => setField('loading_zone_reserved', e.target.checked)} /> Loading zone reserved</label>
            <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300"><input type="checkbox" className={checkCls} checked={!!layout.resident_notice_planned} disabled={!canEdit} onChange={(e) => setField('resident_notice_planned', e.target.checked)} /> Resident notice planned</label>
            <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300"><input type="checkbox" className={checkCls} checked={!!layout.mrwa_referral_planned} disabled={!canEdit} onChange={(e) => setField('mrwa_referral_planned', e.target.checked)} /> MRWA referral planned</label>
            <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300"><input type="checkbox" className={checkCls} checked={!!layout.rail_authority_approved} disabled={!canEdit} onChange={(e) => setField('rail_authority_approved', e.target.checked)} /> Rail authority approved</label>
          </div>

          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Closures</p>
              {canEdit && <button onClick={() => setField('closures', [...(layout.closures || []), { label: 'Closed', from_m: 50, to_m: 100 }])} className="text-xs text-lux-600 dark:text-lux-400 hover:underline">+ Add closure</button>}
            </div>
            {(layout.closures || []).map((c, i) => (
              <div key={i} className="grid grid-cols-4 gap-2 text-xs">
                <input className={inputCls} value={c.label || ''} disabled={!canEdit} placeholder="Label" onChange={(e) => setField(`closures.${i}.label`, e.target.value)} />
                <input className={inputCls} type="number" value={c.from_m ?? ''} disabled={!canEdit} placeholder="From m" onChange={(e) => setField(`closures.${i}.from_m`, Number(e.target.value))} />
                <input className={inputCls} type="number" value={c.to_m ?? ''} disabled={!canEdit} placeholder="To m" onChange={(e) => setField(`closures.${i}.to_m`, Number(e.target.value))} />
                {canEdit && <button onClick={() => setField('closures', (layout.closures || []).filter((_, j) => j !== i))} className="text-red-500 hover:text-red-700 text-xs">Remove</button>}
              </div>
            ))}
          </div>

          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Detours</p>
              {canEdit && <button onClick={() => setField('detours', [...(layout.detours || []), { label: 'Detour' }])} className="text-xs text-lux-600 dark:text-lux-400 hover:underline">+ Add detour</button>}
            </div>
            {(layout.detours || []).map((d, i) => (
              <div key={i} className="grid grid-cols-3 gap-2 text-xs items-center">
                <input className={`${inputCls} col-span-2`} value={d.label || ''} disabled={!canEdit} placeholder="Detour description" onChange={(e) => setField(`detours.${i}.label`, e.target.value)} />
                {canEdit && <button onClick={() => setField('detours', (layout.detours || []).filter((_, j) => j !== i))} className="text-red-500 hover:text-red-700 text-xs">Remove</button>}
              </div>
            ))}
          </div>

          {canEdit && (
            <div>
              <button onClick={() => save()} className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Saving...' : 'Save TGS'}</button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Compliance findings ({findings.length})</h3>
            {check && <span className="text-xs text-gray-400">{ruleCount} active rules</span>}
          </div>
          {findings.length === 0 ? (
            <p className="text-sm text-gray-500 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4">No findings — the TGS is compliant with the bound council's rules.</p>
          ) : (
            <div className="space-y-2">
              {findings.map((f, i) => (
                <div key={i} className={`text-sm border rounded-lg p-3 ${f.severity === 'violation' ? 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10' : 'border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-900/10'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`badge ${f.severity === 'violation' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300'}`}>
                      {f.severity === 'violation' ? 'VIOLATION' : 'WARNING'}
                    </span>
                    <span className="text-xs text-gray-500">{f.category || 'General'}</span>
                  </div>
                  <p className="mt-1 font-medium text-gray-800 dark:text-gray-100">{f.name}</p>
                  <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5">{f.message}</p>
                  {f.guidance && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">{f.guidance}</p>}
                  {canEdit && f.severity === 'violation' && (
                    <button onClick={() => toggleResolved(f.rule_id)} className={`mt-2 text-xs font-medium ${f.resolved ? 'text-gray-500 hover:text-gray-700' : 'text-green-600 hover:text-green-800 dark:text-green-400'}`}>
                      {f.resolved ? 'Mark unresolved' : 'Mark resolved'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Site-plan diagram</p>
              <div className="flex items-center gap-2">
                <a href={api.export.sitePlan(tmpId)} download className="text-xs text-lux-600 dark:text-lux-400 hover:underline">Download SVG</a>
                <button onClick={() => setShowSitePlan(!showSitePlan)} className="text-xs text-lux-600 dark:text-lux-400 hover:underline">{showSitePlan ? 'Hide' : 'Preview'}</button>
              </div>
            </div>
            {showSitePlan && (
              <img src={api.export.sitePlan(tmpId)} alt="Site plan" className="mt-2 w-full border border-gray-200 dark:border-gray-700 rounded-lg bg-white" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}