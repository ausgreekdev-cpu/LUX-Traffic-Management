import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '..', process.env.DB_PATH || './data/tmpcms.db');
const uploadDir = process.env.UPLOADS_DIR || path.resolve(__dirname, '..', 'uploads');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const now = new Date();
const d = (daysAgo) => {
  const t = new Date(now.getTime() - daysAgo * 86400000);
  return t.toISOString().slice(0, 10);
};
const dt = (daysAgo) => {
  const t = new Date(now.getTime() - daysAgo * 86400000);
  return t.toISOString().slice(0, 19).replace('T', ' ');
};

const upsert = (table, cols, values) => {
  db.prepare(`INSERT OR IGNORE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...values);
};

const byKey = (table, key, value) => db.prepare(`SELECT id FROM ${table} WHERE ${key} = ?`).get(value);

const ensureUser = (id, email, password, name, role) => {
  const existing = byKey('users', 'email', email);
  if (existing) return existing.id;
  upsert('users', ['id', 'email', 'password', 'name', 'role'], [id, email, bcrypt.hashSync(password, 12), name, role]);
  return id;
};

const ADMIN = ensureUser('demo-admin', 'admin@tmpcms.com', 'admin123', 'Admin User', 'admin');
const PLANNER = ensureUser('demo-planner', 'planner@tmpcms.com', 'planner123', 'Jane Planner', 'planner');
const PLANNER2 = ensureUser('demo-planner2', 'liam@tmpcms.com', 'planner123', 'Liam Drake', 'planner');
const PLANNER3 = ensureUser('demo-planner3', 'maya@tmpcms.com', 'planner123', 'Maya Chen', 'planner');
const VIEWER = ensureUser('demo-viewer', 'viewer@tmpcms.com', 'viewer123', 'View Only', 'viewer');

const ensureAuthority = (id, { name, short_name, type, email, phone }) => {
  const existing = byKey('authorities', 'short_name', short_name);
  if (existing) return existing.id;
  upsert('authorities', ['id', 'name', 'short_name', 'type', 'email', 'phone'], [id, name, short_name, type, email, phone]);
  return id;
};

const A_LGA = ensureAuthority('demo-auth-lga', { name: 'City of Perth', short_name: 'COP', type: 'lga', email: 'traffic@perth.wa.gov.au', phone: '08 9461 3333' });
const A_MRWA = ensureAuthority('demo-auth-mrwa', { name: 'Main Roads Western Australia', short_name: 'MRWA', type: 'mrwa', email: 'trafficmanagement@mainroads.wa.gov.au', phone: '138 138' });
const A_PTA = ensureAuthority('demo-auth-pta', { name: 'Public Transport Authority', short_name: 'PTA', type: 'pta', email: 'tmp@pta.wa.gov.au', phone: '13 62 13' });
const A_HVS = ensureAuthority('demo-auth-hvs', { name: 'Heavy Vehicle Safety Branch', short_name: 'HVS', type: 'hvs', email: 'hvs@transport.wa.gov.au', phone: '08 9326 8000' });
const A_STIRLING = ensureAuthority('demo-auth-stirling', { name: 'City of Stirling', short_name: 'COS', type: 'lga', email: 'traffic@stirling.wa.gov.au', phone: '08 9205 8555' });
const A_WANNEROO = ensureAuthority('demo-auth-wanneroo', { name: 'City of Wanneroo', short_name: 'COW', type: 'lga', email: 'traffic@wanneroo.wa.gov.au', phone: '08 9405 5000' });

const sla = (authorityId, complexity, assessment, notice = 0, buffer = 0) =>
  upsert('sla_rules', ['id', 'authority_id', 'complexity', 'assessment_days', 'public_notice_days', 'buffer_days', 'requires_public_notice'],
    [`demo-sla-${authorityId}-${complexity}`, authorityId, complexity, assessment, notice, buffer, notice > 0 ? 1 : 0]);
[A_LGA, A_MRWA, A_PTA, A_HVS, A_STIRLING, A_WANNEROO].forEach((a) => {
  sla(a, 'simple', 7);
  sla(a, 'standard', 14, 0, 3);
  sla(a, 'complex', 20, 15, 5);
});

const clients = [
  ['demo-client-1', 'John Builder', 'BuilderCorp', 'john@buildercorp.com', '0400 111 222', '12 Stirling St, Perth WA 6000', '12 345 678 901'],
  ['demo-client-2', 'Sarah Roadworks', 'City Roads Pty Ltd', 'sarah@cityroads.com', '0400 333 444', '88 Hay St, Subiaco WA 6008', '98 765 432 109'],
  ['demo-client-3', 'Mike Developments', 'Perth Properties', 'mike@perthprops.com', '0400 555 666', '45 Murray St, Perth WA 6000', '55 432 109 876'],
  ['demo-client-4', 'Ashley Civil', 'West Coast Infrastructure', 'ashley@wci.com.au', '0412 345 678', '200 Albany Hwy, Victoria Park WA 6100', '30 111 222 333'],
  ['demo-client-5', 'Tom Utility Works', 'Swan Water Corp', 'tom@swanwater.com.au', '0401 222 333', '7 Hale Rd, Forrestfield WA 6058', '64 555 666 777']
];
clients.forEach(c => upsert('clients', ['id', 'name', 'company', 'email', 'phone', 'address', 'abn'], c));

const sites = [
  ['demo-site-1', 'Main St Intersection', 'Main Street', 'Perth CBD', 'WA', 6000, -31.9522, 115.8589],
  ['demo-site-2', 'Highway Overpass', 'Kwinana Freeway', 'Maddington', 'WA', 6109, -32.0192, 115.9871],
  ['demo-site-3', 'Rail Bridge Works', 'Tonkin Highway', 'Midland', 'WA', 6056, -31.8883, 116.0042],
  ['demo-site-4', 'Coastal Rd Roundabout', 'West Coast Highway', 'Scarborough', 'WA', 6019, -31.8965, 115.7588],
  ['demo-site-5', 'School Crossing Zone', 'Nicholson Rd', 'Canning Vale', 'WA', 6155, -32.0756, 115.9005]
];
sites.forEach(s => upsert('sites', ['id', 'name', 'road_name', 'suburb', 'state', 'postcode', 'latitude', 'longitude'], s));

const projects = [
  ['demo-project-1', 'Main St Upgrade', 'Traffic light installation and lane widening', 'demo-client-1', 'active', d(150), d(30)],
  ['demo-project-2', 'Kwinana Freeway Smart Workzone', 'Variable speed signs and lane closure management', 'demo-client-2', 'active', d(120), d(-60)],
  ['demo-project-3', 'Tonkin Hwy Rail Bridge', 'Bridge strengthening and rail corridor access', 'demo-client-3', 'on_hold', d(100), d(20)],
  ['demo-project-4', 'Coastal Rd Safety Works', 'Roundabout upgrade and pedestrian crossings', 'demo-client-4', 'active', d(80), d(-40)],
  ['demo-project-5', 'Swan Water Pipe Renewal', 'Night-time pipe replacement along Nicholson Rd', 'demo-client-5', 'completed', d(200), d(90)]
];
projects.forEach(p => upsert('tmp_projects', ['id', 'name', 'description', 'client_id', 'status', 'start_date', 'end_date'], p));

const tmps = [
  ['demo-tmp-1', 'demo-project-1', 'demo-site-1', 'Main St Stage 1 Lane Closure', 'TMP-2026-001', 'approved', 'temporary', 'Lane closure for kerb works', d(60), d(10), ADMIN, dt(60)],
  ['demo-tmp-2', 'demo-project-1', 'demo-site-1', 'Main St Night Works', 'TMP-2026-002', 'submitted', 'temporary', 'Night works for signal installation', d(30), d(5), PLANNER, dt(30)],
  ['demo-tmp-3', 'demo-project-1', 'demo-site-1', 'Main St Permanent Signage', 'TMP-2026-003', 'draft', 'permanent', 'New permanent signage installation', d(15), d(45), PLANNER2, dt(15)],
  ['demo-tmp-4', 'demo-project-2', 'demo-site-2', 'Freeway Lane Closure Stage 1', 'TMP-2026-004', 'approved', 'temporary', 'Lane closure for smart workzone install', d(55), d(-5), PLANNER, dt(55)],
  ['demo-tmp-5', 'demo-project-2', 'demo-site-2', 'Freeway Smart Sign Install', 'TMP-2026-005', 'submitted', 'temporary', 'Variable speed sign installation', d(12), d(20), PLANNER2, dt(12)],
  ['demo-tmp-6', 'demo-project-3', 'demo-site-3', 'Rail Bridge Crane Works', 'TMP-2026-006', 'rejected', 'temporary', 'Crane lift for bridge strengthening', d(45), d(25), PLANNER3, dt(45)],
  ['demo-tmp-7', 'demo-project-3', 'demo-site-3', 'Rail Corridor Access Plan', 'TMP-2026-007', 'draft', 'event', 'Access for rail corridor inspection', d(10), d(60), PLANNER3, dt(10)],
  ['demo-tmp-8', 'demo-project-4', 'demo-site-4', 'Roundabout Night Closure', 'TMP-2026-008', 'approved', 'temporary', 'Night closure for roundabout works', d(35), d(-10), PLANNER, dt(35)],
  ['demo-tmp-9', 'demo-project-4', 'demo-site-4', 'Coastal Rd Pedestrian Crossing', 'TMP-2026-009', 'completed', 'permanent', 'New pedestrian crossing installation', d(120), d(70), PLANNER2, dt(120)],
  ['demo-tmp-10', 'demo-project-5', 'demo-site-5', 'Pipe Replacement Stage 1', 'TMP-2026-010', 'completed', 'temporary', 'Night pipe replacement works', d(150), d(95), ADMIN, dt(150)],
  ['demo-tmp-11', 'demo-project-5', 'demo-site-5', 'School Zone Traffic Control', 'TMP-2026-011', 'cancelled', 'event', 'Traffic control for school event', d(20), d(5), PLANNER, dt(20)],
  ['demo-tmp-12', 'demo-project-2', 'demo-site-2', 'Freeway Shoulder Works', 'TMP-2026-012', 'approved', 'temporary', 'Shoulder repair works', d(8), d(20), PLANNER3, dt(8)]
];
const tmpIds = {};
const insertTmp = (id, row) => {
  const existing = byKey('traffic_management_plans', 'reference', row[4]);
  if (existing) {
    db.prepare(`UPDATE traffic_management_plans SET project_id=?, site_id=?, title=?, status=?, plan_type=?, description=?, start_date=?, end_date=?, created_by=?, created_at=? WHERE id=?`)
      .run(row[1], row[2], row[3], row[5], row[6], row[7], row[8], row[9], row[10], row[11], existing.id);
    tmpIds[id] = existing.id;
    return;
  }
  upsert('traffic_management_plans', ['id', 'project_id', 'site_id', 'title', 'reference', 'status', 'plan_type', 'description', 'start_date', 'end_date', 'created_by', 'created_at'], row);
  tmpIds[id] = id;
};
tmps.forEach(t => insertTmp(t[0], t));

const resolve = (row) => row.map(v => (typeof v === 'string' && tmpIds[v]) ? tmpIds[v] : v);

const activities = [
  ['demo-act-1', 'demo-tmp-1', ADMIN, 'created', 'Plan created and submitted for review', dt(60)],
  ['demo-act-2', 'demo-tmp-1', ADMIN, 'submitted', 'Submitted to City of Perth', dt(58)],
  ['demo-act-3', 'demo-tmp-1', ADMIN, 'approved', 'Approved by City of Perth', dt(50)],
  ['demo-act-4', 'demo-tmp-2', PLANNER, 'created', 'Plan created from template', dt(30)],
  ['demo-act-5', 'demo-tmp-2', PLANNER, 'submitted', 'Submitted to MRWA for referral', dt(28)],
  ['demo-act-6', 'demo-tmp-4', PLANNER, 'approved', 'Approved by Main Roads', dt(40)],
  ['demo-act-7', 'demo-tmp-6', PLANNER3, 'rejected', 'Rejected - incomplete signalised intersection assessment', dt(42)],
  ['demo-act-8', 'demo-tmp-8', PLANNER, 'approved', 'Approved with conditions', dt(30)],
  ['demo-act-9', 'demo-tmp-9', PLANNER2, 'completed', 'Works completed and site reopened', dt(70)],
  ['demo-act-10', 'demo-tmp-10', ADMIN, 'completed', 'Pipe replacement finished ahead of schedule', dt(95)]
];
activities.forEach(a => upsert('plan_activities', ['id', 'tmp_id', 'user_id', 'action', 'description', 'created_at'], resolve(a)));

const permits = [
  ['demo-permit-1', 'demo-tmp-1', A_LGA, 'approved', 'standard', d(58), d(48), d(10), null, 0, 0, ADMIN, dt(58)],
  ['demo-permit-2', 'demo-tmp-1', A_MRWA, 'under_review', 'complex', d(50), null, null, null, 1, 1, ADMIN, dt(50)],
  ['demo-permit-3', 'demo-tmp-2', A_LGA, 'submitted', 'simple', d(28), null, null, null, 0, 0, PLANNER, dt(28)],
  ['demo-permit-4', 'demo-tmp-2', A_PTA, 'under_review', 'standard', d(25), null, null, null, 0, 0, PLANNER, dt(25)],
  ['demo-permit-5', 'demo-tmp-4', A_MRWA, 'approved', 'complex', d(48), d(35), d(-5), null, 1, 1, PLANNER, dt(48)],
  ['demo-permit-6', 'demo-tmp-5', A_MRWA, 'submitted', 'standard', d(12), null, null, null, 1, 1, PLANNER2, dt(12)],
  ['demo-permit-7', 'demo-tmp-6', A_MRWA, 'rejected', 'complex', d(44), null, null, 'No rail corridor clearance confirmation attached', 0, 1, PLANNER3, dt(44)],
  ['demo-permit-8', 'demo-tmp-6', A_PTA, 'rejected', 'complex', d(43), null, null, 'Works clash with scheduled rail maintenance window', 0, 1, PLANNER3, dt(43)],
  ['demo-permit-9', 'demo-tmp-8', A_STIRLING, 'approved', 'standard', d(33), d(24), d(20), null, 0, 0, PLANNER, dt(33)],
  ['demo-permit-10', 'demo-tmp-9', A_STIRLING, 'completed', 'standard', d(115), d(100), d(70), null, 0, 0, PLANNER2, dt(115)],
  ['demo-permit-11', 'demo-tmp-10', A_WANNEROO, 'approved', 'standard', d(145), d(138), d(95), null, 0, 0, ADMIN, dt(145)],
  ['demo-permit-12', 'demo-tmp-10', A_MRWA, 'expired', 'complex', d(140), d(130), d(96), null, 1, 1, ADMIN, dt(140)],
  ['demo-permit-13', 'demo-tmp-11', A_WANNEROO, 'cancelled', 'simple', d(20), null, null, null, 0, 0, PLANNER, dt(20)],
  ['demo-permit-14', 'demo-tmp-12', A_MRWA, 'under_review', 'standard', d(8), null, null, null, 0, 1, PLANNER3, dt(8)],
  ['demo-permit-15', 'demo-tmp-3', A_LGA, 'draft', 'simple', null, null, null, null, 0, 0, PLANNER2, dt(15)]
];
permits.forEach(p => upsert('permits', ['id', 'tmp_id', 'authority_id', 'status', 'complexity', 'submission_date', 'approval_date', 'expiry_date', 'rejection_reason', 'is_within_30m_signals', 'requires_mrwa', 'created_by', 'created_at'], resolve(p)));

const subTasks = [
  ['demo-st-1', 'demo-permit-2', 'demo-tmp-1', A_MRWA, 'pending', 'MRWA traffic signal control review', dt(50)],
  ['demo-st-2', 'demo-permit-2', 'demo-tmp-1', A_LGA, 'pending', 'City of Perth public notice coordination', dt(50)],
  ['demo-st-3', 'demo-permit-5', 'demo-tmp-4', A_MRWA, 'pending', 'Freeway lane occupancy booking', dt(48)],
  ['demo-st-4', 'demo-permit-8', 'demo-tmp-6', A_PTA, 'pending', 'Rail window coordination resubmission', dt(43)]
];
subTasks.forEach(s => upsert('permit_sub_tasks', ['id', 'permit_id', 'tmp_id', 'authority_id', 'status', 'notes', 'created_at'], resolve(s)));

const fees = [
  ['demo-fee-1', 'demo-permit-1', 'application_fee', 350, 'paid', 0, null, null],
  ['demo-fee-2', 'demo-permit-2', 'application_fee', 500, 'pending', 0, null, null],
  ['demo-fee-3', 'demo-permit-2', 'bond', 2000, 'paid', 0, null, null],
  ['demo-fee-4', 'demo-permit-3', 'application_fee', 250, 'pending', 0, null, null],
  ['demo-fee-5', 'demo-permit-5', 'application_fee', 500, 'paid', 0, null, null],
  ['demo-fee-6', 'demo-permit-5', 'daily_occupancy_fee', 1200, 'paid', 0, null, null],
  ['demo-fee-7', 'demo-permit-5', 'bond', 5000, 'paid', 0, null, null],
  ['demo-fee-8', 'demo-permit-6', 'application_fee', 500, 'pending', 0, null, null],
  ['demo-fee-9', 'demo-permit-9', 'application_fee', 300, 'paid', 0, null, null],
  ['demo-fee-10', 'demo-permit-9', 'lane_usage_fee', 750, 'pending', 0, null, null],
  ['demo-fee-11', 'demo-permit-10', 'application_fee', 300, 'paid', 1, null, null],
  ['demo-fee-12', 'demo-permit-11', 'application_fee', 350, 'paid', 0, null, null],
  ['demo-fee-13', 'demo-permit-12', 'application_fee', 500, 'refunded', 0, null, null],
  ['demo-fee-14', 'demo-permit-14', 'application_fee', 500, 'pending', 0, null, null]
];
fees.forEach(f => upsert('permit_fees', ['id', 'permit_id', 'fee_type', 'amount', 'status', 'bond_returned', 'due_date', 'paid_date'], f));
const COST_CODES = ['TMP-DESIGN', 'TMP-LGA-LIAISON', 'TMP-MRWA-LIAISON', 'TMP-PTA-LIAISON', 'TMP-HVS-LIAISON', 'TMP-SUBMISSION', 'TMP-REVISION-INT', 'TMP-REVISION-EXT', 'TMP-SITE-VISIT', 'TMP-MEETING', 'TMP-ADMIN', 'TMP-RESEARCH'];

let timeSeed = 1;
const timeEntries = [];
const timeRows = [
  ['demo-tmp-1', ADMIN, 'TMP-DESIGN', 'Initial site assessment and TMP drafting', 4.5, 150, 1, d(62)],
  ['demo-tmp-1', ADMIN, 'TMP-LGA-LIAISON', 'Called City of Perth planning dept', 2.0, 150, 1, d(60)],
  ['demo-tmp-1', ADMIN, 'TMP-REVISION-INT', 'Internal QA review of draft TMP', 1.5, 150, 0, d(59)],
  ['demo-tmp-1', ADMIN, 'TMP-SUBMISSION', 'Lodged application with City of Perth', 1.0, 150, 1, d(58)],
  ['demo-tmp-2', PLANNER, 'TMP-DESIGN', 'Night works plan drafting', 6.0, 150, 1, d(32)],
  ['demo-tmp-2', PLANNER, 'TMP-MRWA-LIAISON', 'MRWA referral pack preparation', 3.0, 150, 1, d(29)],
  ['demo-tmp-2', PLANNER, 'TMP-SITE-VISIT', 'Night site inspection', 2.5, 160, 1, d(27)],
  ['demo-tmp-3', PLANNER2, 'TMP-DESIGN', 'Permanent signage layout design', 5.0, 150, 1, d(16)],
  ['demo-tmp-3', PLANNER2, 'TMP-RESEARCH', 'Signage standards research', 2.0, 150, 0, d(14)],
  ['demo-tmp-4', PLANNER, 'TMP-DESIGN', 'Smart workzone plan stage 1', 7.0, 160, 1, d(56)],
  ['demo-tmp-4', PLANNER, 'TMP-MRWA-LIAISON', 'Freeway lane booking coordination', 4.0, 160, 1, d(49)],
  ['demo-tmp-4', PLANNER, 'TMP-SUBMISSION', 'Lodged with Main Roads', 1.5, 160, 1, d(48)],
  ['demo-tmp-5', PLANNER2, 'TMP-DESIGN', 'Smart sign install plan', 4.0, 150, 1, d(13)],
  ['demo-tmp-5', PLANNER2, 'TMP-MRWA-LIAISON', 'Signal coordination emails', 1.5, 150, 1, d(11)],
  ['demo-tmp-6', PLANNER3, 'TMP-DESIGN', 'Crane lift TMP design', 8.0, 155, 1, d(46)],
  ['demo-tmp-6', PLANNER3, 'TMP-REVISION-EXT', 'Rework after PTA rejection', 4.0, 155, 1, d(41)],
  ['demo-tmp-6', PLANNER3, 'TMP-REVISION-INT', 'Internal review of rail corridor plan', 2.5, 155, 0, d(44)],
  ['demo-tmp-7', PLANNER3, 'TMP-DESIGN', 'Rail corridor access planning', 3.5, 155, 1, d(11)],
  ['demo-tmp-8', PLANNER, 'TMP-DESIGN', 'Roundabout night closure plan', 5.5, 160, 1, d(36)],
  ['demo-tmp-8', PLANNER, 'TMP-SITE-VISIT', 'Night closure supervision', 3.0, 160, 1, d(34)],
  ['demo-tmp-9', PLANNER2, 'TMP-DESIGN', 'Pedestrian crossing design', 6.5, 150, 1, d(118)],
  ['demo-tmp-9', PLANNER2, 'TMP-MEETING', 'Design review meeting with client', 1.0, 150, 1, d(116)],
  ['demo-tmp-10', ADMIN, 'TMP-DESIGN', 'Pipe replacement TMP', 5.0, 150, 1, d(152)],
  ['demo-tmp-10', ADMIN, 'TMP-MEETING', 'Swan Water kickoff meeting', 1.5, 150, 1, d(151)],
  ['demo-tmp-10', ADMIN, 'TMP-ADMIN', 'Permit tracking and admin', 3.0, 150, 0, d(146)],
  ['demo-tmp-11', PLANNER, 'TMP-ADMIN', 'Event traffic control admin', 1.0, 150, 0, d(21)],
  ['demo-tmp-12', PLANNER3, 'TMP-DESIGN', 'Shoulder works plan', 3.0, 155, 1, d(9)],
  ['demo-tmp-12', PLANNER3, 'TMP-MRWA-LIAISON', 'MRWA email coordination', 1.0, 155, 1, d(7)]
];
for (const [tmp, user, cost, desc, hours, rate, billable, date] of timeRows) {
  timeEntries.push([`demo-time-${timeSeed++}`, tmp, user, cost, desc, hours, rate, billable, date]);
}
timeEntries.forEach(t => upsert('time_entries', ['id', 'tmp_id', 'user_id', 'cost_code', 'description', 'duration_hours', 'rate_per_hour', 'is_billable', 'date'], resolve(t)));

const intersections = [
  ['demo-int-1', A_MRWA, 'Kwinana Freeway / Roe Hwy Interchange', 'Kwinana Freeway', 'Canning Vale', 30, 1, 'Signalised interchange within 30m of works'],
  ['demo-int-2', A_MRWA, 'Tonkin Hwy / Great Eastern Hwy', 'Tonkin Highway', 'Belmont', 30, 1, 'Major signalised intersection'],
  ['demo-int-3', A_LGA, 'Main St / Wellington St', 'Main Street', 'Perth CBD', 30, 1, 'CBD signalised crossing'],
  ['demo-int-4', A_STIRLING, 'West Coast Hwy / Scarborough Beach Rd', 'West Coast Highway', 'Scarborough', 30, 1, 'Coastal signalised intersection']
];
intersections.forEach(i => upsert('signalised_intersections', ['id', 'authority_id', 'intersection_name', 'road_name', 'suburb', 'distance_meters', 'is_mandatory', 'notes'], i));

const triggers = [
  ['demo-trig-1', 'demo-permit-2', 'mrwa_referral', 'Works within 30m of signalised intersection - MRWA referral required', 0, null, null, dt(50)],
  ['demo-trig-2', 'demo-permit-5', 'mrwa_referral', 'Freeway works require MRWA approval', 1, dt(35), ADMIN, dt(48)],
  ['demo-trig-3', 'demo-permit-6', 'mrwa_referral', 'Signalised intersection proximity detected', 0, null, null, dt(12)],
  ['demo-trig-4', 'demo-permit-12', 'mrwa_referral', 'Freeway occupancy booking required', 1, dt(130), ADMIN, dt(140)],
  ['demo-trig-5', 'demo-permit-14', 'mrwa_referral', 'Shoulder works within signal corridor', 0, null, null, dt(8)]
];
triggers.forEach(t => upsert('workflow_triggers', ['id', 'permit_id', 'trigger_type', 'description', 'is_resolved', 'resolved_at', 'resolved_by', 'created_at'], t));

const notifications = [
  ['demo-notif-1', ADMIN, 'permit', 'Permit approved', 'MRWA approved permit for TMP-2026-004', 'permit', 'demo-permit-5', 'demo-notif-1', 1, dt(35)],
  ['demo-notif-2', ADMIN, 'tmp', 'TMP rejected', 'TMP-2026-006 was rejected by Main Roads', 'tmp', 'demo-tmp-6', 'demo-notif-2', 0, dt(42)],
  ['demo-notif-3', PLANNER, 'permit', 'Permit expiring soon', 'Permit for TMP-2026-010 expires in 14 days', 'permit', 'demo-permit-12', 'demo-notif-3', 0, dt(2)],
  ['demo-notif-4', PLANNER, 'tmp', 'SLA approaching', 'TMP-2026-005 submission approaching SLA deadline', 'tmp', 'demo-tmp-5', 'demo-notif-4', 0, dt(1)],
  ['demo-notif-5', PLANNER2, 'permit', 'Permit under review', 'City of Stirling is reviewing permit TMP-2026-008', 'permit', 'demo-permit-9', 'demo-notif-5', 1, dt(30)],
  ['demo-notif-6', PLANNER3, 'tmp', 'Action required', 'MRWA referral pending for TMP-2026-012', 'tmp', 'demo-tmp-12', 'demo-notif-6', 0, dt(3)],
  ['demo-notif-7', ADMIN, 'fee', 'Bond due', 'Bond for TMP-2026-004 to be returned', 'permit', 'demo-permit-5', 'demo-notif-7', 0, dt(4)],
  ['demo-notif-8', VIEWER, 'system', 'Welcome', 'Welcome to LUX Traffic Management', null, null, 'demo-notif-8', 1, dt(30)]
];
notifications.forEach(n => upsert('notifications', ['id', 'user_id', 'type', 'title', 'message', 'entity_type', 'entity_id', 'dedupe_key', 'is_read', 'created_at'], resolve(n)));

const stages = {
  tmp: db.prepare("SELECT id, name FROM workflow_stages WHERE entity_type = 'tmp' ORDER BY sort_order").all(),
  permit: db.prepare("SELECT id, name FROM workflow_stages WHERE entity_type = 'permit' ORDER BY sort_order").all()
};
const checklist = [];
const markDone = (entityType, entityId, index, user, daysAgo) => {
  const stage = stages[entityType][index];
  if (!stage) return;
  checklist.push([`demo-chk-${entityType}-${entityId}-${stage.name.replace(/\s+/g, '-').toLowerCase()}`, stage.id, entityType, entityId, 1, dt(daysAgo), user]);
};
markDone('tmp', 'demo-tmp-1', 0, ADMIN, 61);
markDone('tmp', 'demo-tmp-1', 1, ADMIN, 60);
markDone('tmp', 'demo-tmp-1', 2, ADMIN, 60);
markDone('tmp', 'demo-tmp-4', 0, PLANNER, 56);
markDone('tmp', 'demo-tmp-4', 1, PLANNER, 55);
markDone('tmp', 'demo-tmp-4', 2, PLANNER, 54);
markDone('tmp', 'demo-tmp-2', 0, PLANNER, 31);
markDone('tmp', 'demo-tmp-2', 1, PLANNER, 30);
markDone('tmp', 'demo-tmp-5', 0, PLANNER2, 13);
markDone('tmp', 'demo-tmp-9', 0, PLANNER2, 119);
markDone('tmp', 'demo-tmp-9', 1, PLANNER2, 118);
markDone('tmp', 'demo-tmp-10', 0, ADMIN, 153);
markDone('tmp', 'demo-tmp-10', 1, ADMIN, 152);
markDone('permit', 'demo-permit-1', 0, ADMIN, 58);
markDone('permit', 'demo-permit-5', 0, PLANNER, 48);
markDone('permit', 'demo-permit-9', 0, PLANNER, 33);
markDone('permit', 'demo-permit-10', 0, PLANNER2, 115);
checklist.forEach(c => upsert('workflow_checklist', ['id', 'stage_id', 'entity_type', 'entity_id', 'is_done', 'done_at', 'done_by'], resolve(c)));

function makePdf(text) {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length + 20} >>\nstream\nBT /F1 18 Tf 72 720 Td (${text}) Tj ET\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach(o => pdf += `${String(o).padStart(10, '0')} 00000 n \n`);
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

const documents = [
  ['demo-doc-1', 'demo-tmp-1', 'demo-doc-1.pdf', 'Main-St-TMP-Plan.pdf', 'application/pdf', 0, ADMIN, dt(61)],
  ['demo-doc-2', 'demo-tmp-2', 'demo-doc-2.pdf', 'Night-Works-Layout.pdf', 'application/pdf', 0, PLANNER, dt(31)],
  ['demo-doc-3', 'demo-tmp-4', 'demo-doc-3.pdf', 'Freeway-Lane-Closure-Plan.pdf', 'application/pdf', 0, PLANNER, dt(55)]
];
for (const [id, tmpId, filename, original, mime, size, user, created] of documents) {
  const realTmpId = tmpIds[tmpId] || tmpId;
  const existing = byKey('documents', 'id', id);
  if (!existing) {
    fs.writeFileSync(path.join(uploadDir, filename), makePdf(original.replace('.pdf', '')));
    upsert('documents', ['id', 'tmp_id', 'filename', 'original_name', 'mime_type', 'size', 'uploaded_by', 'created_at'],
      [id, realTmpId, filename, original, mime, fs.statSync(path.join(uploadDir, filename)).size, user, created]);
  }
}

const settings = [
  ['reminder_days', '14'],
  ['smtp_configured', '0']
];
settings.forEach(s => upsert('settings', ['key', 'value'], s));

const emailLogs = [
  ['demo-email-1', 'traffic@perth.wa.gov.au', 'TMP-2026-001 application lodged', 'Attached TMP for City of Perth assessment', 'demo-tmp-1', 'sent', dt(58)],
  ['demo-email-2', 'trafficmanagement@mainroads.wa.gov.au', 'TMP-2026-004 referral', 'MRWA referral package for freeway works', 'demo-tmp-4', 'sent', dt(48)],
  ['demo-email-3', 'tmp@pta.wa.gov.au', 'TMP-2026-006 resubmission', 'Revised rail corridor plan after rejection', 'demo-tmp-6', 'sent', dt(40)]
];
emailLogs.forEach(e => upsert('email_logs', ['id', 'to_address', 'subject', 'body', 'tmp_id', 'status', 'created_at'], resolve(e)));

db.close();

console.log('Demo data populated!');
console.log('DB:', dbPath);
console.log('Uploads:', uploadDir);
console.log('Logins: admin@tmpcms.com / admin123 | planner@tmpcms.com / planner123 | viewer@tmpcms.com / viewer123');
