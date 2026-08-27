// @ts-nocheck
import { STORAGE_KEY, SETTINGS_KEY, USER_KEY, AUDIT_KEY, TOKEN_KEY } from './utils.js';
import { apiGet, apiPost, isApiAvailable, setApiAvailable } from './api.js';
import type {
  Role,
  Status,
  Priority,
  FormField,
  MenuItem,
  Content,
  User,
  Theme,
  StatusRule,
  Automation,
  Client,
  TMP,
  AuditLogEntry,
  Settings,
} from './types.js';

export const PRIORITIES = ['low', 'medium', 'high'] as const;

export const ROLES: Record<
  Role,
  { label: string; canEdit: boolean; canDelete: boolean; canManageSettings: boolean; canAdvance: boolean; desc: string }
> = {
  admin: {
    label: 'Admin',
    canEdit: true,
    canDelete: true,
    canManageSettings: true,
    canAdvance: true,
    desc: 'Full access \u2014 manage all TMPs, settings, themes, and configuration.',
  },
  planner: {
    label: 'Planner',
    canEdit: true,
    canDelete: true,
    canManageSettings: false,
    canAdvance: true,
    desc: 'Create and edit TMPs, move through workflow.',
  },
  inspector: {
    label: 'Inspector',
    canEdit: false,
    canDelete: false,
    canManageSettings: false,
    canAdvance: true,
    desc: 'View TMPs and advance status. Cannot create or edit.',
  },
  viewer: {
    label: 'Viewer',
    canEdit: false,
    canDelete: false,
    canManageSettings: false,
    canAdvance: false,
    desc: 'Read-only access. View all TMPs, dashboard, and calendar.',
  },
};

export const DEFAULT_STATUSES = [
  { id: 'new', label: 'New', bg: '#dbeafe', color: '#1e40af', enabled: true },
  { id: 'in-progress', label: 'In Progress', bg: '#fef3c7', color: '#92400e', enabled: true },
  { id: 'permits-lga', label: 'Permits / LGA', bg: '#ede9fe', color: '#5b21b6', enabled: true },
  { id: 'approvals', label: 'Approvals', bg: '#cffafe', color: '#0e7490', enabled: true },
  { id: 'completed', label: 'Completed', bg: '#d1fae5', color: '#065f46', enabled: true },
];

export const DEFAULT_PRIORITIES = [
  { id: 'low', label: 'Low', bg: '#d1fae5', color: '#065f46' },
  { id: 'medium', label: 'Medium', bg: '#fef3c7', color: '#92400e' },
  { id: 'high', label: 'High', bg: '#fee2e2', color: '#991b1b' },
];

export const DEFAULT_FORM_FIELDS = [
  { key: 'tmpNumber', label: 'TMP Number', type: 'text', required: false, enabled: true, gridClass: '' },
  { key: 'projectName', label: 'Project Name', type: 'text', required: true, enabled: true, gridClass: '' },
  { key: 'requestDate', label: 'Request Date', type: 'date', required: true, enabled: true, gridClass: '' },
  { key: 'clientName', label: 'Client Name', type: 'text', required: true, enabled: true, gridClass: '' },
  { key: 'location', label: 'Location / Site', type: 'text', required: true, enabled: true, gridClass: 'full-width' },
  { key: 'dateOfWorks', label: 'Date of Works', type: 'date', required: true, enabled: true, gridClass: '' },
  { key: 'assignedTo', label: 'Assigned To', type: 'text', required: false, enabled: true, gridClass: '' },
  { key: 'priority', label: 'Priority', type: 'select', required: false, enabled: true, gridClass: '' },
  {
    key: 'details',
    label: 'Details / Scope of Work',
    type: 'textarea',
    required: false,
    enabled: true,
    gridClass: 'full-width',
  },
];

