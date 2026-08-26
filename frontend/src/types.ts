export type Role = 'admin' | 'planner' | 'inspector' | 'viewer';

export interface RolePermissions {
  label: string;
  canEdit: boolean;
  canDelete: boolean;
  canManageSettings: boolean;
  canAdvance: boolean;
  desc: string;
}

export interface Status {
  id: string;
  label: string;
  bg: string;
  color: string;
  enabled: boolean;
}

export interface Priority {
  id: string;
  label: string;
  bg: string;
  color: string;
}

export interface FormField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  enabled: boolean;
  gridClass?: string;
  options?: string[];
}

export interface MenuItem {
  id: string;
  label: string;
  icon: string;
  enabled: boolean;
  badge: boolean;
}

export interface Content {
  appName: string;
  appTagline: string;
  viewTitles: Record<string, string>;
  placeholders: Record<string, string>;
  labels: Record<string, string>;
}

export interface User {
  username: string;
  password: string;
  role: Role;
}

export interface Theme {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  sidebarBg: string;
  bg: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  success: string;
  warning: string;
  danger: string;
  purple: string;
  cyan: string;
  radius: string;
  font: string;
  sidebarText: string;
  sidebarNavText: string;
  sidebarHoverBg: string;
  sidebarActiveBg: string;
  sidebarHeaderBorder: string;
  sidebarSubOpacity: string;
  logo: string;
  banner: string;
  favicon: string;
  sidebarBgImg: string;
}

export interface StatusRule {
  canAdvanceRoles: Role[];
}

export interface Automation {
  fromStatus: string;
  toStatus: string;
  delayDays: number;
  enabled: boolean;
}

export interface Client {
  id: string;
  name: string;
  type: 'government' | 'private';
  contact?: string | null;
  phone?: string | null;
}

export interface TMP {
  id: string;
  tmpNumber: string;
  projectName: string;
  requestDate: string;
  clientName: string;
  location: string;
  dateOfWorks: string;
  details: string;
  assignedTo: string;
  priority: string;
  status: string;
  lastUpdated: string;
  customFields: Record<string, unknown>;
  scheduledAdvance?: {
    toStatus: string;
    scheduledDate: string;
  };
}

export interface AuditLogEntry {
  id: string;
  action: string;
  tmpId: string;
  tmpNumber: string;
  username: string;
  timestamp: string;
  details: string;
}

export interface Settings {
  menuItems: MenuItem[];
  tableColumns: Record<string, { key: string; label: string; enabled: boolean }[]>;
  formFields: FormField[];
  customFields: FormField[];
  statuses: Status[];
  priorities: Priority[];
  content: Content;
  theme: Theme;
  users: User[];
  statusRules: Record<string, StatusRule>;
  defaultValues: Record<string, unknown>;
  dashboardWidgets: Record<string, boolean>;
  rowDensity: 'compact' | 'comfortable';
  keyboardShortcuts: Record<string, string>;
  automations: Automation[];
  clients: Client[];
}

export interface AppState {
  tmps: TMP[];
  auditLog: AuditLogEntry[];
  currentView: string;
  searchQuery: string;
  calendarDate: Date;
  currentUser: { username: string; role: Role } | null;
  settings: Settings;
}

export interface ApiError {
  error: string;
}
