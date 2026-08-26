# Traffic Management Plan Dashboard — Architecture & Hidden Backend

> **Single-file SPA** (`index.html`, ~1280 lines) — all CSS, HTML, and JavaScript in one file.  
> **Data persists** entirely in `localStorage` — no server, no database, no network.

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────┐
│                  index.html                       │
│  ┌───────────┐  ┌──────────┐  ┌───────────────┐ │
│  │   Login    │  │  Sidebar  │  │  Content Area  │ │
│  │  Overlay   │  │  (nav)   │  │  (views)       │ │
│  └───────────┘  └──────────┘  └───────────────┘ │
│  ┌──────────────────────────────────────────────┐ │
│  │              State Object (JS)                │ │
│  │  ┌──────┐ ┌──────────┐ ┌────────┐ ┌──────┐  │ │
│  │  │ tmps │ │settings │ │auditLog│ │user  │  │ │
│  │  │(arr) │ │ (obj)   │ │ (arr)  │ │(obj) │  │ │
│  │  └──────┘ └──────────┘ └────────┘ └──────┘  │ │
│  └──────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────┐ │
│  │           localStorage (4 keys)               │ │
│  │  tmp_dashboard_data  ──── TMP records         │ │
│  │  tmp_dashboard_settings ── all config/settings│ │
│  │  tmp_current_user   ──── logged-in session    │ │
│  │  tmp_dashboard_audit ──── audit log entries   │ │
│  └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### Lifecycle

```
DOMContentLoaded
  → init()
    → loadData()        — reads TMPs from localStorage (or seeds 5 mock)
    → loadSettings()    — reads settings from localStorage (or defaults)
    → loadUser()        — reads persisted login session
    → loadAuditLog()    — reads audit entries from localStorage
    → setupEvents()     — wires all DOM event listeners
    → showLogin() or navigate('dashboard')
```

---

## 2. State Management (the "Backend")

The `state` object is the single source of truth. Every function reads from and writes to `state`, then persists to `localStorage`.

### State Shape

```js
state = {
  tmps: [], // Array of TMP record objects
  auditLog: [], // Array of audit entry objects
  currentView: 'dashboard', // Which view is shown
  searchQuery: '', // Current search filter text
  calendarDate: Date, // Current calendar month/year
  currentUser: { username, role }, // Logged-in user or null
  settings: {
    menuItems: [], // Nav menu items (order, icon, label, enabled)
    tableColumns: {}, // Column visibility per status view
    formFields: [], // Built-in form field definitions
    customFields: [], // User-defined custom form fields
    statuses: [], // Workflow status definitions
    priorities: [], // Priority level definitions
    content: {}, // All text labels (app name, titles, placeholders)
    theme: {}, // Color scheme, images, fonts, radius
    users: [], // Managed user accounts (username/password/role)
    statusRules: {}, // Per-status role advance permissions
    defaultValues: {}, // Default field values for new forms
    dashboardWidgets: {}, // Toggle visibility of stat cards & chart
    rowDensity: 'comfortable', // Table row spacing
    keyboardShortcuts: {}, // Configurable key bindings
  },
};
```

### Persistence Layer

| localStorage Key         | Data                | Persist Trigger                                               |
| ------------------------ | ------------------- | ------------------------------------------------------------- |
| `tmp_dashboard_data`     | `state.tmps`        | `persist()` — called after every create/update/delete/advance |
| `tmp_dashboard_settings` | `state.settings`    | `persistSettings()` — called after every settings change      |
| `tmp_current_user`       | `state.currentUser` | `persistUser()` — called on login/logout                      |
| `tmp_dashboard_audit`    | `state.auditLog`    | `persistAuditLog()` — called after every audit entry          |

---

## 3. Status Workflow Engine

This is the core business logic — a state machine that controls TMP progression.

### Workflow Flow

```
  new  ──→  in-progress  ──→  permits-lga  ──→  approvals  ──→  completed
```

### Implementation (`advanceStatus`)

```
advanceStatus(id):
  1. Find TMP by id
  2. Get active (enabled) statuses list from settings
  3. Find current status index in list
  4. If not at last position, set TMP.status = next status
  5. Update lastUpdated timestamp
  6. persist() to localStorage
  7. addAuditLog('advance', ...)
```

### Status Transition Rules (feature 5)

Each status can have a `canAdvanceRoles` array. The function `canAdvanceStatus(statusId)` checks:

```
canAdvanceStatus(statusId):
  if user's role doesn't have global canAdvance → false
  if statusRules[statusId].canAdvanceRoles exists
    → check if user's role is in that array
  else → true (default allow)
```