export const DEFAULT_MENU_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '\ud83d\udcca', enabled: true, badge: false },
  { id: 'new', label: 'New Requests', icon: '\ud83d\udce5', enabled: true, badge: true },
  { id: 'in-progress', label: 'In Progress', icon: '\ud83d\udd04', enabled: true, badge: true },
  { id: 'permits-lga', label: 'Permits / LGA', icon: '\ud83d\udccb', enabled: true, badge: true },
  { id: 'approvals', label: 'Approvals', icon: '\u2705', enabled: true, badge: true },
  { id: 'completed', label: 'Completed', icon: '\u2714\ufe0f', enabled: true, badge: true },
  { id: 'calendar', label: 'Calendar', icon: '\ud83d\udcc5', enabled: true, badge: false },
];

export const DEFAULT_CONTENT = {
  appName: 'Delux TPM CRM',
  appTagline: 'powered by AusGreek Developments',
  viewTitles: {
    dashboard: 'Dashboard',
    new: 'New TMP Requests',
    'in-progress': 'TMPs In Progress',
    'permits-lga': 'TMP Permits / LGA',
    approvals: 'TMP Approvals',
    completed: 'Completed TMPs',
    calendar: 'Calendar View',
    settings: 'Admin Settings',
  },
  placeholders: { search: 'Search...', tmpNumber: 'Auto-generated', assignedTo: 'Team member name' },
  labels: { newRequest: 'New Request', adminSettings: 'Admin Settings' },
};

export const DEFAULT_USERS = [
  { username: 'admin', password: 'admin', role: 'admin' },
  { username: 'planner', password: 'planner', role: 'planner' },
  { username: 'inspector', password: 'inspector', role: 'inspector' },
  { username: 'viewer', password: 'viewer', role: 'viewer' },
];

export const DEFAULT_THEME = {
  primary: '#1e40af',
  primaryLight: '#3b82f6',
  primaryDark: '#1e3a8a',
  sidebarBg: '#1e3a8a',
  bg: '#f1f5f9',
  surface: '#ffffff',
  text: '#1e293b',
  textSecondary: '#64748b',
  border: '#e2e8f0',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  purple: '#8b5cf6',
  cyan: '#06b6d4',
  radius: '8px',
  font: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif",
  sidebarText: '#ffffff',
  sidebarNavText: 'rgba(255,255,255,.75)',
  sidebarHoverBg: 'rgba(255,255,255,.08)',
  sidebarActiveBg: 'rgba(255,255,255,.12)',
  sidebarHeaderBorder: 'rgba(255,255,255,.1)',
  sidebarSubOpacity: '0.7',
  logo: '',
  banner: '',
  favicon: '',
  sidebarBgImg: '',
};

export const DEFAULT_KEYBOARD_SHORTCUTS = {
  newRequest: 'ctrl+n',
  globalSearch: 'ctrl+f',
  exportJSON: 'ctrl+e',
  dashboard: 'ctrl+1',
  calendar: 'ctrl+2',
  adminSettings: 'ctrl+,',
  help: '?',
};

export const DEFAULT_DASHBOARD_WIDGETS = {
  statActiveTMPs: true,
  statPendingApprovals: true,
  statUpcomingWorks: true,
  statHighPriority: true,
  chartStatusDistribution: true,
};

