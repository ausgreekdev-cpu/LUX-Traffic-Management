import db from './db.js';

export const ROAD_CLASS_WEIGHTS = {
  local: 1,
  distributor: 2,
  collector: 2,
  arterial: 3,
  highway: 4,
  freeway: 5
};

export const ACTIVITY_LEVELS = ['low', 'medium', 'high'];

export function suggestComplexity({ plan_type = 'temporary', start_date, end_date, site = null }) {
  if (plan_type === 'event') return 'complex';
  if (plan_type === 'permanent') return 'standard';
  let days = null;
  if (start_date && end_date) {
    days = Math.max(0, Math.round((new Date(end_date) - new Date(start_date)) / 86400000));
  }
  if (days !== null && days <= 3) return 'simple';

  const w = ROAD_CLASS_WEIGHTS[site?.road_class] || 1;
  const speed = site?.speed_limit || 0;
  const aadt = site?.aadt || 0;
  const rail = site?.rail_corridor ? 1 : 0;
  const school = site?.school_zone ? 1 : 0;
  const pedHigh = site?.pedestrian_activity === 'high';
  const cycHigh = site?.cyclist_activity === 'high';

  const factor = (w >= 3 ? 3 : w >= 2 ? 2 : 1) + (speed >= 80 ? 2 : speed >= 60 ? 1 : 0) + (aadt >= 15000 ? 2 : aadt >= 5000 ? 1 : 0) + rail + school + (pedHigh || cycHigh ? 1 : 0);
  if (days !== null && days >= 14) return 'complex';
  if (factor >= 5) return 'complex';
  if (factor >= 3) return 'standard';
  return 'simple';
}

export function computeConsequence(site) {
  if (!site) return 1;
  let c = 1;
  const w = ROAD_CLASS_WEIGHTS[site.road_class] || 1;
  c += (w >= 4 ? 2 : w >= 3 ? 1 : 0);
  if ((site.speed_limit || 0) >= 80) c += 1;
  if ((site.aadt || 0) >= 15000) c += 1;
  if (site.rail_corridor) c += 1;
  if (site.pedestrian_activity === 'high' || site.cyclist_activity === 'high') c += 1;
  return Math.min(5, c);
}

export function computeLikelihood({ plan_type = 'temporary', start_date, end_date, site = null }) {
  let l = 1;
  if (plan_type === 'event') l += 1;
  if (plan_type === 'permanent') l += 1;
  if (start_date && end_date) {
    const days = Math.max(0, Math.round((new Date(end_date) - new Date(start_date)) / 86400000));
    if (days >= 14) l += 2;
    else if (days >= 5) l += 1;
  } else {
    l += 1;
  }
  if (site?.rail_corridor) l += 1;
  if (site?.school_zone) l += 1;
  if (site?.pedestrian_activity === 'high' || site?.cyclist_activity === 'high') l += 1;
  return Math.min(5, l);
}

export function riskBand(score) {
  const get = (key, fallback) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? parseInt(row.value, 10) : fallback;
  };
  const high = get('risk_high_threshold', 10);
  const extreme = get('risk_extreme_threshold', 16);
  if (score >= extreme) return 'extreme';
  if (score >= high) return 'high';
  if (score >= 5) return 'medium';
  return 'low';
}

export const MITIGATIONS = {
  low: [],
  medium: ['Standard traffic control per AS 1742.3'],
  high: ['Site supervisor required', 'Traffic controller plan', 'CCTV / monitoring during works'],
  extreme: ['Site supervisor required', 'Traffic controller plan', 'CCTV / monitoring during works', 'Mandatory pre-start briefing', 'Senior engineer sign-off']
};

export function computeRisk({ plan_type, start_date, end_date, site = null }) {
  const consequence = computeConsequence(site);
  const likelihood = computeLikelihood({ plan_type, start_date, end_date, site });
  const score = consequence * likelihood;
  const band = riskBand(score);
  return { consequence, likelihood, score, band, mitigations: MITIGATIONS[band] };
}

export function applyRiskToTmp(tmpId, { plan_type, start_date, end_date, site_id }) {
  const site = site_id ? db.prepare('SELECT * FROM sites WHERE id = ?').get(site_id) : null;
  const risk = computeRisk({ plan_type, start_date, end_date, site });
  db.prepare('UPDATE traffic_management_plans SET risk_consequence = ?, risk_likelihood = ?, risk_score = ?, risk_band = ?, risk_mitigations = ? WHERE id = ?')
    .run(risk.consequence, risk.likelihood, risk.score, risk.band, JSON.stringify(risk.mitigations), tmpId);
  return risk;
}

export function riskPreviewQuery({ site_id, plan_type, start_date, end_date }) {
  const site = site_id ? db.prepare('SELECT * FROM sites WHERE id = ?').get(site_id) : null;
  const risk = computeRisk({ plan_type, start_date, end_date, site });
  return {
    complexity_suggestion: suggestComplexity({ plan_type, start_date, end_date, site }),
    risk
  };
}
