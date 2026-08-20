import db from '../db.js';
import { emitEvent } from '../events.js';

// ---------------------------------------------------------------------------
// LGA compliance ruleset engine (Phase 1). Deterministic rule evaluation against
// a context built from the TMP, its site, the bound authority and the TGS.
// ---------------------------------------------------------------------------

export function get(path, obj) {
  const parts = String(path).split('.');
  let v = obj;
  for (const p of parts) {
    if (v == null) return undefined;
    v = v[p];
  }
  return v;
}

function isEmpty(v) {
  return v == null || v === '' || v === false || v === 0 || (Array.isArray(v) && v.length === 0);
}

export function evalCondition(cond, ctx) {
  if (!cond || typeof cond !== 'object') return false;
  if (cond.and) return cond.and.every((c) => evalCondition(c, ctx));
  if (cond.or) return cond.or.some((c) => evalCondition(c, ctx));
  if (cond.not) return !evalCondition(cond.not, ctx);
  const v = get(cond.field, ctx);
  switch (cond.op) {
    case 'eq': return v == cond.value;
    case 'neq': return v != cond.value;
    case 'gt': return v != null && Number(v) > cond.value;
    case 'gte': return v != null && Number(v) >= cond.value;
    case 'lt': return v != null && Number(v) < cond.value;
    case 'lte': return v != null && Number(v) <= cond.value;
    case 'in': return Array.isArray(cond.value) && cond.value.includes(v);
    case 'not_in': return Array.isArray(cond.value) && !cond.value.includes(v);
    case 'includes': return Array.isArray(v) && v.includes(cond.value);
    case 'not_empty': return !isEmpty(v);
    case 'empty': return isEmpty(v);
    case 'matches': return typeof v === 'string' && new RegExp(cond.value, 'i').test(v);
    default: return false;
  }
}

function interpolate(template, ctx) {
  return String(template || '').replace(/\{([^}]+)\}/g, (m, path) => {
    const v = get(path, ctx);
    if (v == null || v === '') return m;
    if (Array.isArray(v)) return v.join(', ');
    return String(v);
  });
}

function parseTime(t) {
  if (!t || typeof t !== 'string') return null;
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) + Number(m[2]) / 60;
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function dayIndexes(days) {
  const map = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  return (days || []).map((d) => map[String(d).toLowerCase().slice(0, 3)]).filter((n) => n !== undefined);
}

function durationDays(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const ms = new Date(endDate) - new Date(startDate);
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.round(ms / 86400000));
}

// Build the evaluation context for a TMP.
export function buildContext({ tmp, site, authority, tgsLayout }) {
  const layout = tgsLayout || {};
  const working = layout.working_hours || {};
  const startH = parseTime(working.start);
  const endH = parseTime(working.end);
  const workType = layout.work_type || tmp.work_type || 'general';
  const days = dayIndexes(layout.working_days);
  const schoolZone = !!site?.school_zone;
  const clearwayNearby = !!layout.clearway_nearby;
  const footpath = layout.footpath || {};

  const ctx = {
    work_type: workType,
    site: {
      name: site?.name || null,
      road_class: site?.road_class || null,
      speed_limit: site?.speed_limit ?? null,
      aadt: site?.aadt ?? null,
      pedestrian_activity: site?.pedestrian_activity || null,
      cyclist_activity: site?.cyclist_activity || null,
      rail_corridor: !!site?.rail_corridor,
      school_zone: schoolZone,
      jurisdiction: site?.jurisdiction || 'lga',
      suburb: site?.suburb || null
    },
    tmp: {
      plan_type: tmp.plan_type || 'temporary',
      complexity: tmp.complexity || 'standard',
      status: tmp.status || 'draft',
      risk_band: tmp.risk_band || null,
      risk_score: tmp.risk_score ?? null
    },
    authority: {
      name: authority?.name || null,
      band: authority?.band ?? null,
      requires_public_notice: !!authority?.requires_public_notice
    },
    tgs: {
      bus_stops: layout.bus_stops ?? 0,
      bus_stop_relocation_planned: !!layout.bus_stop_relocation_planned,
      school_zone_proximity_m: layout.school_zone_proximity_m ?? null,
      clearway_nearby: clearwayNearby,
      signalised_intersection_within_30m: !!layout.signalised_intersection_within_30m,
      pedestrian_zones: layout.pedestrian_zones ?? 0,
      vms: layout.vms ?? 0,
      emergency_access_corridor: !!layout.emergency_access_corridor,
      tactile_indicators: !!layout.tactile_indicators,
      loading_zone_reserved: !!layout.loading_zone_reserved,
      resident_notice_planned: !!layout.resident_notice_planned,
      mrwa_referral_planned: !!layout.mrwa_referral_planned,
      rail_authority_approved: !!layout.rail_authority_approved,
      footpath: {
        min_width_m: footpath.min_width_m ?? null,
        closed: !!footpath.closed,
        min_clear_path_mm: footpath.min_clear_path_mm ?? null,
        signed_alternate: !!footpath.signed_alternate,
        ramp_gradient_1in14: !!footpath.ramp_gradient_1in14
      }
    },
    calc: {
      school_zone_peak_overlap: schoolZone && startH != null && endH != null && (overlaps(startH, endH, 7.5, 9.5) || overlaps(startH, endH, 14.5, 16)),
      clearway_peak_overlap: clearwayNearby && startH != null && endH != null && (overlaps(startH, endH, 7, 9) || overlaps(startH, endH, 16, 18)),
      weekend_working: days.includes(0) || days.includes(6),
      working_before_7am: startH != null && startH < 7,
      duration_days: durationDays(tmp.start_date, tmp.end_date),
      footpath_closed: !!footpath.closed
    }
  };
  return ctx;
}