export const DEFAULT_CLIENTS = [
  {
    id: 'client-1',
    name: 'City of Sydney Council',
    type: 'government',
    contact: 'planning@cityofsydney.nsw.gov.au',
    phone: '02 9265 9333',
  },
  {
    id: 'client-2',
    name: 'Transport NSW',
    type: 'government',
    contact: 'tmp@transport.nsw.gov.au',
    phone: '02 8202 2200',
  },
  {
    id: 'client-3',
    name: 'Roads & Maritime Services',
    type: 'government',
    contact: 'permits@rms.nsw.gov.au',
    phone: '13 22 13',
  },
  {
    id: 'client-4',
    name: 'Sydney Water',
    type: 'government',
    contact: 'development@sydneywater.com.au',
    phone: '13 20 92',
  },
  { id: 'client-5', name: 'Ausgrid', type: 'government', contact: 'wayleave@ausgrid.com.au', phone: '13 13 65' },
  {
    id: 'client-6',
    name: 'WestConnex Delivery Authority',
    type: 'government',
    contact: 'tmp@westconnex.com.au',
    phone: '02 8265 4500',
  },
  {
    id: 'client-7',
    name: 'Boral Construction',
    type: 'private',
    contact: 'projects@boral.com.au',
    phone: '02 9033 4300',
  },
  {
    id: 'client-8',
    name: 'Lendlease Engineering',
    type: 'private',
    contact: 'tmp@lendlease.com',
    phone: '02 9230 7111',
  },
  {
    id: 'client-9',
    name: 'John Holland Group',
    type: 'private',
    contact: 'traffic@johnholland.com.au',
    phone: '03 8652 7777',
  },
  { id: 'client-10', name: 'CPB Contractors', type: 'private', contact: 'tmp@cpbcon.com.au', phone: '02 9462 3000' },
  { id: 'client-11', name: 'Downer Group', type: 'private', contact: 'traffic@downergroup.com', phone: '02 9462 3000' },
  {
    id: 'client-12',
    name: 'Fulton Hogan Industries',
    type: 'private',
    contact: 'tmp@fultonhogan.com.au',
    phone: '02 9797 8600',
  },
];

