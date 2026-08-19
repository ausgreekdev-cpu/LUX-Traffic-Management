// RBAC permission catalog for the settings hub. The matrix is stored in the
// backend under the `rbac` settings group and applied to frontend navigation /
// route visibility. Server-side role checks remain the authoritative gate.
// Personas map onto the existing roles: Traffic Controllers (staff), CAD
// Designers (staff), Approving Engineers (manager), Shire/Council Inspectors
// (client, read-only), Developers (developer).

export const ROLES = ['developer', 'manager', 'staff', 'client'];

export const ROLE_LABELS = {
  developer: 'Developer',
  manager: 'Manager',
  staff: 'Staff',
  client: 'Client'
};

export const PERMISSION_DEFS = [
  { key: 'dashboard', label: 'Dashboard', description: 'View the dashboard.' },
  { key: 'field', label: 'Field mode', description: 'Open the mobile field mode.' },
  { key: 'view_tmps', label: 'View TMPs', description: 'Browse traffic management plans.' },
  { key: 'manage_tmps', label: 'Create / edit TMPs', description: 'Create, update and version TMPs.' },
  { key: 'view_kanban', label: 'View Kanban', description: 'Open the Kanban board.' },
  { key: 'manage_kanban', label: 'Manage Kanban rules', description: 'Configure columns, WIP limits and DoD checklists.' },
  { key: 'view_projects', label: 'View projects', description: 'Browse projects.' },
  { key: 'view_permits', label: 'View permits', description: 'Browse permit records.' },
  { key: 'manage_permits', label: 'Create / edit permits', description: 'Create, update and manage permits and fees.' },
  { key: 'view_authorities', label: 'View authorities', description: 'Browse the WA authorities directory.' },
  { key: 'time_tracking', label: 'Time tracking', description: 'Record billable time entries.' },
  { key: 'manage_correspondence', label: 'Correspondence', description: 'Review inbound webhook correspondence.' },
  { key: 'view_analytics', label: 'Analytics', description: 'View analytics and reports.' },
  { key: 'view_clients', label: 'View clients', description: 'Browse clients.' },
  { key: 'manage_clients', label: 'Manage clients', description: 'Create and edit clients.' },
  { key: 'view_sites', label: 'View sites', description: 'Browse site records.' },
  { key: 'manage_sites', label: 'Manage sites', description: 'Create and edit sites.' },
  { key: 'manage_users', label: 'Manage users', description: 'Create, edit and delete user accounts.' },
  { key: 'access_settings', label: 'Access settings', description: 'Open the settings hub.' },
  { key: 'manage_branding', label: 'Manage branding', description: 'Edit themes, assets, PDF and email branding.' },
  { key: 'manage_workflows', label: 'Manage workflows', description: 'Edit workflow templates and checklists.' },
  { key: 'manage_automations', label: 'Manage automation', description: 'Configure automation rules and email templates.' },
  { key: 'manage_export_standards', label: 'Manage export standards', description: 'Configure speed-zone colours, CAD/GIS layers and the icon library.' }
];

const TRUE = (keys) => Object.fromEntries(keys.map((k) => [k, true]));

// Default matrix mirrors today's hard-coded visibility — an unconfigured matrix
// (or a missing role row) falls back to these.
const DEFAULTS = {
  developer: TRUE(PERMISSION_DEFS.map((p) => p.key)),
  manager: TRUE([
    'dashboard', 'field', 'view_tmps', 'manage_tmps', 'view_kanban', 'manage_kanban',
    'view_projects', 'view_permits', 'manage_permits', 'view_authorities', 'time_tracking',
    'manage_correspondence', 'view_analytics', 'view_clients', 'manage_clients', 'view_sites', 'manage_sites'
  ]),
  staff: TRUE([
    'dashboard', 'field', 'view_tmps', 'manage_tmps', 'view_kanban', 'view_projects',
    'view_permits', 'manage_permits', 'view_authorities', 'time_tracking', 'view_analytics',
    'view_clients', 'manage_clients', 'view_sites', 'manage_sites'
  ]),
  client: TRUE([
    'dashboard', 'field', 'view_tmps', 'view_kanban', 'view_projects', 'view_permits',
    'view_authorities', 'view_clients'
  ])
};

export function buildDefaultMatrix() {
  const matrix = {};
  for (const role of ROLES) matrix[role] = { ...DEFAULTS[role] };
  return matrix;
}

// A permission is allowed when the stored matrix pins it, otherwise the default.
export function permissionAllowed(role, key, matrix) {
  const row = matrix?.[role];
  if (row && typeof row[key] === 'boolean') return row[key];
  return !!DEFAULTS[role]?.[key];
}

// Merge any partially-stored matrix onto the defaults so the editor always shows
// every permission for every role.
export function mergedMatrix(matrix) {
  const base = buildDefaultMatrix();
  if (!matrix || typeof matrix !== 'object') return base;
  for (const role of ROLES) {
    const row = matrix[role];
    if (row && typeof row === 'object') base[role] = { ...base[role], ...row };
  }
  return base;
}