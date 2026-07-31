import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '..', process.env.DB_PATH || './data/tmpcms.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'planner' CHECK(role IN ('admin','planner','viewer')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    company TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    abn TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sites (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    road_name TEXT,
    suburb TEXT,
    state TEXT DEFAULT 'WA',
    postcode TEXT,
    latitude REAL,
    longitude REAL,
    description TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tmp_projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    client_id TEXT REFERENCES clients(id),
    site_id TEXT,
    status TEXT DEFAULT 'active' CHECK(status IN ('active','completed','on_hold','cancelled')),
    start_date TEXT,
    end_date TEXT,
    plan_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS traffic_management_plans (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES tmp_projects(id),
    site_id TEXT REFERENCES sites(id),
    title TEXT NOT NULL,
    reference TEXT UNIQUE,
    status TEXT DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved','rejected','completed','cancelled')),
    plan_type TEXT DEFAULT 'temporary' CHECK(plan_type IN ('temporary','permanent','event')),
    description TEXT,
    start_date TEXT,
    end_date TEXT,
    created_by TEXT REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS plan_activities (
    id TEXT PRIMARY KEY,
    tmp_id TEXT REFERENCES traffic_management_plans(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id),
    action TEXT NOT NULL,
    description TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    tmp_id TEXT REFERENCES traffic_management_plans(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT,
    size INTEGER,
    uploaded_by TEXT REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS authorities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT,
    type TEXT CHECK(type IN ('lga','mrwa','pta','hvs','other')),
    email TEXT,
    phone TEXT,
    website TEXT,
    address TEXT,
    contact_person TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sla_rules (
    id TEXT PRIMARY KEY,
    authority_id TEXT REFERENCES authorities(id) ON DELETE CASCADE,
    complexity TEXT NOT NULL CHECK(complexity IN ('simple','standard','complex','complex_with_notice')),
    assessment_days INTEGER NOT NULL DEFAULT 14,
    public_notice_days INTEGER DEFAULT 0,
    buffer_days INTEGER DEFAULT 0,
    requires_public_notice INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS signalised_intersections (
    id TEXT PRIMARY KEY,
    authority_id TEXT REFERENCES authorities(id) ON DELETE CASCADE,
    intersection_name TEXT NOT NULL,
    road_name TEXT,
    suburb TEXT,
    distance_meters INTEGER DEFAULT 30,
    is_mandatory INTEGER DEFAULT 1,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS permits (
    id TEXT PRIMARY KEY,
    tmp_id TEXT REFERENCES traffic_management_plans(id),
    authority_id TEXT REFERENCES authorities(id),
    status TEXT DEFAULT 'draft' CHECK(status IN ('draft','submitted','under_review','approved','rejected','expired','cancelled','completed')),
    complexity TEXT DEFAULT 'standard' CHECK(complexity IN ('simple','standard','complex','complex_with_notice')),
    submission_date TEXT,
    approval_date TEXT,
    expiry_date TEXT,
    rejection_reason TEXT,
    assessment_days INTEGER,
    is_within_30m_signals INTEGER DEFAULT 0,
    requires_mrwa INTEGER DEFAULT 0,
    created_by TEXT REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS permit_sub_tasks (
    id TEXT PRIMARY KEY,
    permit_id TEXT REFERENCES permits(id) ON DELETE CASCADE,
    tmp_id TEXT REFERENCES traffic_management_plans(id),
    authority_id TEXT REFERENCES authorities(id),
    status TEXT DEFAULT 'pending',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS permit_fees (
    id TEXT PRIMARY KEY,
    permit_id TEXT REFERENCES permits(id) ON DELETE CASCADE,
    fee_type TEXT NOT NULL CHECK(fee_type IN ('application_fee','assessment_fee','daily_occupancy_fee','lane_usage_fee','bond','other')),
    amount REAL NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','paid','refunded','waived')),
    bond_returned INTEGER DEFAULT 0,
    due_date TEXT,
    paid_date TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS workflow_triggers (
    id TEXT PRIMARY KEY,
    permit_id TEXT REFERENCES permits(id) ON DELETE CASCADE,
    trigger_type TEXT NOT NULL,
    description TEXT,
    is_resolved INTEGER DEFAULT 0,
    resolved_at TEXT,
    resolved_by TEXT REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS time_entries (
    id TEXT PRIMARY KEY,
    tmp_id TEXT REFERENCES traffic_management_plans(id),
    user_id TEXT REFERENCES users(id),
    cost_code TEXT NOT NULL,
    description TEXT,
    duration_hours REAL NOT NULL DEFAULT 0,
    rate_per_hour REAL NOT NULL DEFAULT 150,
    is_billable INTEGER DEFAULT 1,
    total_cost REAL GENERATED ALWAYS AS (duration_hours * rate_per_hour) STORED,
    date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS email_logs (
    id TEXT PRIMARY KEY,
    to_address TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT,
    tmp_id TEXT,
    status TEXT DEFAULT 'sent',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    entity_type TEXT,
    entity_id TEXT,
    dedupe_key TEXT UNIQUE,
    is_read INTEGER DEFAULT 0,
    read_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tmps_project ON traffic_management_plans(project_id);
  CREATE INDEX IF NOT EXISTS idx_tmps_status ON traffic_management_plans(status);
  CREATE INDEX IF NOT EXISTS idx_permits_tmp ON permits(tmp_id);
  CREATE INDEX IF NOT EXISTS idx_permits_authority ON permits(authority_id);
  CREATE INDEX IF NOT EXISTS idx_permits_status ON permits(status);
  CREATE INDEX IF NOT EXISTS idx_sla_authority ON sla_rules(authority_id);
  CREATE INDEX IF NOT EXISTS idx_time_entries_tmp ON time_entries(tmp_id);
  CREATE INDEX IF NOT EXISTS idx_time_entries_user ON time_entries(user_id);
  CREATE INDEX IF NOT EXISTS idx_plan_activities_tmp ON plan_activities(tmp_id);
  CREATE INDEX IF NOT EXISTS idx_documents_tmp ON documents(tmp_id);
  CREATE INDEX IF NOT EXISTS idx_permit_fees_permit ON permit_fees(permit_id);
  CREATE INDEX IF NOT EXISTS idx_workflow_triggers_permit ON workflow_triggers(permit_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
`);

export default db;
export { dbPath };
