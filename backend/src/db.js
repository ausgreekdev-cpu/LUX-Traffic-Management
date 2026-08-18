import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { randomUUID } from 'node:crypto';

const moduleDir = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
export const isServerless = !!(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
const dbPath = isServerless
  ? path.join('/tmp', process.env.DB_FILENAME || 'tmpcms.db')
  : path.resolve(moduleDir, '..', process.env.DB_PATH || './data/tmpcms.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

let db = null;
export function initDatabase() {
db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = FULL');
db.pragma('busy_timeout = 5000');
db.pragma('wal_autocheckpoint = 1000');
db.pragma('foreign_keys = ON');db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff' CHECK(role IN ('developer','manager','staff','client')),
    client_id TEXT REFERENCES clients(id),
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
    council_type TEXT,
    abn TEXT,
    band INTEGER,
    suburb TEXT,
    postcode TEXT,
    mayor TEXT,
    deputy TEXT,
    ceo TEXT,
    councillors TEXT,
    executive_team TEXT,
    suburbs TEXT,
    meeting_schedule TEXT,
    map_coordinates TEXT,
    zone TEXT,
    statistics TEXT,
    directory_source TEXT,
    directory_updated_at TEXT,
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

  CREATE TABLE IF NOT EXISTS workflow_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    entity_type TEXT NOT NULL CHECK(entity_type IN ('tmp','permit')),
    complexity TEXT CHECK(complexity IN ('simple','standard','complex','complex_with_notice')),
    authority_id TEXT REFERENCES authorities(id),
    is_default INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(entity_type, complexity, authority_id)
  );

  CREATE TABLE IF NOT EXISTS workflow_stages (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL CHECK(entity_type IN ('tmp','permit')),
    name TEXT NOT NULL,
    description TEXT,
    is_optional INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    template_id TEXT REFERENCES workflow_templates(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS workflow_checklist (
    id TEXT PRIMARY KEY,
    stage_id TEXT REFERENCES workflow_stages(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK(entity_type IN ('tmp','permit')),
    entity_id TEXT NOT NULL,
    is_done INTEGER DEFAULT 0,
    done_at TEXT,
    done_by TEXT REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(stage_id, entity_type, entity_id)
  );

  CREATE TABLE IF NOT EXISTS automation_rules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    is_active INTEGER DEFAULT 1,
    entity_type TEXT NOT NULL,
    event_type TEXT NOT NULL,
    conditions_json TEXT,
    actions_json TEXT,
    priority INTEGER DEFAULT 0,
    cooldown_hours INTEGER DEFAULT 0,
    dedupe_key_template TEXT,
    created_by TEXT REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS automation_runs (
    id TEXT PRIMARY KEY,
    rule_id TEXT REFERENCES automation_rules(id) ON DELETE SET NULL,
    event_type TEXT,
    entity_type TEXT,
    entity_id TEXT,
    payload_json TEXT,
    status TEXT DEFAULT 'fired' CHECK(status IN ('fired','skipped','error')),
    actions_json TEXT,
    error TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_automation_rules_active ON automation_rules(is_active);
  CREATE INDEX IF NOT EXISTS idx_automation_runs_rule ON automation_runs(rule_id);
  CREATE INDEX IF NOT EXISTS idx_automation_runs_entity ON automation_runs(entity_type, entity_id);
  CREATE INDEX IF NOT EXISTS idx_automation_runs_status ON automation_runs(status);

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
  CREATE INDEX IF NOT EXISTS idx_workflow_stages_type ON workflow_stages(entity_type);
  CREATE INDEX IF NOT EXISTS idx_workflow_checklist_entity ON workflow_checklist(entity_type, entity_id);

  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT DEFAULT (datetime('now'))
  );
`);

// Migrations for existing databases: add directory fields to authorities if missing.
{
  const existing = db.prepare('PRAGMA table_info(authorities)').all().map(c => c.name);
  const directoryCols = [
    'council_type TEXT', 'abn TEXT', 'band INTEGER', 'suburb TEXT', 'postcode TEXT',
    'mayor TEXT', 'deputy TEXT', 'ceo TEXT', 'councillors TEXT', 'executive_team TEXT',
    'suburbs TEXT', 'meeting_schedule TEXT', 'map_coordinates TEXT', 'zone TEXT',
    'statistics TEXT', 'directory_source TEXT', 'directory_updated_at TEXT'
  ];
  for (const col of directoryCols) {
    const name = col.split(' ')[0];
    if (!existing.includes(name)) db.exec(`ALTER TABLE authorities ADD COLUMN ${col}`);
  }
}

// Migration: template_id on workflow_stages (legacy stages stay NULL = global fallback).
{
  const stageCols = db.prepare('PRAGMA table_info(workflow_stages)').all().map(c => c.name);
  if (!stageCols.includes('template_id')) db.exec('ALTER TABLE workflow_stages ADD COLUMN template_id TEXT REFERENCES workflow_templates(id) ON DELETE CASCADE');
  db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_stages_template ON workflow_stages(template_id)');
}

// Migration: complexity on traffic_management_plans (Phase 3 complexity triage).
{
  const tmpCols = db.prepare('PRAGMA table_info(traffic_management_plans)').all().map(c => c.name);
  if (!tmpCols.includes('complexity')) db.exec("ALTER TABLE traffic_management_plans ADD COLUMN complexity TEXT DEFAULT 'standard'");
}

// Migration: Phase 4 risk scoring fields on traffic_management_plans.
{
  const tmpCols = db.prepare('PRAGMA table_info(traffic_management_plans)').all().map(c => c.name);
  const add = (name, def) => { if (!tmpCols.includes(name)) db.exec(`ALTER TABLE traffic_management_plans ADD COLUMN ${name} ${def}`); };
  add('risk_consequence', 'INTEGER');
  add('risk_likelihood', 'INTEGER');
  add('risk_score', 'INTEGER');
  add('risk_band', 'TEXT');
  add('risk_mitigations', 'TEXT');
  add('complexity_source', "TEXT DEFAULT 'manual'");
}

// Migration: Phase 4 site data fields (road class, speed, AADT, activity, rail, school).
{
  const siteCols = db.prepare('PRAGMA table_info(sites)').all().map(c => c.name);
  const add = (name, def) => { if (!siteCols.includes(name)) db.exec(`ALTER TABLE sites ADD COLUMN ${name} ${def}`); };
  add('road_class', "TEXT CHECK(road_class IN ('local','distributor','collector','arterial','highway','freeway'))");
  add('speed_limit', 'INTEGER');
  add('aadt', 'INTEGER');
  add('pedestrian_activity', "TEXT CHECK(pedestrian_activity IN ('low','medium','high'))");
  add('cyclist_activity', "TEXT CHECK(cyclist_activity IN ('low','medium','high'))");
  add('rail_corridor', 'INTEGER DEFAULT 0');
  add('school_zone', 'INTEGER DEFAULT 0');
}

// Phase 5: AI agent runs (reports + recommendations, human-in-the-loop).
db.exec(`
  CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    verdict TEXT,
    score REAL,
    summary TEXT,
    findings_json TEXT,
    recommended_json TEXT,
    applied INTEGER DEFAULT 0,
    applied_by TEXT,
    applied_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_agent_runs_entity ON agent_runs(entity_type, entity_id);
  CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs(agent_id);
`);

// Phase 6: email templates + correspondence ingest.
db.exec(`
  CREATE TABLE IF NOT EXISTS email_templates (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    event_type TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS correspondence (
    id TEXT PRIMARY KEY,
    source TEXT,
    provider TEXT,
    sender TEXT,
    subject TEXT,
    received_at TEXT,
    raw_text TEXT,
    tmp_reference TEXT,
    matched_tmp_id TEXT,
    matched_permit_id TEXT,
    extracted_status TEXT,
    extracted_reason TEXT,
    review_status TEXT DEFAULT 'new' CHECK(review_status IN ('new','reviewed','applied','dismissed')),
    reviewed_by TEXT,
    reviewed_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_correspondence_tmp ON correspondence(matched_tmp_id);
  CREATE INDEX IF NOT EXISTS idx_correspondence_status ON correspondence(review_status);
`);

  // Migration: multi-level roles (developer/manager/staff/client) + client linkage.
  const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!userCols.includes('client_id')) {
    db.pragma('foreign_keys = OFF');
    try {
      db.exec(`
        CREATE TABLE users_new (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          name TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'staff' CHECK(role IN ('developer','manager','staff','client')),
          client_id TEXT REFERENCES clients(id),
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
        INSERT INTO users_new (id, email, password, name, role, created_at, updated_at)
          SELECT id, email, password, name,
            CASE role
              WHEN 'admin' THEN 'developer'
              WHEN 'planner' THEN 'staff'
              WHEN 'viewer' THEN 'client'
              ELSE 'staff'
            END,
            created_at, updated_at FROM users;
        DROP TABLE users;
        ALTER TABLE users_new RENAME TO users;
        CREATE INDEX IF NOT EXISTS idx_users_client ON users(client_id);
      `);
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }
  runMigrations();
}

// Versioned migrations. The inline blocks above form the idempotent baseline
// (they already ran against any existing DB). Newer schema changes are applied
// incrementally here and recorded in schema_migrations so each runs exactly once.
const MIGRATIONS = [
  {
    version: 2,
    name: 'auth_attempts',
    up() {
      db.exec(`
        CREATE TABLE IF NOT EXISTS auth_attempts (
          key TEXT PRIMARY KEY,
          fails INTEGER DEFAULT 0,
          locked_until INTEGER DEFAULT 0,
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `);
    }
  },
  {
    version: 3,
    name: 'kanban_board',
    up() {
      db.exec(`
        CREATE TABLE IF NOT EXISTS board_columns (
          id TEXT PRIMARY KEY,
          entity_type TEXT NOT NULL CHECK(entity_type IN ('tmp','permit')),
          name TEXT NOT NULL,
          description TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          wip_limit INTEGER,
          enforce_wip INTEGER DEFAULT 0,
          colour TEXT DEFAULT 'bg-gray-50',
          maps_to_status TEXT,
          assign_role TEXT,
          requires_stages_json TEXT,
          stale_business_days INTEGER,
          is_final INTEGER DEFAULT 0,
          is_emergency_lane INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          UNIQUE(entity_type, sort_order),
          UNIQUE(entity_type, name)
        );

        CREATE TABLE IF NOT EXISTS board_cards (
          id TEXT PRIMARY KEY,
          entity_type TEXT NOT NULL CHECK(entity_type IN ('tmp','permit')),
          entity_id TEXT NOT NULL,
          column_id TEXT NOT NULL REFERENCES board_columns(id),
          lane TEXT NOT NULL DEFAULT '',
          sort_order INTEGER NOT NULL DEFAULT 0,
          assigned_user_id TEXT REFERENCES users(id),
          entered_column_at TEXT DEFAULT (datetime('now')),
          last_stale_alert_at TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          UNIQUE(entity_type, entity_id)
        );

        CREATE TABLE IF NOT EXISTS board_card_history (
          id TEXT PRIMARY KEY,
          card_id TEXT NOT NULL REFERENCES board_cards(id) ON DELETE CASCADE,
          column_id TEXT NOT NULL,
          lane TEXT NOT NULL DEFAULT '',
          entered_at TEXT NOT NULL DEFAULT (datetime('now')),
          left_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_board_cards_column ON board_cards(column_id);
        CREATE INDEX IF NOT EXISTS idx_board_cards_entity ON board_cards(entity_type, entity_id);
        CREATE INDEX IF NOT EXISTS idx_board_cards_lane ON board_cards(lane);
        CREATE INDEX IF NOT EXISTS idx_board_cards_assigned ON board_cards(assigned_user_id);
        CREATE INDEX IF NOT EXISTS idx_board_history_card ON board_card_history(card_id);
      `);
    }
  },
  {
    version: 4,
    name: 'branding_engine',
    up() {
      db.exec(`
        CREATE TABLE IF NOT EXISTS branding (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          theme_json TEXT NOT NULL DEFAULT '{}',
          typography_json TEXT NOT NULL DEFAULT '{}',
          pdf_layout_json TEXT NOT NULL DEFAULT '{}',
          watermark_json TEXT NOT NULL DEFAULT '{}',
          email_json TEXT NOT NULL DEFAULT '{}',
          css_override TEXT NOT NULL DEFAULT '',
          css_version INTEGER NOT NULL DEFAULT 0,
          updated_by TEXT,
          updated_at TEXT DEFAULT (datetime('now'))
        );
        INSERT OR IGNORE INTO branding (id) VALUES (1);

        CREATE TABLE IF NOT EXISTS branding_assets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          slot TEXT NOT NULL UNIQUE,
          blob_key TEXT NOT NULL,
          mime_type TEXT,
          size INTEGER,
          width INTEGER,
          height INTEGER,
          updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS branding_versions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          label TEXT,
          snapshot_json TEXT NOT NULL,
          created_by TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS domain_map (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          domain TEXT NOT NULL UNIQUE,
          is_primary INTEGER DEFAULT 0,
          status TEXT DEFAULT 'pending',
          notes TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_branding_assets_slot ON branding_assets(slot);
      `);
      const cols = db.prepare('PRAGMA table_info(email_templates)').all().map(c => c.name);
      if (!cols.includes('html_body')) {
        db.exec('ALTER TABLE email_templates ADD COLUMN html_body TEXT');
      }
    }
  },
  {
    version: 5,
    name: 'per_domain_branding',
    up() {
      // Move from a single global brand (id CHECK = 1) to per-domain brands.
      // `domain` is the custom portal domain; '' (empty) is the global/default
      // brand. Rows are addressed by domain, never by id.
      db.exec(`
        CREATE TABLE branding_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          domain TEXT NOT NULL DEFAULT '',
          theme_json TEXT NOT NULL DEFAULT '{}',
          typography_json TEXT NOT NULL DEFAULT '{}',
          pdf_layout_json TEXT NOT NULL DEFAULT '{}',
          watermark_json TEXT NOT NULL DEFAULT '{}',
          email_json TEXT NOT NULL DEFAULT '{}',
          css_override TEXT NOT NULL DEFAULT '',
          css_version INTEGER NOT NULL DEFAULT 0,
          updated_by TEXT,
          updated_at TEXT DEFAULT (datetime('now')),
          UNIQUE(domain)
        );
        INSERT INTO branding_new (id, domain, theme_json, typography_json, pdf_layout_json, watermark_json, email_json, css_override, css_version, updated_by, updated_at)
          SELECT id, '', theme_json, typography_json, pdf_layout_json, watermark_json, email_json, css_override, css_version, updated_by, updated_at FROM branding;
        DROP TABLE branding;
        ALTER TABLE branding_new RENAME TO branding;

        CREATE TABLE branding_assets_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          domain TEXT NOT NULL DEFAULT '',
          slot TEXT NOT NULL,
          blob_key TEXT NOT NULL,
          mime_type TEXT,
          size INTEGER,
          width INTEGER,
          height INTEGER,
          updated_at TEXT DEFAULT (datetime('now')),
          UNIQUE(domain, slot)
        );
        INSERT INTO branding_assets_new (id, domain, slot, blob_key, mime_type, size, width, height, updated_at)
          SELECT id, '', slot, blob_key, mime_type, size, width, height, updated_at FROM branding_assets;
        DROP TABLE branding_assets;
        ALTER TABLE branding_assets_new RENAME TO branding_assets;

        ALTER TABLE branding_versions ADD COLUMN domain TEXT NOT NULL DEFAULT '';
      `);
    }
  },
  {
    version: 6,
    name: 'email_templates_seed',
    up() {
      // Built-in notification templates. They carry plain-text bodies only —
      // outgoing mail is auto-wrapped in the white-labelled HTML shell
      // (logo, accent, footer from Branding -> Email & Domain) unless a
      // template defines its own html_body. Idempotent: existing rows with the
      // same name (UNIQUE) are left untouched.
      const seed = [
        {
          name: 'stale_plan_alert',
          event_type: 'board.card_stale',
          subject: 'Stale card: {reference} in {column_name} for {days_stale} day(s)',
          body: 'Hi,\n\nCard {reference} ({title}) has been sitting in {column_name} for {days_stale} day(s) — beyond the {stale_business_days} business-day alert threshold.\n\n  Plan:     {reference}\n  Status:   {status}\n  Column:   {column_name}\n  Days:     {days_stale}\n\nPlease log in and follow up with the council / stakeholders to chase the approval.\n\nRegards,\nLUX Traffic Management'
        },
        {
          name: 'audit_signoff_request',
          event_type: 'plan.audit_required',
          subject: 'Audit / sign-off required: {reference}',
          body: 'Hi,\n\nPlan {reference} ({title}) requires mandatory audit and sign-off before it can proceed.\n\n  Plan:     {reference}\n  Title:    {title}\n  Status:   {status}\n\nPlease log in and complete the review so the workflow can continue.\n\nRegards,\nLUX Traffic Management'
        },
        {
          name: 'general_notification',
          event_type: 'general',
          subject: '{subject}',
          body: '{message}'
        }
      ];
      const insert = db.prepare(`
        INSERT OR IGNORE INTO email_templates (id, name, subject, body, event_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `);
      for (const t of seed) {
        insert.run(randomUUID(), t.name, t.subject, t.body, t.event_type);
      }
    }
  }
];

function currentSchemaVersion() {
  const row = db.prepare('SELECT MAX(version) as v FROM schema_migrations').get();
  return row && row.v ? row.v : 0;
}

export function runMigrations() {
  const current = currentSchemaVersion();
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    const tx = db.transaction(() => {
      m.up();
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, datetime(\'now\'))').run(m.version, m.name);
    });
    tx();
    console.log(`[migrations] applied v${m.version}: ${m.name}`);
  }
}

export function schemaVersion() {
  return currentSchemaVersion();
}

export function reopenDatabase() {
  if (db) {
    try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch {}
    db.close();
  }
  initDatabase();
}
initDatabase();

export { db as default };
export { dbPath };