function buildDefaultTableColumns() {
  const cols = {};
  ['new', 'in-progress', 'permits-lga', 'approvals', 'completed'].forEach((s) => {
    cols[s] = [
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
  return cols;
}

export const DEFAULT_TABLE_COLUMNS = buildDefaultTableColumns();

function buildDefaultStatusRules() {
  const rules = {};
  ['new', 'in-progress', 'permits-lga', 'approvals', 'completed'].forEach((s, i, a) => {
    if (i < a.length - 1) rules[s] = { canAdvanceRoles: ['admin', 'planner', 'inspector'] };
  });
  return rules;
}

export const DEFAULT_STATUS_RULES = buildDefaultStatusRules();

function buildDefaultSettings() {
  return {
    menuItems: JSON.parse(JSON.stringify(DEFAULT_MENU_ITEMS)),
    tableColumns: JSON.parse(JSON.stringify(DEFAULT_TABLE_COLUMNS)),
    formFields: JSON.parse(JSON.stringify(DEFAULT_FORM_FIELDS)),
    customFields: [],
    statuses: JSON.parse(JSON.stringify(DEFAULT_STATUSES)),
    priorities: JSON.parse(JSON.stringify(DEFAULT_PRIORITIES)),
    content: JSON.parse(JSON.stringify(DEFAULT_CONTENT)),
    theme: JSON.parse(JSON.stringify(DEFAULT_THEME)),
    users: JSON.parse(JSON.stringify(DEFAULT_USERS)),
    statusRules: JSON.parse(JSON.stringify(DEFAULT_STATUS_RULES)),
    defaultValues: {},
    dashboardWidgets: JSON.parse(JSON.stringify(DEFAULT_DASHBOARD_WIDGETS)),
    rowDensity: 'comfortable',
    keyboardShortcuts: JSON.parse(JSON.stringify(DEFAULT_KEYBOARD_SHORTCUTS)),
    automations: [],
    clients: JSON.parse(JSON.stringify(DEFAULT_CLIENTS)),
  };
}

function getMockData() {
  const td = todayStr();
  const d = (o) => {
    const dt = new Date(td + 'T00:00:00');
    dt.setDate(dt.getDate() + o);
    return dt.toISOString().slice(0, 10);
  };
  return [
    {
      id: 'mock-1',
      tmpNumber: 'TMP-2024-001',
      projectName: 'Main Street Utility Works',
      requestDate: d(-14),
      clientName: 'City Water Authority',
      location: '123 Main Street, Sydney CBD',
      dateOfWorks: d(5),
      details: 'Installation of new water main requiring lane closures.',
      assignedTo: 'Sarah Chen',
      priority: 'high',
      status: 'new',
      lastUpdated: d(-10) + 'T09:30:00Z',
      customFields: {},
    },
    {
      id: 'mock-2',
      tmpNumber: 'TMP-2024-002',
      projectName: 'Highway Bridge Inspection',
      requestDate: d(-21),
      clientName: 'Transport NSW',
      location: 'Warringah Expressway, North Sydney',
      dateOfWorks: d(12),
      details: 'Routine structural inspection of bridge #4.',
      assignedTo: 'Michael Torres',
      priority: 'medium',
      status: 'in-progress',
      lastUpdated: d(-5) + 'T14:15:00Z',
      customFields: {},
    },
    {
      id: 'mock-3',
      tmpNumber: 'TMP-2024-003',
      projectName: 'Road Resurfacing Program',
      requestDate: d(-30),
      clientName: 'City of Sydney Council',
      location: 'Elizabeth Street, Surry Hills',
      dateOfWorks: d(18),
      details: 'Asphalt resurfacing. Night works only.',
      assignedTo: 'Emily Watson',
      priority: 'high',
      status: 'permits-lga',
      lastUpdated: d(-8) + 'T11:00:00Z',
      customFields: {},
    },
    {
      id: 'mock-4',
      tmpNumber: 'TMP-2024-004',
      projectName: 'Traffic Signal Upgrade',
      requestDate: d(-45),
      clientName: 'Roads & Maritime Services',
      location: 'Pacific Highway & Berry Street',
      dateOfWorks: d(25),
      details: 'Upgrade of traffic signal controllers.',
      assignedTo: 'David Park',
      priority: 'medium',
      status: 'approvals',
      lastUpdated: d(-3) + 'T16:45:00Z',
      customFields: {},
    },
    {
      id: 'mock-5',
      tmpNumber: 'TMP-2024-005',
      projectName: 'Sidewalk Construction',
      requestDate: d(-60),
      clientName: 'Parramatta City Council',
      location: 'Church Street, Parramatta',
      dateOfWorks: d(-10),
      details: 'New footpath construction.',
      assignedTo: 'Sarah Chen',
      priority: 'low',
      status: 'completed',
      lastUpdated: d(-15) + 'T10:00:00Z',
      customFields: {},
    },
  ];
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function nowISO() {
  return new Date().toISOString();
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const state: {
  tmps: TMP[];
  auditLog: AuditLogEntry[];
  currentView: string;
  searchQuery: string;
  calendarDate: Date;
  currentUser: { username: string; role: Role } | null;
  settings: Settings;
} = {
  tmps: [],
  auditLog: [],
  currentView: 'dashboard',
  searchQuery: '',
  calendarDate: new Date(),
  currentUser: null,
  settings: buildDefaultSettings(),
};

export let editingId: string | null = null;
export let viewingId: string | null = null;
export let settingsTab: string = 'general';

export function setEditingId(val: string | null) {
  editingId = val;
}
export function setViewingId(val: string | null) {
  viewingId = val;
}
export function setSettingsTab(val: string) {
  settingsTab = val;
}

export function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tmps));
  } catch (_) {}
}

export function persistSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  } catch (_) {}
}

export function persistUser() {
  if (state.currentUser) {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(state.currentUser));
    } catch (_) {}
  } else {
    try {
      localStorage.removeItem(USER_KEY);
    } catch (_) {}
  }
}

export function persistAuditLog() {
  try {
    localStorage.setItem(AUDIT_KEY, JSON.stringify(state.auditLog));
  } catch (_) {}
}

export async function loadData() {
  try {
    const r = localStorage.getItem(STORAGE_KEY);
    if (r) {
      const p = JSON.parse(r);
      if (Array.isArray(p) && p.every((v) => v && typeof v === 'object' && v.id)) {
        state.tmps = p;
        return;
      }
    }
  } catch (_) {}
  try {
    const serverData = await apiGet('/api/tmps');
    if (serverData && Array.isArray(serverData)) {
      state.tmps = serverData;
      setApiAvailable(true);
      persist();
      return;
    }
  } catch (_) {}
  state.tmps = getMockData();
  persist();
}

