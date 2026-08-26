const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'tmp_data.sqlite');
let db;

function getDb() {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema();
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tmps (
      id TEXT PRIMARY KEY,
      tmp_number TEXT NOT NULL,
      project_name TEXT NOT NULL DEFAULT '',
      request_date TEXT,
      client_name TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      date_of_works TEXT,
      details TEXT DEFAULT '',
      assigned_to TEXT DEFAULT '',
      priority TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'new',
      custom_fields TEXT DEFAULT '{}',
      last_updated TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      tmp_id TEXT,
      tmp_number TEXT,
      username TEXT NOT NULL,
      details TEXT DEFAULT '',
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL DEFAULT '{}'
    );
  `);

  seedIfEmpty();
}

function seedIfEmpty() {
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (userCount > 0) return;

  const hash = bcrypt.hashSync('admin', 10);
  const insertUser = db.prepare('INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)');
  const users = [
    ['u_admin', 'admin', bcrypt.hashSync('admin', 10), 'admin'],
    ['u_planner', 'planner', bcrypt.hashSync('planner', 10), 'planner'],
    ['u_inspector', 'inspector', bcrypt.hashSync('inspector', 10), 'inspector'],
    ['u_viewer', 'viewer', bcrypt.hashSync('viewer', 10), 'viewer'],
  ];
  for (const u of users) insertUser.run(...u);

  const td = () => new Date().toISOString().slice(0, 10);
  const d = (o) => { const dt = new Date(); dt.setDate(dt.getDate() + o); return dt.toISOString().slice(0, 10); };
  const insertTmp = db.prepare(`INSERT INTO tmps (id, tmp_number, project_name, request_date, client_name, location, date_of_works, details, assigned_to, priority, status, custom_fields, last_updated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const mockData = [
    ['mock-1', 'TMP-2024-001', 'Main Street Utility Works', d(-14), 'City Water Authority', '123 Main Street, Sydney CBD', d(5), 'Installation of new water main requiring lane closures.', 'Sarah Chen', 'high', 'new', '{}', d(-10)+'T10:00:00Z'],
    ['mock-2', 'TMP-2024-002', 'Highway Bridge Inspection', d(-21), 'Transport NSW', 'Warringah Expressway, North Sydney', d(12), 'Routine structural inspection of bridge #4.', 'Michael Torres', 'medium', 'in-progress', '{}', d(-5)+'T10:00:00Z'],
    ['mock-3', 'TMP-2024-003', 'Road Resurfacing Program', d(-30), 'City of Sydney Council', 'Elizabeth Street, Surry Hills', d(18), 'Asphalt resurfacing. Night works only.', 'Emily Watson', 'high', 'permits-lga', '{}', d(-8)+'T10:00:00Z'],
    ['mock-4', 'TMP-2024-004', 'Traffic Signal Upgrade', d(-45), 'Roads & Maritime Services', 'Pacific Highway & Berry Street', d(25), 'Upgrade of traffic signal controllers.', 'David Park', 'medium', 'approvals', '{}', d(-3)+'T10:00:00Z'],
    ['mock-5', 'TMP-2024-005', 'Sidewalk Construction', d(-60), 'Parramatta City Council', 'Church Street, Parramatta', d(-10), 'New footpath construction.', 'Sarah Chen', 'low', 'completed', '{}', d(-15)+'T10:00:00Z'],
  ];
  for (const t of mockData) insertTmp.run(...t);

  const defaultSettings = {
    menuItems: [
      { id: 'dashboard', label: 'Dashboard', icon: '📊', enabled: true, badge: false },
      { id: 'new', label: 'New Requests', icon: '📥', enabled: true, badge: true },
      { id: 'in-progress', label: 'In Progress', icon: '🔄', enabled: true, badge: true },
      { id: 'permits-lga', label: 'Permits / LGA', icon: '📋', enabled: true, badge: true },
      { id: 'approvals', label: 'Approvals', icon: '✅', enabled: true, badge: true },
      { id: 'completed', label: 'Completed', icon: '✔️', enabled: true, badge: true },
      { id: 'calendar', label: 'Calendar', icon: '📅', enabled: true, badge: false },
    ],
    tableColumns: {},
    formFields: [
      { key: 'tmpNumber', label: 'TMP Number', type: 'text', required: false, enabled: true, gridClass: '' },
      { key: 'projectName', label: 'Project Name', type: 'text', required: true, enabled: true, gridClass: '' },
      { key: 'requestDate', label: 'Request Date', type: 'date', required: true, enabled: true, gridClass: '' },
      { key: 'clientName', label: 'Client Name', type: 'text', required: true, enabled: true, gridClass: '' },
      { key: 'location', label: 'Location / Site', type: 'text', required: true, enabled: true, gridClass: 'full-width' },
      { key: 'dateOfWorks', label: 'Date of Works', type: 'date', required: true, enabled: true, gridClass: '' },
      { key: 'assignedTo', label: 'Assigned To', type: 'text', required: false, enabled: true, gridClass: '' },
      { key: 'priority', label: 'Priority', type: 'select', required: false, enabled: true, gridClass: '' },
      { key: 'details', label: 'Details / Scope of Work', type: 'textarea', required: false, enabled: true, gridClass: 'full-width' },
    ],
    customFields: [],
    statuses: [
      { id: 'new', label: 'New', bg: '#dbeafe', color: '#1e40af', enabled: true },
      { id: 'in-progress', label: 'In Progress', bg: '#fef3c7', color: '#92400e', enabled: true },
      { id: 'permits-lga', label: 'Permits / LGA', bg: '#ede9fe', color: '#5b21b6', enabled: true },
      { id: 'approvals', label: 'Approvals', bg: '#cffafe', color: '#0e7490', enabled: true },
      { id: 'completed', label: 'Completed', bg: '#d1fae5', color: '#065f46', enabled: true },
    ],
    priorities: [
      { id: 'low', label: 'Low', bg: '#d1fae5', color: '#065f46' },
      { id: 'medium', label: 'Medium', bg: '#fef3c7', color: '#92400e' },
      { id: 'high', label: 'High', bg: '#fee2e2', color: '#991b1b' },
    ],
    content: {
      appName: 'Traffic Planning', appTagline: 'TMP Management System',
      viewTitles: { dashboard: 'Dashboard', new: 'New TMP Requests', 'in-progress': 'TMPs In Progress', 'permits-lga': 'TMP Permits / LGA', approvals: 'TMP Approvals', completed: 'Completed TMPs', calendar: 'Calendar View', settings: 'Admin Settings' },
      placeholders: { search: 'Search...', tmpNumber: 'Auto-generated', assignedTo: 'Team member name' },
      labels: { newRequest: 'New Request', adminSettings: 'Admin Settings' },
    },
    theme: {
      primary: '#1e40af', primaryLight: '#3b82f6', primaryDark: '#1e3a8a', sidebarBg: '#1e3a8a',
      bg: '#f1f5f9', surface: '#ffffff', text: '#1e293b', textSecondary: '#64748b', border: '#e2e8f0',
      success: '#10b981', warning: '#f59e0b', danger: '#ef4444', purple: '#8b5cf6', cyan: '#06b6d4',
      radius: '8px', font: '-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,\'Helvetica Neue\',Arial,sans-serif',
      sidebarText: '#ffffff', sidebarNavText: 'rgba(255,255,255,.75)', sidebarHoverBg: 'rgba(255,255,255,.08)',
      sidebarActiveBg: 'rgba(255,255,255,.12)', sidebarHeaderBorder: 'rgba(255,255,255,.1)', sidebarSubOpacity: '0.7',
      logo: '', banner: '', favicon: '', sidebarBgImg: '',
    },
    users: [
      { username: 'admin', password: 'admin', role: 'admin' },
      { username: 'planner', password: 'planner', role: 'planner' },
      { username: 'inspector', password: 'inspector', role: 'inspector' },
      { username: 'viewer', password: 'viewer', role: 'viewer' },
    ],
    statusRules: {},
    defaultValues: {},
    dashboardWidgets: { statActiveTMPs: true, statPendingApprovals: true, statUpcomingWorks: true, statHighPriority: true, chartStatusDistribution: true },
    rowDensity: 'comfortable',
    keyboardShortcuts: { newRequest: 'ctrl+n', globalSearch: 'ctrl+f', exportJSON: 'ctrl+e', dashboard: 'ctrl+1', calendar: 'ctrl+2', adminSettings: 'ctrl+,', help: '?' },
  };
  ['new', 'in-progress', 'permits-lga', 'approvals', 'completed'].forEach((s, i, a) => {
    if (i < a.length - 1) defaultSettings.tableColumns[s] = [
      { key: 'tmpNumber', label: 'TMP#', enabled: true },
      { key: 'projectName', label: 'Project', enabled: true },
      { key: 'clientName', label: 'Client', enabled: true },
      { key: 'location', label: 'Location', enabled: true },
      { key: 'dateOfWorks', label: 'Date of Works', enabled: true },
      { key: 'assignedTo', label: 'Assigned To', enabled: true },
      { key: 'priority', label: 'Priority', enabled: true },
      { key: 'actions', label: 'Actions', enabled: true },
    ];
  });

  db.prepare('INSERT INTO settings (id, data) VALUES (1, ?)').run(JSON.stringify(defaultSettings));
}

// ===== QUERY HELPERS =====

function query(sql, params = {}) {
  const stmt = db.prepare(sql);
  return stmt.all(params);
}

function get(sql, params = {}) {
  const stmt = db.prepare(sql);
  return stmt.get(params);
}

function run(sql, params = {}) {
  const stmt = db.prepare(sql);
  return stmt.run(params);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ===== USERS =====
function getUserByUsername(username) {
  return get('SELECT * FROM users WHERE username = ?', username);
}

function getAllUsers() {
  return query('SELECT id, username, role, created_at FROM users ORDER BY username');
}

function createUser(username, hashedPassword, role) {
  run('INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)', [uid(), username, hashedPassword, role]);
}

function updateUser(id, fields) {
  const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
  const vals = Object.values(fields);
  run(`UPDATE users SET ${sets} WHERE id = ?`, [...vals, id]);
}

function deleteUser(id) {
  run('DELETE FROM users WHERE id = ?', id);
}

// ===== TMPs =====
function getAllTmps() {
  const rows = query('SELECT * FROM tmps ORDER BY created_at DESC');
  return rows.map(r => ({
    id: r.id, tmpNumber: r.tmp_number, projectName: r.project_name,
    requestDate: r.request_date, clientName: r.client_name, location: r.location,
    dateOfWorks: r.date_of_works, details: r.details, assignedTo: r.assigned_to,
    priority: r.priority, status: r.status, lastUpdated: r.last_updated,
    customFields: JSON.parse(r.custom_fields || '{}')
  }));
}

function getTmpById(id) {
  const r = get('SELECT * FROM tmps WHERE id = ?', id);
  if (!r) return null;
  return {
    id: r.id, tmpNumber: r.tmp_number, projectName: r.project_name,
    requestDate: r.request_date, clientName: r.client_name, location: r.location,
    dateOfWorks: r.date_of_works, details: r.details, assignedTo: r.assigned_to,
    priority: r.priority, status: r.status, lastUpdated: r.last_updated,
    customFields: JSON.parse(r.custom_fields || '{}')
  };
}

function createTmp(data) {
  const id = uid();
  const tn = data.tmpNumber || ('TMP-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 999)).padStart(3, '0'));
  const now = new Date().toISOString();
  run(`INSERT INTO tmps (id, tmp_number, project_name, request_date, client_name, location, date_of_works, details, assigned_to, priority, status, custom_fields, last_updated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, tn, data.projectName || '', data.requestDate || '', data.clientName || '', data.location || '',
     data.dateOfWorks || '', data.details || '', data.assignedTo || '', data.priority || 'medium',
     data.status || 'new', JSON.stringify(data.customFields || {}), now]);
  return getTmpById(id);
}

function updateTmp(id, data) {
  const existing = getTmpById(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const fields = {
    tmp_number: data.tmpNumber !== undefined ? data.tmpNumber : existing.tmpNumber,
    project_name: data.projectName !== undefined ? data.projectName : existing.projectName,
    request_date: data.requestDate !== undefined ? data.requestDate : existing.requestDate,
    client_name: data.clientName !== undefined ? data.clientName : existing.clientName,
    location: data.location !== undefined ? data.location : existing.location,
    date_of_works: data.dateOfWorks !== undefined ? data.dateOfWorks : existing.dateOfWorks,
    details: data.details !== undefined ? data.details : existing.details,
    assigned_to: data.assignedTo !== undefined ? data.assignedTo : existing.assignedTo,
    priority: data.priority !== undefined ? data.priority : existing.priority,
    status: data.status !== undefined ? data.status : existing.status,
    custom_fields: JSON.stringify(data.customFields !== undefined ? data.customFields : existing.customFields),
    last_updated: now,
  };
  run(`UPDATE tmps SET tmp_number = ?, project_name = ?, request_date = ?, client_name = ?, location = ?, date_of_works = ?, details = ?, assigned_to = ?, priority = ?, status = ?, custom_fields = ?, last_updated = ? WHERE id = ?`,
    [...Object.values(fields), id]);
  return getTmpById(id);
}

function deleteTmp(id) {
  const t = getTmpById(id);
  run('DELETE FROM tmps WHERE id = ?', id);
  return t;
}

function advanceTmp(id) {
  const t = getTmpById(id);
  if (!t) return null;
  const statusOrder = ['new', 'in-progress', 'permits-lga', 'approvals', 'completed'];
  const idx = statusOrder.indexOf(t.status);
  if (idx === -1 || idx >= statusOrder.length - 1) return null;
  const nextStatus = statusOrder[idx + 1];
  const now = new Date().toISOString();
  run('UPDATE tmps SET status = ?, last_updated = ? WHERE id = ?', [nextStatus, now, id]);
  return getTmpById(id);
}

// ===== AUDIT LOG =====
function addAuditLog(action, tmpId, tmpNumber, username, details, timestamp) {
  const ts = timestamp || new Date().toISOString();
  run('INSERT INTO audit_log (id, action, tmp_id, tmp_number, username, details, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [uid(), action, tmpId || '', tmpNumber || '', username, details || '', ts]);
}

function getAuditLog(limit = 200) {
  return query('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?', limit);
}

function clearAuditLog() {
  run('DELETE FROM audit_log');
}

// ===== SETTINGS =====
function getSettings() {
  const row = get('SELECT data FROM settings WHERE id = 1');
  return row ? JSON.parse(row.data) : {};
}

function updateSettings(data) {
  run('UPDATE settings SET data = ? WHERE id = 1', JSON.stringify(data));
}

// ===== BACKUP =====
function getFullBackup() {
  return {
    date: new Date().toISOString(),
    data: getAllTmps(),
    settings: getSettings(),
    auditLog: getAuditLog(99999),
  };
}

function restoreFullBackup(backup) {
  db.exec('DELETE FROM tmps; DELETE FROM audit_log; DELETE FROM settings; DELETE FROM users;');
  const hash = bcrypt.hashSync('admin', 10);
  run('INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)', [uid(), 'admin', hash, 'admin']);
  const insertT = db.prepare(`INSERT INTO tmps (id, tmp_number, project_name, request_date, client_name, location, date_of_works, details, assigned_to, priority, status, custom_fields, last_updated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const t of backup.data || []) {
    insertT.run(t.id || uid(), t.tmpNumber || '', t.projectName || '', t.requestDate || '',
      t.clientName || '', t.location || '', t.dateOfWorks || '', t.details || '',
      t.assignedTo || '', t.priority || 'medium', t.status || 'new',
      JSON.stringify(t.customFields || {}), t.lastUpdated || new Date().toISOString());
  }
  const insertA = db.prepare('INSERT INTO audit_log (id, action, tmp_id, tmp_number, username, details, timestamp) VALUES (?,?,?,?,?,?,?)');
  for (const a of backup.auditLog || []) {
    insertA.run(a.id || uid(), a.action || '', a.tmpId || '', a.tmpNumber || '',
      a.username || '', a.details || '', a.timestamp || new Date().toISOString());
  }
  updateSettings(backup.settings || getSettings());
}

module.exports = { getDb, getUserByUsername, getAllUsers, createUser, updateUser, deleteUser, getAllTmps, getTmpById, createTmp, updateTmp, deleteTmp, advanceTmp, addAuditLog, getAuditLog, clearAuditLog, getSettings, updateSettings, getFullBackup, restoreFullBackup, uid };