// ---------------------------------------------------------------------------
// Base WA rule catalog. Rules with authority_id NULL apply to every council.
// Work-type rules only fire for that work type. Ids are stable so a seeded
// catalog never duplicates, and locally tuned rules are never overwritten.
// ---------------------------------------------------------------------------

export const BASE_RULES = [
  {
    id: 'tgs_completed',
    category: 'TGS',
    name: 'Traffic Guidance Scheme completed',
    description: 'The TGS profile must be completed before the plan is submitted for assessment.',
    condition: { not: { field: 'work_type', op: 'in', value: ['maintenance', 'event', 'footpath_utility', 'skip_bin_hoarding', 'general'] } },
    message: 'The Traffic Guidance Scheme has not been completed. Complete the TGS profile before submission.',
    guidance: 'Open the TGS & Compliance panel and complete the worksite profile, working hours and control measures.',
    severity: 'warning'
  },
  {
    id: 'school_zone_peak_hours',
    category: 'School zone',
    name: 'No works in school zones during peak hours',
    description: 'Works within a school zone (or within 150 m) must not operate between 07:30-09:30 and 14:30-16:00 on school days.',
    condition: { and: [{ field: 'calc.school_zone_peak_overlap', op: 'eq', value: true }, { not: { field: 'tgs.school_zone_proximity_m', op: 'gt', value: 150 } }] },
    message: 'Works overlap school-zone peak hours (07:30-09:30 / 14:30-16:00).',
    guidance: 'Schedule works outside school-zone peak hours or confirm the site is outside the school zone.',
    severity: 'violation'
  },
  {
    id: 'school_zone_nearby_check',
    category: 'School zone',
    name: 'Confirm school-zone proximity',
    description: 'When the site is within 150 m of a school, confirm the measured distance on the TGS.',
    condition: { and: [{ field: 'site.school_zone', op: 'eq', value: true }, { field: 'tgs.school_zone_proximity_m', op: 'empty' }] },
    message: 'Site is flagged as a school zone but no school-zone proximity distance has been recorded on the TGS.',
    guidance: 'Measure and record the distance to the nearest school zone boundary.',
    severity: 'warning'
  },
  {
    id: 'clearway_arterial',
    category: 'Clearway',
    name: 'No clearway lane occupation during clearway hours',
    description: 'Arterial, highway and freeway clearways must not be occupied during peak clearway windows.',
    condition: { and: [{ field: 'site.road_class', op: 'in', value: ['arterial', 'highway', 'freeway'] }, { field: 'calc.clearway_peak_overlap', op: 'eq', value: true }] },
    message: 'Works occupy a clearway on {site.road_class} road during clearway hours (07:00-09:00 / 16:00-18:00).',
    guidance: 'Move works outside clearway hours, or apply for a clearway occupancy approval.',
    severity: 'violation'
  },
  {
    id: 'footpath_min_width',
    category: 'Footpath',
    name: 'Minimum footpath width 1.5 m (DDA)',
    description: 'Closed or reduced footpaths must retain a minimum 1.5 m clear width for wheelchairs.',
    condition: { and: [{ field: 'tgs.footpath.min_width_m', op: 'not_empty' }, { field: 'tgs.footpath.min_width_m', op: 'lt', value: 1.5 }] },
    message: 'Footpath width of {tgs.footpath.min_width_m} m is below the 1.5 m DDA minimum.',
    guidance: 'Provide at least 1.5 m clear footpath width; adjust the workzone layout.',
    severity: 'violation'
  },
  {
    id: 'footpath_closure_alternate',
    category: 'Footpath',
    name: 'Signed alternate route when footpath closed',
    description: 'High-activity footpaths that are closed must provide a signed alternate route.',
    condition: { and: [{ field: 'calc.footpath_closed', op: 'eq', value: true }, { field: 'site.pedestrian_activity', op: 'eq', value: 'high' }, { not: { field: 'tgs.footpath.signed_alternate', op: 'eq', value: true } }] },
    message: 'Footpath is closed in a high pedestrian-activity area without a signed alternate route.',
    guidance: 'Install signing directing pedestrians to the alternate route.',
    severity: 'violation'
  },
  {
    id: 'clear_path_1200',
    category: 'Footpath',
    name: 'Minimum 1.2 m clear path through the workzone',
    description: 'Where a footpath is closed, a 1.2 m minimum clear path must be maintained.',
    condition: { and: [{ field: 'calc.footpath_closed', op: 'eq', value: true }, { field: 'tgs.footpath.min_clear_path_mm', op: 'not_empty' }, { field: 'tgs.footpath.min_clear_path_mm', op: 'lt', value: 1200 }] },
    message: 'Clear path of {tgs.footpath.min_clear_path_mm} mm is below the 1200 mm minimum.',
    guidance: 'Maintain at least 1200 mm clear path through the workzone.',
    severity: 'violation'
  },
  {
    id: 'ramp_gradient',
    category: 'Footpath',
    name: 'Temporary ramp gradient 1:14',
    description: 'Temporary ramps across footpath closures must not exceed a 1:14 gradient.',
    condition: { and: [{ field: 'calc.footpath_closed', op: 'eq', value: true }, { not: { field: 'tgs.footpath.ramp_gradient_1in14', op: 'eq', value: true } }] },
    message: 'Footpath closure has no compliant (1:14 max) temporary ramp.',
    guidance: 'Provide a temporary ramp with a maximum 1:14 gradient for wheelchair users.',
    severity: 'warning'
  },
  {
    id: 'bus_stop_relocation',
    category: 'Public transport',
    name: 'Bus-stop relocation or access plan',
    description: 'When works affect bus stops, a relocation or access plan is required.',
    condition: { and: [{ field: 'tgs.bus_stops', op: 'gt', value: 0 }, { not: { field: 'tgs.bus_stop_relocation_planned', op: 'eq', value: true } }] },
    message: 'Works affect {tgs.bus_stops} bus stop(s) but no relocation or access plan is recorded.',
    guidance: 'Plan bus-stop relocation or passenger access and record it on the TGS.',
    severity: 'violation'
  },
  {
    id: 'residential_hours_curfew',
    category: 'Community',
    name: 'Residential hours curfew',
    description: 'Works in residential areas should not start before 07:00.',
    condition: { field: 'calc.working_before_7am', op: 'eq', value: true },
    message: 'Works start before 07:00 which may breach residential curfews.',
    guidance: 'Adjust working hours to after 07:00, or confirm approval with the council.',
    severity: 'warning'
  },
  {
    id: 'weekend_residential',
    category: 'Community',
    name: 'Weekend works in residential areas',
    description: 'Weekend works in medium/high-activity areas require prior council approval.',
    condition: { and: [{ field: 'calc.weekend_working', op: 'eq', value: true }, { field: 'site.pedestrian_activity', op: 'in', value: ['medium', 'high'] }] },
    message: 'Works are scheduled on weekends in a medium/high-activity area.',
    guidance: 'Confirm weekend work approval with the council before submission.',
    severity: 'warning'
  },
  {
    id: 'public_notice_required',
    category: 'Community',
    name: 'Public notice for complex works',
    description: 'Councils that require public notice for complex works must have resident notification planned.',
    condition: { and: [{ field: 'authority.requires_public_notice', op: 'eq', value: true }, { field: 'tmp.complexity', op: 'in', value: ['complex', 'complex_with_notice'] }, { not: { field: 'tgs.resident_notice_planned', op: 'eq', value: true } }] },
    message: 'Public notice is required by {authority.name} for this complexity, but no resident notification is planned.',
    guidance: 'Schedule the resident/stakeholder notification before submission.',
    severity: 'violation'
  },
  {
    id: 'mrwa_referral_state_road',
    category: 'Referral',
    name: 'MRWA referral for state-managed roads',
    description: 'Works on arterial, highway and freeway roads must be referred to Main Roads WA.',
    condition: { and: [{ field: 'site.road_class', op: 'in', value: ['arterial', 'highway', 'freeway'] }, { not: { field: 'tgs.mrwa_referral_planned', op: 'eq', value: true } }] },
    message: 'Works are on a {site.road_class} road - referral to Main Roads WA is required.',
    guidance: 'Record the MRWA referral on the TGS before submission.',
    severity: 'violation'
  },
  {
    id: 'signals_30m_mrwa',
    category: 'Referral',
    name: 'MRWA referral within 30 m of signals',
    description: 'Works within 30 m of signalised intersections must be referred to Main Roads WA.',
    condition: { and: [{ field: 'tgs.signalised_intersection_within_30m', op: 'eq', value: true }, { not: { field: 'tgs.mrwa_referral_planned', op: 'eq', value: true } }] },
    message: 'Works are within 30 m of a signalised intersection - referral to Main Roads WA is required.',
    guidance: 'Record the MRWA referral on the TGS before submission.',
    severity: 'violation'
  },
  {
    id: 'rail_corridor_approval',
    category: 'Referral',
    name: 'Rail-corridor approval',
    description: 'Works adjacent to a rail corridor require authority approval from the rail operator.',
    condition: { and: [{ field: 'site.rail_corridor', op: 'eq', value: true }, { not: { field: 'tgs.rail_authority_approved', op: 'eq', value: true } }] },
    message: 'Works are adjacent to a rail corridor but no rail-authority approval is recorded.',
    guidance: 'Obtain and record rail-authority approval before submission.',
    severity: 'violation'
  },
  {
    id: 'event_emergency_corridor',
    category: 'Event',
    work_type: 'event',
    name: 'Emergency access corridor',
    description: 'Event works must maintain an emergency vehicle access corridor.',
    condition: { not: { field: 'tgs.emergency_access_corridor', op: 'eq', value: true } },
    message: 'No emergency access corridor is recorded for these event works.',
    guidance: 'Identify and record the emergency access corridor on the TGS.',
    severity: 'warning'
  },
  {
    id: 'event_vms',
    category: 'Event',
    work_type: 'event',
    name: 'Variable message signs for events',
    description: 'Event works should deploy variable message signs to warn road users.',
    condition: { field: 'tgs.vms', op: 'empty' },
    message: 'No variable message signs (VMS) are planned for these event works.',
    guidance: 'Add VMS deployment to the TGS.',
    severity: 'warning'
  },
  {
    id: 'footpath_tactile',
    category: 'Footpath',
    work_type: 'footpath_utility',
    name: 'Tactile indicators where footpath works',
    description: 'Footpath utility works must reinstate tactile indicators at crossings.',
    condition: { not: { field: 'tgs.tactile_indicators', op: 'eq', value: true } },
    message: 'Tactile indicators are not planned for these footpath utility works.',
    guidance: 'Plan reinstatement of tactile indicators at crossings.',
    severity: 'warning'
  },
  {
    id: 'skip_bin_loading_zone',
    category: 'Skip bin',
    work_type: 'skip_bin_hoarding',
    name: 'Loading-zone reservation for skip bins',
    description: 'Skip-bin and hoarding works must reserve a loading zone or obtain a parking exemption.',
    condition: { not: { field: 'tgs.loading_zone_reserved', op: 'eq', value: true } },
    message: 'No loading zone is reserved for these skip-bin/hoarding works.',
    guidance: 'Reserve a loading zone or apply for a parking exemption.',
    severity: 'warning'
  },
  {
    id: 'maintenance_duration',
    category: 'Maintenance',
    work_type: 'maintenance',
    name: 'Maintenance works should be short duration',
    description: 'Maintenance works longer than 3 days may need reclassification.',
    condition: { and: [{ field: 'calc.duration_days', op: 'not_empty' }, { field: 'calc.duration_days', op: 'gt', value: 3 }] },
    message: 'Maintenance works run for {calc.duration_days} days - longer than the 3-day maintenance window.',
    guidance: 'Reclassify as a construction TMP or obtain an extended-duration approval.',
    severity: 'warning'
  }
];