This is enforced at **4 control points**:

1. Table view "advance" button rendering
2. Detail modal "advance" button rendering
3. Main click handler advance case
4. Modal footer advance case

---

## 4. Permissions & Role System

### Role Definitions

```js
ROLES = {
  admin: { canEdit: true, canDelete: true, canManageSettings: true, canAdvance: true },
  planner: { canEdit: true, canDelete: true, canManageSettings: false, canAdvance: true },
  inspector: { canEdit: false, canDelete: false, canManageSettings: false, canAdvance: true },
  viewer: { canEdit: false, canDelete: false, canManageSettings: false, canAdvance: false },
};
```

### Permission Helpers

| Function              | What it Checks                                       |
| --------------------- | ---------------------------------------------------- |
| `canEdit()`           | Can create/edit TMPs                                 |
| `canDelete()`         | Can delete TMPs                                      |
| `canManageSettings()` | Can access admin settings console                    |
| `canAdvance()`        | Can advance status at all (global)                   |
| `canAdvanceStatus(s)` | Can advance from a specific status (status-specific) |

### Enforcement Points

- **Login**: Only valid username/password combinations from `settings.users` allowed
- **Admin button**: Hidden for non-admin via `updateAdminBtn()`
- **New Request button**: Hidden for non-editors via `updateNewBtn()`
- **Table action buttons**: Conditionally rendered per permission
- **Detail modal buttons**: Conditionally rendered per permission
- **Settings navigation**: Blocked if `canManageSettings()` is false
- **Admin settings tabs**: All tabs accessible only to admin role

---

## 5. Theme Engine

### CSS Custom Properties

The theme is stored as 14+ CSS custom properties on `:root`. The `applyTheme(theme)` function maps theme keys to CSS variables:

```js
const map = {
  primary: '--primary', primaryLight: '--primary-light', ...
  sidebarBg: '--sidebar-bg', sidebarText: '--sidebar-text', ...
}
```

### Brand Images

Images are stored as **base64 data URIs** in `settings.theme`:

- `logo` — shown in sidebar header + login screen
- `banner` — shown at top of login card
- `favicon` — browser tab icon
- `sidebarBgImg` — background image for sidebar

Upload via `<input type="file">` with `FileReader.readAsDataURL()`. Removed via button that sets the key to `''`.

`applyBrandImages()` is called from:

- `loadSettings()`
- `persistSettings()`
- `showLogin()`
- `handleLogin()`
- Image upload/remove handlers

---

## 6. Settings Console Architecture

### Tab System

The admin settings console has **18 tabs**:

```
General | Menu | Statuses | Priorities | Content | Theme | Columns |
Form Fields | Custom Fields | Users | Transitions | Defaults |
Widgets | Density | Shortcuts | Export/Import | Backup | Audit Log
```

Each tab has a corresponding `render*()` function that returns HTML. The `settingsTab` state variable tracks which tab is active. Tabs switch by clicking `[data-stab]` elements, which sets `settingsTab` and calls `render()`.

### Setting Change Pattern

Settings use **delegated change events** on `#contentArea`:

```js
document.getElementById('contentArea').addEventListener('change', e => {
  const el = e.target;
  if (el.classList.contains('s-menu-label')) { ... }
  if (el.classList.contains('s-status-bg')) { ... }
  // ... ~20+ handlers
});
```

Each handler reads the element's `value` (or `checked`), updates `state.settings`, calls `persistSettings()`, and optionally calls `render()` or `renderSidebar()`.

---

## 7. Custom Fields System

Custom fields are stored in `settings.customFields` as an array of:

```js
{ key: 'custom_traffic_control_type', label: 'Traffic Control Type', type: 'select',
  required: false, options: ['Lane Closure', 'Detour', 'Shoulder Work'], gridClass: '', enabled: true }
```

- Fields are added via a palette click → form appears → save
- The key is auto-generated from the label: `custom_` + lowercase + underscores
- Fields render in the TMP form via `getFormFieldsForEdit()` which concatenates `formFields` + `customFields` (both filtered to enabled only)
- Custom field values are stored in `tmp.customFields` as a sub-object
- On load, fields labelled "Type" or "LGA" are stripped (to avoid conflicts)

---

## 8. Audit Log (Feature 2)

### Data Structure

```js
{ id: 'unique-id', action: 'create|update|delete|advance',
  tmpId: 'tmp-uuid', tmpNumber: 'TMP-2024-001',
  username: 'admin', timestamp: '2026-07-15T...', details: 'Created by admin' }
```