export async function loadSettings() {
  const serverData = await apiGet('/api/settings');
  if (serverData && serverData.menuItems) {
    state.settings = serverData;
    ensureSettingsDefaults();
    setApiAvailable(true);
    persistSettings();
    return;
  }
  try {
    const r = localStorage.getItem(SETTINGS_KEY);
    if (r) {
      const p = JSON.parse(r);
      if (
        p &&
        p.menuItems &&
        Array.isArray(p.menuItems) &&
        p.statuses &&
        Array.isArray(p.statuses) &&
        p.priorities &&
        Array.isArray(p.priorities) &&
        p.content &&
        p.theme
      ) {
        state.settings = p;
        ensureSettingsDefaults();
        return;
      }
    }
  } catch (_) {}
  state.settings = buildDefaultSettings();
  persistSettings();
}

function ensureSettingsDefaults() {
  if (!state.settings.users) state.settings.users = JSON.parse(JSON.stringify(DEFAULT_USERS));
  if (!state.settings.statusRules) state.settings.statusRules = JSON.parse(JSON.stringify(DEFAULT_STATUS_RULES));
  if (!state.settings.defaultValues) state.settings.defaultValues = {};
  if (!state.settings.dashboardWidgets)
    state.settings.dashboardWidgets = JSON.parse(JSON.stringify(DEFAULT_DASHBOARD_WIDGETS));
  if (!state.settings.rowDensity) state.settings.rowDensity = 'comfortable';
  if (!state.settings.keyboardShortcuts)
    state.settings.keyboardShortcuts = JSON.parse(JSON.stringify(DEFAULT_KEYBOARD_SHORTCUTS));
  if (!state.settings.automations) state.settings.automations = [];
  if (!state.settings.clients) state.settings.clients = JSON.parse(JSON.stringify(DEFAULT_CLIENTS));
  if (state.settings.customFields) {
    state.settings.customFields = state.settings.customFields.filter(
      (f) => !['type', 'lga'].includes((f.label || '').toLowerCase().trim())
    );
  }
}

export function loadUser() {
  try {
    const r = localStorage.getItem(USER_KEY);
    if (r) {
      const p = JSON.parse(r);
      if (p && p.role && p.username && ROLES[p.role]) {
        state.currentUser = p;
        return;
      }
    }
  } catch (_) {}
  state.currentUser = null;
}

export async function loadAuditLog() {
  try {
    const serverData = await apiGet('/api/audit');
    if (serverData && Array.isArray(serverData)) {
      state.auditLog = serverData;
      persistAuditLog();
      return;
    }
  } catch (_) {}
  try {
    const r = localStorage.getItem(AUDIT_KEY);
    if (r) {
      const p = JSON.parse(r);
      if (Array.isArray(p) && p.every((v) => v && typeof v === 'object' && v.id)) {
        state.auditLog = p;
        return;
      }
    }
  } catch (_) {}
  state.auditLog = [];
}

export function addAuditLog(action, tmpId, tmpNumber, details) {
  const entry = {
    id: uid(),
    action,
    tmpId: tmpId || '',
    tmpNumber: tmpNumber || '',
    username: state.currentUser ? state.currentUser.username : 'system',
    timestamp: nowISO(),
    details: details || '',
  };
  state.auditLog.push(entry);
  persistAuditLog();
  if (isApiAvailable()) apiPost('/api/audit', entry).catch(() => {});
}

export function userRole() {
  return state.currentUser ? state.currentUser.role : 'viewer';
}

export function canEdit() {
  return ROLES[userRole()] && ROLES[userRole()].canEdit;
}

export function canDelete() {
  return ROLES[userRole()] && ROLES[userRole()].canDelete;
}

export function canManageSettings() {
  return ROLES[userRole()] && ROLES[userRole()].canManageSettings;
}