// Insert the base catalog. INSERT OR IGNORE on the stable id preserves any
// council-specific edits made through the API.
export function seedComplianceRules() {
  const stmt = db.prepare(`INSERT OR IGNORE INTO compliance_rules
    (id, authority_id, state, work_type, category, name, description, condition, message, guidance, severity, is_active, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`);
  BASE_RULES.forEach((r, i) => {
    stmt.run(r.id, r.authority_id || null, r.state || 'WA', r.work_type || null, r.category || 'General', r.name, r.description || '', JSON.stringify(r.condition), r.message, r.guidance || null, r.severity || 'violation', r.sort_order ?? i);
  });
  return BASE_RULES.length;
}

export function loadRules({ authorityId = null, workType = null } = {}) {
  const rows = db.prepare('SELECT * FROM compliance_rules WHERE is_active = 1 ORDER BY sort_order, name').all();
  return rows.filter((r) => {
    if (r.authority_id && r.authority_id !== authorityId) return false;
    if (r.work_type && r.work_type !== workType) return false;
    return true;
  });
}

function buildFindings(rules, ctx) {
  return rules
    .map((r) => {
      let condition;
      try { condition = JSON.parse(r.condition); } catch { return null; }
      if (!evalCondition(condition, ctx)) return null;
      return {
        rule_id: r.id,
        severity: r.severity,
        category: r.category || 'General',
        name: r.name,
        message: interpolate(r.message, ctx),
        guidance: r.guidance || null
      };
    })
    .filter(Boolean);
}