### Hook Points

```js
createTmp()   → addAuditLog('create', ...)    /* after insert */
updateTmp()   → addAuditLog('update', ...)    /* after update */
deleteTmp()   → addAuditLog('delete', ...)    /* after delete */
advanceStatus() → addAuditLog('advance', ...) /* after status change */
```

### View

- Admin settings → Audit Log tab
- Shows last 200 entries (most recent first)
- Color-coded action badges (green=create, blue=update, red=delete, yellow=advance)
- Clear button with confirmation

---

## 9. User Manager (Feature 1)

### Authentication Flow (before vs after)

**Before (original):**

```
User selects Name + Role from dropdown → direct login, no validation
```

**After:**

```
User enters Username + Password
  → lookup in settings.users[] for matching username+password
  → found: login with that user's role
  → not found: show error message
```

### Default Users

| Username    | Password    | Role      |
| ----------- | ----------- | --------- |
| `admin`     | `admin`     | admin     |
| `planner`   | `planner`   | planner   |
| `inspector` | `inspector` | inspector |
| `viewer`    | `viewer`    | viewer    |

### User CRUD (Admin Settings → Users tab)

- **Add**: creates user with default username/password, edit to customize
- **Edit**: inline form with username, password (leave blank to keep), role select
- **Delete**: removes user (prevent deleting the last user)

---

## 10. Export/Import & Backup (Features 3 & 4)

### Export

```js
exportJSON() — downloads getFilteredTmps() as .json
exportCSV()  — downloads getFilteredTmps() as .csv with quoted fields
```

### Import

```js
importJSON(str) — parses JSON array, calls createTmp() for each valid object
```

### Backup

```js
backupAll() — exports { data: tmps, settings, auditLog } as .json
restoreAll(str) — validates structure, confirms, replaces all state + localStorage
```

### Download Mechanism

Uses a programmatic `<a>` element with `URL.createObjectURL(blob)`:

```js
const blob = new Blob([content], { type: mime });
const a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = filename;
a.click();
URL.revokeObjectURL(a.href);
```

---

## 11. Table Row Density (Feature 8)

Two CSS classes applied to the table container:

- `row-density-compact` — smaller padding, smaller font
- `row-density-comfortable` — standard spacing

`getDensityClass()` returns the class based on `state.settings.rowDensity`.

---

## 12. Dashboard Widget Config (Feature 7)

The `renderDashboard()` function checks `state.settings.dashboardWidgets` before rendering each stat card and the chart:

```js
if (w.statActiveTMPs !== false) stats += `<div class="stat-card">...</div>`;
if (w.statUpcomingWorks !== false) stats += `<div class="stat-card">...</div>`;
// ...
const chart = w.chartStatusDistribution !== false ? `<div class="chart-container">...</div>` : '';
```

---

## 13. Default Field Values (Feature 6)

When opening a new TMP form (`openFormModal(null)`), default values from `state.settings.defaultValues` are applied:

```js
if (!tmp) {
  const dv = state.settings.defaultValues || {};
  Object.keys(dv).forEach((k) => {
    if (dv[k] !== '' && dv[k] !== undefined) {
      if (k.startsWith('custom_')) {
        d.customFields[k] = dv[k];
      } else {
        d[k] = dv[k];
      }
    }
  });
}
```

---

## 14. Keyboard Shortcuts (Feature 9)

### Shortcut Matching

```js
const combo =
  (e.ctrlKey ? 'ctrl+' : '') + (e.shiftKey ? 'shift+' : '') + (e.altKey ? 'alt+' : '') + e.key.toLowerCase();
```

### Default Shortcuts

| Key      | Action              |
| -------- | ------------------- |
| `Ctrl+N` | New TMP Request     |
| `Ctrl+F` | Focus search bar    |
| `Ctrl+E` | Export JSON         |
| `Ctrl+1` | Go to Dashboard     |
| `Ctrl+2` | Go to Calendar      |
| `Ctrl+,` | Admin Settings      |
| `?`      | Show shortcuts help |

### Help Modal

Triggered by pressing `?` or `Ctrl+/`. Builds a table of all configured shortcuts with descriptions and opens it in the app's modal dialog.

---

## 15. Event Architecture

All events are set up in `setupEvents()`:

| Event                     | Target           | Purpose                                                                 |
| ------------------------- | ---------------- | ----------------------------------------------------------------------- |
| `submit`                  | `#loginForm`     | Validate credentials, login                                             |
| `click`                   | `#userBadge`     | Logout                                                                  |
| `click`                   | `#sidebarNav`    | Navigate views                                                          |
| `click`                   | `#sidebarToggle` | Toggle sidebar on mobile                                                |
| `input`                   | `#globalSearch`  | Filter TMPs (debounced 250ms)                                           |
| `click`                   | `#newRequestBtn` | Open new TMP form                                                       |
| `click`                   | `#adminBtn`      | Toggle settings view                                                    |
| `click`                   | `#modalClose`    | Close modal                                                             |
| `click`                   | `#modalOverlay`  | Close modal (backdrop click)                                            |
| `keydown`                 | `document`       | Escape to close modal                                                   |
| `keydown`                 | `document`       | Keyboard shortcuts                                                      |
| `click`                   | `document`       | All `[data-action]` buttons (delegated)                                 |
| `click`                   | `#contentArea`   | Settings tab switching, custom field save/cancel, user edit save/cancel |
| `change`                  | `#contentArea`   | All settings inputs (delegated)                                         |
| `click`                   | `#modalFooter`   | Modal action buttons (edit, advance, cancel, save)                      |
| `dragstart/dragover/drop` | `#contentArea`   | Menu drag-and-drop reorder                                              |

### Data-Action Pattern

All interactive elements use `data-action` attributes for event delegation:

```html
<button data-action="edit" data-id="...">✏️</button>
```

The main click handler extracts `action` and relevant index/id from `dataset` and switches:

```js
switch (a) {
  case 'view': openDetailModal(id); break;
  case 'edit': openFormModal(...); break;
  case 'delete': deleteTmp(id); break;
  // ... ~25+ action cases
}
```

---

## 16. Dependency-Free Architecture

Everything is built with **vanilla ES6+ JavaScript, HTML5, CSS3** — zero dependencies:

| Feature       | Implementation                                    |
| ------------- | ------------------------------------------------- |
| Templating    | Template literals (`` `${...}` ``)                |
| State         | Plain JS object + JSON serialization              |
| Persistence   | `localStorage` API                                |
| Routing       | Hash-based (`location.hash` + `hashchange` event) |
| Drag & Drop   | HTML5 Drag and Drop API                           |
| Image Upload  | `FileReader.readAsDataURL()`                      |
| File Download | `Blob` + `URL.createObjectURL()`                  |
| Modal         | CSS `position:fixed` overlay + flexbox centering  |
| Calendar      | Pure date math (no library)                       |
| Charts        | CSS bar chart (no library)                        |
| Icons         | Unicode emoji (no icon library)                   |
| Animations    | CSS `@keyframes`                                  |

---

## 17. Component Map

```
index.html (1279 lines)
├── <style> (186 lines) — all CSS
│   ├── :root variables (theme engine)
│   ├── Layout (sidebar, main, header)
│   ├── Components (cards, tables, forms, modals)
│   ├── Calendar grid
│   ├── Login screen
│   ├── Settings rows & tabs
│   ├── Responsive breakpoints (768px, 480px)
│   └── Row density classes
├── <body> HTML
│   ├── Sidebar toggle + overlay
│   ├── Login overlay (username, password, submit)
│   ├── App shell (sidebar + main content)
│   │   ├── Sidebar (header + nav)
│   │   └── Main (top header + content area)
│   └── Modal overlay (detail/edit forms)
└── <script> (1093 lines) — all JS
    ├── Constants (DEFAULT_*, ROLES, STORAGE_KEYS)
    ├── Utilities (uid, formatDate, escHtml, etc.)
    ├── Brand images & Theme engine
    ├── localStorage CRUD (load/persist)
    ├── Business logic (CRUD, advance, filter)
    ├── Login/Logout
    ├── Navigation & Sidebar render
    ├── View renders (Dashboard, Table, Calendar)
    ├── Settings renderers (18 tabs)
    │   ├── General, Menu, Statuses, Priorities
    │   ├── Content, Theme, Columns, Forms, Custom Fields
    │   ├── Users, Transitions, Defaults, Widgets
    │   ├── Density, Shortcuts, Export/Import, Backup, Audit Log
    ├── Modal form (open, submit, detail view)
    ├── Export/Import/Backup utilities
    ├── Event setup (all listeners)
    │   ├── Login, Navigation, Search
    │   ├── Main click handler (25+ action cases)
    │   ├── Settings change handler (20+ input types)
    │   ├── Custom field / User edit save
    │   ├── Modal footer actions
    │   ├── Drag-and-drop menu reorder
    │   └── Keyboard shortcuts + help modal
    └── init() — bootstrap sequence
```