export function canAdvance() {
  return ROLES[userRole()] && ROLES[userRole()].canAdvance;
}

export function canAdvanceStatus(statusId) {
  if (!canAdvance()) return false;
  const rules = state.settings.statusRules || {};
  const rule = rules[statusId];
  if (rule && rule.canAdvanceRoles && rule.canAdvanceRoles.length) {
    return rule.canAdvanceRoles.includes(userRole());
  }
  return true;
}

export function getStatusLabel(id) {
  const s = (state.settings.statuses || DEFAULT_STATUSES).find((x) => x.id === id);
  return s ? s.label : id;
}

export function getStatusStyle(id) {
  const s = (state.settings.statuses || DEFAULT_STATUSES).find((x) => x.id === id);
  return s ? `background:${s.bg};color:${s.color}` : '';
}

export function getPriorityStyle(id) {
  const p = (state.settings.priorities || DEFAULT_PRIORITIES).find((x) => x.id === id);
  return p ? `background:${p.bg};color:${p.color}` : '';
}

export function getPriorityLabel(id) {
  const p = (state.settings.priorities || DEFAULT_PRIORITIES).find((x) => x.id === id);
  return p ? p.label : id;
}

export function getContent(key) {
  const keys = key.split('.');
  let o = state.settings.content;
  for (const k of keys) {
    if (o && o[k] !== undefined) o = o[k];
    else return key;
  }
  return o;
}

export function appName() {
  return getContent('appName');
}
export function appTagline() {
  return getContent('appTagline');
}

export function getEnabledFormFields() {
  return state.settings.formFields.filter((f) => f.enabled).concat(state.settings.customFields || []);
}

export function getAllFormFields() {
  return state.settings.formFields.concat(state.settings.customFields || []);
}

export function getFormFieldsForEdit() {
  return getEnabledFormFields();
}

export function getEnabledMenuItems() {
  return state.settings.menuItems.filter((m) => m.enabled);
}

export function getFilteredTmps() {
  let l = state.tmps;
  const q = state.searchQuery.toLowerCase().trim();
  if (q) {
    l = l.filter(
      (t) =>
        (t.clientName || '').toLowerCase().includes(q) ||
        (t.location || '').toLowerCase().includes(q) ||
        (t.tmpNumber || '').toLowerCase().includes(q) ||
        (t.projectName || '').toLowerCase().includes(q) ||
        (t.assignedTo || '').toLowerCase().includes(q)
    );
  }
  return l;
}

export function getTmpsByStatus(s) {
  return getFilteredTmps().filter((t) => t.status === s);
}

export function getCountByStatus(s) {
  return state.tmps.filter((t) => t.status === s).length;
}

export function getUpcomingWorks(days) {
  const td = todayStr();
  const lim = new Date(td + 'T00:00:00');
  lim.setDate(lim.getDate() + days);
  const ls = lim.toISOString().slice(0, 10);
  return state.tmps.filter(
    (t) => t.dateOfWorks && t.dateOfWorks >= td && t.dateOfWorks <= ls && t.status !== 'completed'
  );
}

export function getActiveStatuses() {
  return (state.settings.statuses || DEFAULT_STATUSES).filter((s) => s.enabled);
}

export function getEnabledColumns(status) {
  const c = state.settings.tableColumns[status] || DEFAULT_TABLE_COLUMNS[status] || [];
  return c.filter((x) => x.enabled);
}

export function getDensityClass() {
  const d = state.settings.rowDensity || 'comfortable';
  return d === 'compact' ? 'row-density-compact' : 'row-density-comfortable';
}

export function getClientType(name) {
  if (!name || !state.settings.clients) return '';
  const c = state.settings.clients.find((x) => x.name === name);
  return c ? c.type : '';
}

