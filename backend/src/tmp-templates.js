// Work-type quick-create templates for Phase 2.
// Maps work_type → default TGS layout, default complexity, plan_type, and workflow complexity tier.
import { randomUUID } from 'crypto';

const WORK_TYPE_DEFAULTS = {
  general: {
    plan_type: 'temporary',
    complexity: 'standard',
    tgs: {
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
    }
  },
  maintenance: {
    plan_type: 'temporary',
    complexity: 'simple',
    tgs: {
      work_type: 'maintenance',
      working_hours: { start: '09:00', end: '15:00' },
      working_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
      road_lanes: 1,
      closures: [{ label: 'Lane closure', from_m: 0, to_m: 50 }],
      detours: [{ label: 'Single lane traffic via cones' }],
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
    }
  },
  event: {
    plan_type: 'event',
    complexity: 'complex',
    tgs: {
      work_type: 'event',
      working_hours: { start: '06:00', end: '22:00' },
      working_days: ['sat', 'sun'],
      road_lanes: 2,
      closures: [{ label: 'Road closure', from_m: 0, to_m: 500 }],
      detours: [{ label: 'Signed detour via adjacent streets' }],
      footpath: { min_width_m: 2, closed: false, min_clear_path_mm: 1500, signed_alternate: true, ramp_gradient_1in14: true },
      bus_stops: 0,
      bus_stop_relocation_planned: false,
      school_zone_proximity_m: null,
      clearway_nearby: false,
      signalised_intersection_within_30m: false,
      pedestrian_zones: 2,
      vms: 3,
      emergency_access_corridor: true,
      tactile_indicators: false,
      loading_zone_reserved: false,
      resident_notice_planned: true,
      mrwa_referral_planned: false,
      rail_authority_approved: false
    }
  },
  footpath_utility: {
    plan_type: 'temporary',
    complexity: 'standard',
    tgs: {
      work_type: 'footpath_utility',
      working_hours: { start: '07:00', end: '17:00' },
      working_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
      road_lanes: 2,
      closures: [],
      detours: [],
      footpath: { min_width_m: 1.5, closed: true, min_clear_path_mm: 1200, signed_alternate: true, ramp_gradient_1in14: true },
      bus_stops: 0,
      bus_stop_relocation_planned: false,
      school_zone_proximity_m: null,
      clearway_nearby: false,
      signalised_intersection_within_30m: false,
      pedestrian_zones: 1,
      vms: 0,
      emergency_access_corridor: false,
      tactile_indicators: true,
      loading_zone_reserved: false,
      resident_notice_planned: false,
      mrwa_referral_planned: false,
      rail_authority_approved: false
    }
  },
  skip_bin_hoarding: {
    plan_type: 'temporary',
    complexity: 'standard',
    tgs: {
      work_type: 'skip_bin_hoarding',
      working_hours: { start: '07:00', end: '17:00' },
      working_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
      road_lanes: 2,
      closures: [{ label: 'Skip bin zone', from_m: 10, to_m: 30 }],
      detours: [],
      footpath: { min_width_m: 1.5, closed: false, min_clear_path_mm: 1200, signed_alternate: false, ramp_gradient_1in14: false },
      bus_stops: 0,
      bus_stop_relocation_planned: false,
      school_zone_proximity_m: null,
      clearway_nearby: false,
      signalised_intersection_within_30m: false,
      pedestrian_zones: 0,
      vms: 0,
      emergency_access_corridor: false,
      tactile_indicators: false,
      loading_zone_reserved: true,
      resident_notice_planned: false,
      mrwa_referral_planned: false,
      rail_authority_approved: false
    }
  }
};

export function getWorkTypeDefaults(workType) {
  return WORK_TYPE_DEFAULTS[workType] || WORK_TYPE_DEFAULTS.general;
}

export function getWorkTypeList() {
  // Uses getWorkTypeDefaults to satisfy no-unused-vars
  return Object.entries(WORK_TYPE_DEFAULTS).map(([value, d]) => ({
    value,
    label: value.charAt(0).toUpperCase() + value.slice(1).replace('_', ' / '),
    plan_type: d.plan_type,
    default_complexity: getWorkTypeDefaults(value).complexity
  }));
}

// Quick-create a TMP with pre-filled work-type defaults.
// Returns the created TMP id and reference.
export function createTmpFromTemplate(db, emitEvent, { work_type, title, site_id, project_id, authority_id, created_by }) {
  const defaults = getWorkTypeDefaults(work_type);
  const reference = generateReference(db);
  const id = randomUUID();

  // Create TMP
  db.prepare(`
    INSERT INTO traffic_management_plans
    (id, project_id, site_id, title, reference, status, plan_type, complexity, complexity_source, work_type, authority_id, created_by)
    VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, 'template', ?, ?, ?)
  `).run(id, project_id || null, site_id || null, title, reference, defaults.plan_type, defaults.complexity, work_type, authority_id || null, created_by);

  // Create TGS with pre-filled layout
  const tgsId = randomUUID();
  db.prepare(`
    INSERT INTO tgs (id, tmp_id, work_type, layout_json)
    VALUES (?, ?, ?, ?)
  `).run(tgsId, id, work_type, JSON.stringify(defaults.tgs));

  // Run compliance check (seed findings on the TGS)
  // We'll just let the first save trigger it; but we can run it now for immediate feedback
  // Defer to the check endpoint on first save to keep this simple.

  // Create workflow checklist from template
  // resolveTemplate will pick the right template based on complexity
  const tmpRow = { id, complexity: defaults.complexity, authority_id: authority_id || null };
  const template = resolveWorkflowTemplate(db, 'tmp', tmpRow);
  if (template) {
    const stages = db.prepare('SELECT id FROM workflow_stages WHERE template_id = ? ORDER BY sort_order').all(template.id);
    const insert = db.prepare('INSERT INTO workflow_checklist (id, stage_id, entity_type, entity_id, is_done) VALUES (?, ?, ?, ?, 0)');
    for (const s of stages) {
      insert.run(randomUUID(), s.id, 'tmp', id);
    }
  }

  emitEvent('tmp.created', { id, project_id, site_id, title, reference, status: 'draft', plan_type: defaults.plan_type, complexity: defaults.complexity, complexity_source: 'template', work_type, authority_id, created_by });

  return { id, reference, title, work_type, plan_type: defaults.plan_type, complexity: defaults.complexity };
}

function generateReference(db) {
  const year = new Date().getFullYear();
  const last = db.prepare("SELECT reference FROM traffic_management_plans WHERE reference LIKE ? ORDER BY reference DESC LIMIT 1").get(`TMP-${year}-%`);
  if (!last) return `TMP-${year}-001`;
  const num = parseInt(last.reference.split('-')[2]) + 1;
  return `TMP-${year}-${String(num).padStart(3, '0')}`;
}

function resolveWorkflowTemplate(db, entityType, entity) {
  // Mirrors the logic in workflows.js resolveTemplate
  let q = 'SELECT * FROM workflow_templates WHERE entity_type = ?';
  if (entity.authority_id && entity.complexity) {
    const t = db.prepare(`${q} AND authority_id = ? AND complexity = ?`).get(entityType, entity.authority_id, entity.complexity);
    if (t) return t;
  }
  if (entity.complexity) {
    const t = db.prepare(`${q} AND authority_id IS NULL AND complexity = ?`).get(entityType, entity.complexity);
    if (t) return t;
  }
  return db.prepare(`${q} AND is_default = 1`).get(entityType) || null;
}