function gradeFindings(findings) {
  const violations = findings.filter((f) => f.severity === 'violation').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  if (violations > 0) return { verdict: 'fail', score: Math.max(0, 100 - violations * 15) };
  if (warnings > 0) return { verdict: 'warn', score: Math.max(0, 100 - warnings * 5) };
  return { verdict: 'ok', score: 100 };
}

// Re-run the compliance check for a TMP and persist the summary onto its TGS.
export function runComplianceCheck(tmpId, { persist = true } = {}) {
  const tmp = db.prepare('SELECT * FROM traffic_management_plans WHERE id = ?').get(tmpId);
  if (!tmp) return null;
  const site = tmp.site_id ? db.prepare('SELECT * FROM sites WHERE id = ?').get(tmp.site_id) : null;
  const authority = tmp.authority_id
    ? db.prepare('SELECT * FROM authorities WHERE id = ?').get(tmp.authority_id)
    : null;
  const slaRule = tmp.authority_id
    ? db.prepare('SELECT * FROM sla_rules WHERE authority_id = ? AND complexity = ?').get(tmp.authority_id, tmp.complexity || 'standard')
    : null;
  const tgsRow = db.prepare('SELECT * FROM tgs WHERE tmp_id = ?').get(tmpId);
  const layout = tgsRow ? safeParseJson(tgsRow.layout_json, {}) : {};
  const workType = layout.work_type || tmp.work_type || 'general';

  const ctx = buildContext({
    tmp,
    site,
    authority: authority ? { ...authority, requires_public_notice: !!slaRule?.requires_public_notice } : { requires_public_notice: false },
    tgsLayout: layout
  });

  const rules = loadRules({ authorityId: tmp.authority_id || null, workType });
  const findings = buildFindings(rules, ctx).map((f) => {
    const prior = tgsRow ? safeParseJson(tgsRow.check_summary_json, {}) : {};
    const resolutions = prior.resolutions || {};
    return { ...f, resolved: !!resolutions[f.rule_id] };
  });
  const { verdict, score } = gradeFindings(findings);
  const summary = {
    verdict,
    score,
    findings,
    rules_checked: rules.length,
    checked_at: new Date().toISOString()
  };

  if (persist && tgsRow) {
    db.prepare('UPDATE tgs SET check_summary_json = ?, checked_at = ?, updated_at = datetime(\'now\') WHERE tmp_id = ?').run(
      JSON.stringify({ ...summary, resolutions: safeParseJson(tgsRow.check_summary_json, {}).resolutions || {} }),
      summary.checked_at,
      tmpId
    );
  }

  emitEvent('tmp.compliance_check', { id: tmpId, verdict, score, findings_count: findings.length });
  return summary;
}

function safeParseJson(str, fallback) {
  try { return str ? JSON.parse(str) : fallback; } catch { return fallback; }
}

// Unresolved violations - used by the submit gate.
export function unresolvedComplianceViolations(tmpId) {
  const tgsRow = db.prepare('SELECT check_summary_json FROM tgs WHERE tmp_id = ?').get(tmpId);
  if (!tgsRow || !tgsRow.check_summary_json) return [];
  const summary = safeParseJson(tgsRow.check_summary_json, {});
  return (summary.findings || [])
    .filter((f) => f.severity === 'violation' && !f.resolved)
    .map((f) => f.message);
}

export function latestComplianceSummary(tmpId) {
  const tgsRow = db.prepare('SELECT check_summary_json, checked_at FROM tgs WHERE tmp_id = ?').get(tmpId);
  if (!tgsRow || !tgsRow.check_summary_json) return null;
  const summary = safeParseJson(tgsRow.check_summary_json, {});
  return { ...summary, checked_at: summary.checked_at || tgsRow.checked_at };
}