export function createTmp(data) {
  const year = new Date().getFullYear();
  const prefix = 'TMP-' + year + '-';
  const existing = state.tmps
    .filter((t) => t.tmpNumber && t.tmpNumber.startsWith(prefix))
    .map((t) => parseInt(t.tmpNumber.slice(prefix.length), 10))
    .filter((n) => !isNaN(n));
  const nextNum = existing.length ? Math.max(...existing) + 1 : 1;
  const tmp = {
    id: uid(),
    tmpNumber: data.tmpNumber || prefix + String(nextNum).padStart(3, '0'),
    projectName: data.projectName || '',
    requestDate: data.requestDate || todayStr(),
    clientName: data.clientName || '',
    location: data.location || '',
    dateOfWorks: data.dateOfWorks || '',
    details: data.details || '',
    assignedTo: data.assignedTo || '',
    priority: data.priority || 'medium',
    status: data.status || 'new',
    lastUpdated: nowISO(),
    customFields: data.customFields || {},
  };
  state.tmps.push(tmp);
  persist();
  addAuditLog('create', tmp.id, tmp.tmpNumber, 'Created by ' + state.currentUser.username);
  return tmp;
}

export function updateTmp(id, data) {
  const idx = state.tmps.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  const old = state.tmps[idx];
  state.tmps[idx] = { ...old, ...data, lastUpdated: nowISO() };
  persist();
  addAuditLog('update', id, old.tmpNumber, 'Updated by ' + state.currentUser.username);
  return state.tmps[idx];
}

export function deleteTmp(id) {
  const t = state.tmps.find((x) => x.id === id);
  state.tmps = state.tmps.filter((x) => x.id !== id);
  persist();
  if (t) addAuditLog('delete', id, t.tmpNumber, 'Deleted by ' + state.currentUser.username);
}

export function advanceStatus(id, skipSchedule) {
  const t = state.tmps.find((x) => x.id === id);
  if (!t) return;
  const statuses = getActiveStatuses();
  const idx = statuses.findIndex((s) => s.id === t.status);
  if (idx === -1 || idx >= statuses.length - 1) return;
  if (!skipSchedule) {
    const rules = state.settings.automations || [];
    const rule = rules.find((r) => r.enabled !== false && r.fromStatus === t.status && r.delayDays > 0);
    if (rule) {
      const schedDate = new Date();
      schedDate.setDate(schedDate.getDate() + rule.delayDays);
      t.scheduledAdvance = { toStatus: statuses[idx + 1].id, scheduledDate: schedDate.toISOString().slice(0, 10) };
      t.lastUpdated = nowISO();
      persist();
      addAuditLog(
        'schedule',
        id,
        t.tmpNumber,
        'Scheduled advance to "' +
          getStatusLabel(t.scheduledAdvance.toStatus) +
          '" in ' +
          rule.delayDays +
          ' day(s) by ' +
          state.currentUser.username
      );
      return;
    }
  }
  t.scheduledAdvance = null;
  const fromS = t.status;
  const toS = statuses[idx + 1].id;
  t.status = toS;
  t.lastUpdated = nowISO();
  persist();
  addAuditLog(
    'advance',
    id,
    t.tmpNumber,
    'Advanced from "' + getStatusLabel(fromS) + '" to "' + getStatusLabel(toS) + '" by ' + state.currentUser.username
  );
}

export function processScheduledAdvances() {
  const today = todayStr();
  let changed = false;
  state.tmps.forEach((t) => {
    if (!t.scheduledAdvance || !t.scheduledAdvance.scheduledDate) return;
    if (t.scheduledAdvance.scheduledDate <= today) {
      const toStatus = t.scheduledAdvance.toStatus;
      const fromS = t.status;
      t.status = toStatus;
      t.scheduledAdvance = null;
      t.lastUpdated = nowISO();
      addAuditLog(
        'auto-advance',
        t.id,
        t.tmpNumber,
        'Auto-advanced from "' +
          getStatusLabel(fromS) +
          '" to "' +
          getStatusLabel(toStatus) +
          '" (scheduled delay elapsed)'
      );
      changed = true;
    }
  });
  return changed;
}
