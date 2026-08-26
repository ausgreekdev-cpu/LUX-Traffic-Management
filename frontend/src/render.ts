// @ts-nocheck
export const SETTINGS_TABS = [
  { id: 'general', label: 'General' },
  { id: 'menu', label: 'Menu' },
  { id: 'statuses', label: 'Statuses' },
  { id: 'priorities', label: 'Priorities' },
  { id: 'content', label: 'Content' },
  { id: 'theme', label: 'Theme' },
  { id: 'columns', label: 'Columns' },
  { id: 'forms', label: 'Form Fields' },
  { id: 'customfields', label: 'Custom Fields' },
  { id: 'users', label: 'Users' },
  { id: 'transitions', label: 'Transitions' },
  { id: 'defaults', label: 'Defaults' },
  { id: 'widgets', label: 'Widgets' },
  { id: 'density', label: 'Density' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'automations', label: 'Automations' },
  { id: 'clients', label: 'Clients' },
  { id: 'exportimport', label: 'Export/Import' },
  { id: 'backup', label: 'Backup' },
  { id: 'auditlog', label: 'Audit Log' },
];

export function renderSidebar(state, getEnabledMenuItems, getCountByStatus, canManageSettings, escHtml) {
  const nav = document.getElementById('sidebarNav');
  let items = getEnabledMenuItems();
  if (canManageSettings())
    items = [...items, { id: 'settings', label: 'Admin Settings', icon: '\u2699\ufe0f', enabled: true, badge: false }];
  nav.innerHTML = items
    .map((m) => {
      const badge = m.badge ? `<span class="nav-badge">${getCountByStatus(m.id) || 0}</span>` : '';
      return `<a data-view="${m.id}" class="${state.currentView === m.id ? 'active' : ''}"><span class="nav-icon">${m.icon}</span>${escHtml(m.label)}${badge}</a>`;
    })
    .join('');
}

export function renderDashboard(
  state,
  getActiveStatuses,
  getCountByStatus,
  getUpcomingWorks,
  getStatusStyle,
  getStatusLabel,
  getPriorityStyle,
  getPriorityLabel,
  renderStatusWithScheduled,
  formatDate,
  escHtml
) {
  const DEFAULT_DASHBOARD_WIDGETS = {
    statActiveTMPs: true,
    statPendingApprovals: true,
    statUpcomingWorks: true,
    statHighPriority: true,
    chartStatusDistribution: true,
  };
  const DEFAULT_PRIORITIES = [
    { id: 'low', label: 'Low', bg: '#d1fae5', color: '#065f46' },
    { id: 'medium', label: 'Medium', bg: '#fef3c7', color: '#92400e' },
    { id: 'high', label: 'High', bg: '#fee2e2', color: '#991b1b' },
  ];
  const w = state.settings.dashboardWidgets || DEFAULT_DASHBOARD_WIDGETS;
  const ta = state.tmps.filter((t) => t.status !== 'completed').length;
  const pa = getCountByStatus('approvals');
  const up = getUpcomingWorks(7);
  const hp = state.tmps.filter((t) => t.status !== 'completed' && t.priority === 'high').length;
  const dist = {};
  getActiveStatuses().forEach((s) => {
    dist[s.id] = getCountByStatus(s.id);
  });
  const mx = Math.max(...Object.values(dist), 1);
  const bars = getActiveStatuses()
    .map(
      (s) =>
        `<div class="chart-bar-group"><div class="chart-bar" style="height:${Math.max(((dist[s.id] || 0) / mx) * 100, 4)}%;background:${s.color}"><span class="bar-count">${dist[s.id] || 0}</span></div><span class="chart-bar-label">${escHtml(s.label)}</span></div>`
    )
    .join('');
  const recent = [...state.tmps].sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated)).slice(0, 5);
  const rows = recent.length
    ? recent
        .map(
          (t) =>
            `<tr><td><strong>${escHtml(t.tmpNumber)}</strong></td><td>${escHtml(t.projectName)}</td><td>${escHtml(t.clientName)}</td><td><span class="status-badge" style="${getPriorityStyle(t.priority)}">${escHtml(getPriorityLabel(t.priority))}</span></td><td>${renderStatusWithScheduled(t)}</td><td>${formatDate(t.lastUpdated)}</td></tr>`
        )
        .join('')
    : '<tr><td colspan="6" class="empty-state"><p>No records yet.</p></td></tr>';
  let stats = '';
  if (w.statActiveTMPs !== false)
    stats += `<div class="stat-card"><div class="stat-label">Active TMPs</div><div class="stat-value">${ta}</div></div>`;
  if (w.statPendingApprovals !== false)
    stats += `<div class="stat-card"><div class="stat-label">Pending Approvals</div><div class="stat-value">${pa}</div></div>`;
  if (w.statUpcomingWorks !== false)
    stats += `<div class="stat-card"><div class="stat-label">Upcoming Works (7d)</div><div class="stat-value">${up.length}</div></div>`;
  if (w.statHighPriority !== false)
    stats += `<div class="stat-card"><div class="stat-label">High Priority</div><div class="stat-value">${hp}</div></div>`;
  const chart =
    w.chartStatusDistribution !== false
      ? `<div class="chart-container"><h3>TMP Status Distribution</h3><div class="chart-bars">${bars}</div></div>`
      : '';
  return `<div class="stats-grid">${stats}</div>${chart}<div class="card"><div class="card-header"><h3>Recent Activity</h3></div><div class="card-body pad0"><div class="table-container"><table><thead><tr><th>TMP#</th><th>Project</th><th>Client</th><th>Priority</th><th>Status</th><th>Last Updated</th></tr></thead><tbody>${rows}</tbody></table></div></div></div>`;
}

export function renderTable(
  status,
  state,
  getTmpsByStatus,
  getStatusLabel,
  getEnabledColumns,
  canEdit,
  canDelete,
  canAdvanceStatus,
  getActiveStatuses,
  getPriorityStyle,
  getPriorityLabel,
  formatDate,
  escHtml,
  getDensityClass
) {
  const DEFAULT_STATUSES = [
    { id: 'new', label: 'New', bg: '#dbeafe', color: '#1e40af', enabled: true },
    { id: 'in-progress', label: 'In Progress', bg: '#fef3c7', color: '#92400e', enabled: true },
    { id: 'permits-lga', label: 'Permits / LGA', bg: '#ede9fe', color: '#5b21b6', enabled: true },
    { id: 'approvals', label: 'Approvals', bg: '#cffafe', color: '#0e7490', enabled: true },
    { id: 'completed', label: 'Completed', bg: '#d1fae5', color: '#065f46', enabled: true },
  ];
  const items = getTmpsByStatus(status);
  const sl = getStatusLabel(status);
  const cols = getEnabledColumns(status);
  const activeStatuses = getActiveStatuses();
  const curIdx = activeStatuses.findIndex((s) => s.id === status);
  const headers = cols.map((c) => `<th>${escHtml(c.label)}</th>`).join('');
  const rows = items.length
    ? items
        .map((t) => {
          const cells = cols
            .map((c) => {
              if (c.key === 'actions') {
                const ed = canEdit()
                  ? `<button class="btn btn-sm btn-outline" data-action="edit" data-id="${t.id}">\u270f\ufe0f</button>`
                  : '';
                const del = canDelete()
                  ? `<button class="btn btn-sm btn-danger" data-action="delete" data-id="${t.id}">\ud83d\uddd1</button>`
                  : '';
                let adv = '';
                if (canAdvanceStatus(status) && curIdx >= 0 && curIdx < activeStatuses.length - 1) {
                  const nextLabel = activeStatuses[curIdx + 1].label;
                  adv = `<button class="btn btn-sm btn-primary" data-action="advance" data-id="${t.id}">\u2192 ${escHtml(nextLabel)}</button>`;
                }
                return `<td><div class="table-actions"><button class="btn btn-sm btn-outline" data-action="view" data-id="${t.id}">\ud83d\udc41</button>${ed}${del}${adv}</div></td>`;
              }
              let val = t[c.key] || '\u2014';
              if (c.key === 'priority')
                val = `<span class="status-badge" style="${getPriorityStyle(t.priority)}">${escHtml(getPriorityLabel(t.priority))}</span>`;
              else if (c.key === 'dateOfWorks') val = formatDate(t.dateOfWorks);
              else val = escHtml(val);
              return `<td>${val}</td>`;
            })
            .join('');
          return `<tr>${cells}</tr>`;
        })
        .join('')
    : '';
  const empty = !items.length
    ? `<div class="empty-state"><div class="empty-icon">\ud83d\udccb</div><p>No TMPs in <strong>${escHtml(sl)}</strong>.</p></div>`
    : '';
  const dc = getDensityClass();
  return `<div class="card"><div class="card-header"><h3>${escHtml(sl)} (${items.length})</h3>${canEdit() ? '<button class="btn btn-primary btn-sm" data-action="new-request">+ ' + escHtml(state.settings.content.labels.newRequest || 'New Request') + '</button>' : ''}</div><div class="card-body pad0">${empty || `<div class="table-container ${dc}"><table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`}</div></div>`;
}

export function renderCalendar(state, todayStr, daysInMonth, monthName, getDayOfWeek, escHtml) {
  const DEFAULT_PRIORITIES = [
    { id: 'low', label: 'Low', bg: '#d1fae5', color: '#065f46' },
    { id: 'medium', label: 'Medium', bg: '#fef3c7', color: '#92400e' },
    { id: 'high', label: 'High', bg: '#fee2e2', color: '#991b1b' },
  ];
  const y = state.calendarDate.getFullYear();
  const m = state.calendarDate.getMonth();
  const td = todayStr();
  const fd = getDayOfWeek(y, m, 1);
  const tdy = daysInMonth(y, m);
  const pmd = daysInMonth(y, m - 1 < 0 ? y - 1 : y, m - 1 < 0 ? 11 : m - 1);
  const dh = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    .map((d) => `<div class="calendar-day-header">${d}</div>`)
    .join('');
  const cells = [];
  for (let i = 0; i < fd; i++)
    cells.push(`<div class="calendar-day other-month"><span class="day-number">${pmd - fd + 1 + i}</span></div>`);
  const ebd = {};
  state.tmps.forEach((t) => {
    if (!t.dateOfWorks) return;
    const d = new Date(t.dateOfWorks + 'T00:00:00');
    if (d.getFullYear() === y && d.getMonth() === m) {
      if (!ebd[d.getDate()]) ebd[d.getDate()] = [];
      ebd[d.getDate()].push(t);
    }
  });
  for (let d = 1; d <= tdy; d++) {
    const ds = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const ev = ebd[d] || [];
    const sh = ev.slice(0, 2);
    const mr = ev.length - 2;
    const el = sh
      .map(
        (e) =>
          `<div class="cal-event" style="background:${(state.settings.priorities || DEFAULT_PRIORITIES).find((p) => p.id === e.priority)?.color || 'var(--primary-light)'}" data-action="view" data-id="${e.id}">${escHtml(e.tmpNumber)}</div>`
      )
      .join('');
    cells.push(
      `<div class="calendar-day ${ds === td ? 'today' : ''}"><div class="day-number">${d}</div>${el}${mr > 0 ? `<div class="cal-more" style="color:var(--primary)">+${mr} more</div>` : ''}</div>`
    );
  }
  const tc = fd + tdy;
  const rem = (7 - (tc % 7)) % 7;
  for (let i = 1; i <= rem; i++)
    cells.push(`<div class="calendar-day other-month"><span class="day-number">${i}</span></div>`);
  return `<div class="card"><div class="card-header"><h3>Calendar \u2014 Works Schedule</h3></div><div class="card-body"><div class="calendar-header"><button class="btn btn-sm btn-outline" data-action="cal-prev">\u2190 Previous</button><h2>${monthName(y, m)}</h2><div class="calendar-nav"><button class="btn btn-sm btn-outline" data-action="cal-today">Today</button><button class="btn btn-sm btn-outline" data-action="cal-next">Next \u2192</button></div></div><div class="calendar-grid">${dh}${cells.join('')}</div></div></div>`;
}

export function renderSettings(
  state,
  settingsTab,
  SETTINGS_TABS,
  DEFAULT_STATUSES,
  DEFAULT_PRIORITIES,
  DEFAULT_KEYBOARD_SHORTCUTS,
  DEFAULT_USERS,
  DEFAULT_DASHBOARD_WIDGETS,
  ROLES,
  getActiveStatuses,
  getStatusLabel,
  getStatusStyle,
  escHtml
) {
  const th = SETTINGS_TABS.map(
    (t) =>
      `<button class="settings-tab ${settingsTab === t.id ? 'active' : ''}" data-stab="${t.id}">${escHtml(t.label)}</button>`
  ).join('');
  return `<div class="card"><div class="card-header"><h3>Admin Settings Console</h3></div><div class="card-body"><div class="settings-tabs">${th}</div>
    <div class="settings-section ${settingsTab === 'general' ? 'open' : ''}">${renderGeneral(state, escHtml)}</div>
    <div class="settings-section ${settingsTab === 'menu' ? 'open' : ''}">${renderMenu(state, escHtml)}</div>
    <div class="settings-section ${settingsTab === 'statuses' ? 'open' : ''}">${renderStatuses(state, DEFAULT_STATUSES, escHtml)}</div>
    <div class="settings-section ${settingsTab === 'priorities' ? 'open' : ''}">${renderPriorities(state, DEFAULT_PRIORITIES, escHtml)}</div>
    <div class="settings-section ${settingsTab === 'content' ? 'open' : ''}">${renderContent(state, escHtml)}</div>
    <div class="settings-section ${settingsTab === 'theme' ? 'open' : ''}">${renderTheme(state, escHtml)}</div>
    <div class="settings-section ${settingsTab === 'columns' ? 'open' : ''}">${renderColumns(state, DEFAULT_STATUSES, escHtml)}</div>
    <div class="settings-section ${settingsTab === 'forms' ? 'open' : ''}">${renderForms(state, escHtml)}</div>
    <div class="settings-section ${settingsTab === 'customfields' ? 'open' : ''}">${renderCustomFields(state, escHtml)}</div>
    <div class="settings-section ${settingsTab === 'users' ? 'open' : ''}">${renderUsers(state, DEFAULT_USERS, ROLES, escHtml)}</div>
    <div class="settings-section ${settingsTab === 'transitions' ? 'open' : ''}">${renderTransitions(state, ROLES, getActiveStatuses, getStatusStyle, escHtml)}</div>
    <div class="settings-section ${settingsTab === 'defaults' ? 'open' : ''}">${renderDefaults(state, escHtml)}</div>
    <div class="settings-section ${settingsTab === 'widgets' ? 'open' : ''}">${renderWidgets(state, DEFAULT_DASHBOARD_WIDGETS)}</div>
    <div class="settings-section ${settingsTab === 'density' ? 'open' : ''}">${renderDensity(state)}</div>
    <div class="settings-section ${settingsTab === 'shortcuts' ? 'open' : ''}">${renderShortcuts(state, DEFAULT_KEYBOARD_SHORTCUTS, escHtml)}</div>
    <div class="settings-section ${settingsTab === 'automations' ? 'open' : ''}">${renderAutomations(state, getActiveStatuses, getStatusLabel, escHtml)}</div>
    <div class="settings-section ${settingsTab === 'clients' ? 'open' : ''}">${renderClients(state, escHtml)}</div>
    <div class="settings-section ${settingsTab === 'exportimport' ? 'open' : ''}">${renderExportImport()}</div>
    <div class="settings-section ${settingsTab === 'backup' ? 'open' : ''}">${renderBackup()}</div>
    <div class="settings-section ${settingsTab === 'auditlog' ? 'open' : ''}">${renderAuditLog(state, escHtml)}</div>
  </div></div>`;
}

export function renderStatusWithScheduled(tmp, getStatusStyle, getStatusLabel, escHtml, formatDate) {
  let html = `<span class="status-badge" style="${getStatusStyle(tmp.status)}">${escHtml(getStatusLabel(tmp.status))}</span>`;
  if (tmp.scheduledAdvance && tmp.scheduledAdvance.scheduledDate) {
    html += `<span style="display:block;font-size:.7rem;color:var(--warning);margin-top:2px">\u23f3 ${formatDate(tmp.scheduledAdvance.scheduledDate)}</span>`;
  }
  return html;
}

function renderGeneral(state, escHtml) {
  const c = state.settings.content;
  return `<p class="settings-hint">Configure your app name, branding, and login screen text.</p>
    <div class="setting-row"><div class="setting-label">App Name</div><div class="setting-actions"><input class="s-inline" id="s-appName" value="${escHtml(c.appName)}" style="width:240px"></div></div>
    <div class="setting-row"><div class="setting-label">Tagline</div><div class="setting-actions"><input class="s-inline" id="s-appTagline" value="${escHtml(c.appTagline)}" style="width:300px"></div></div>`;
}

function renderMenu(state, escHtml) {
  const items = state.settings.menuItems;
  return `<p class="settings-hint">Toggle visibility, rename, reorder (drag \u2630 or use arrows), and delete menu items. Built-in items use their view ID for routing.</p>
    <div style="margin-bottom:12px"><button class="btn btn-sm btn-outline" data-action="add-menu-item">+ Add Menu Item</button></div>
    <div id="menuSortable">${items
      .map(
        (m, i) => `
      <div class="setting-row" draggable="true" data-idx="${i}" data-drag-idx="${i}">
        <span class="drag-handle" draggable="false">\u2630</span>
        <button class="move-btn" data-action="move-menu-up" data-idx="${i}" title="Move up" ${i === 0 ? 'disabled' : ''}>\u25b2</button>
        <button class="move-btn" data-action="move-menu-down" data-idx="${i}" title="Move down" ${i === items.length - 1 ? 'disabled' : ''}>\u25bc</button>
        <div class="setting-label" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <input class="s-inline s-menu-label" value="${escHtml(m.label)}" data-idx="${i}" placeholder="Label" style="width:140px">
          <input class="s-inline s-menu-icon" value="${escHtml(m.icon)}" data-idx="${i}" placeholder="Icon" style="width:40px">
          <span style="font-size:.75rem;color:var(--text-secondary);font-family:monospace">${escHtml(m.id)}</span>
        </div>
        <div class="setting-actions">
          <label class="toggle-switch"><input type="checkbox" class="s-menu-toggle" data-idx="${i}" ${m.enabled ? 'checked' : ''}><span class="toggle-slider"></span></label>
          <button class="btn btn-sm btn-danger" data-action="del-menu-item" data-idx="${i}">\ud83d\uddd1</button>
        </div>
      </div>`
      )
      .join('')}</div>`;
}

function renderStatuses(state, DEFAULT_STATUSES, escHtml) {
  const items = state.settings.statuses || DEFAULT_STATUSES;
  return `<p class="settings-hint">Manage TMP workflow statuses. Rename, recolor, add, or remove statuses. Changes apply everywhere.</p>
    <div style="margin-bottom:12px"><button class="btn btn-sm btn-outline" data-action="add-status">+ Add Status</button></div>
    ${items
      .map(
        (s, i) => `
      <div class="setting-row" data-sidx="${i}">
        <span class="drag-handle">\u2630</span>
        <div class="setting-label" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <input class="s-inline s-status-label" value="${escHtml(s.label)}" data-sidx="${i}" placeholder="Label" style="width:160px">
          <div class="color-input-group"><input type="color" class="s-status-bg" data-sidx="${i}" value="${s.bg || '#dbeafe'}"><input type="text" class="s-status-color" value="${s.color || '#1e40af'}" data-sidx="${i}" placeholder="Text color" style="width:100px;font-family:monospace;font-size:.8rem"></div>
          <span class="status-badge" style="background:${s.bg};color:${s.color}" id="statusPreview${i}">${escHtml(s.label)}</span>
        </div>
        <div class="setting-actions">
          <label class="toggle-switch"><input type="checkbox" class="s-status-toggle" data-sidx="${i}" ${s.enabled !== false ? 'checked' : ''}><span class="toggle-slider"></span></label>
          <button class="btn btn-sm btn-danger" data-action="del-status" data-sidx="${i}">\ud83d\uddd1</button>
        </div>
      </div>`
      )
      .join('')}`;
}

function renderPriorities(state, DEFAULT_PRIORITIES, escHtml) {
  const items = state.settings.priorities || DEFAULT_PRIORITIES;
  return `<p class="settings-hint">Manage priority levels (Low, Medium, High). Rename, recolor, or add custom priorities.</p>
    <div style="margin-bottom:12px"><button class="btn btn-sm btn-outline" data-action="add-priority">+ Add Priority</button></div>
    ${items
      .map(
        (p, i) => `
      <div class="setting-row" data-pidx="${i}">
        <span class="drag-handle">\u2630</span>
        <div class="setting-label" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <input class="s-inline s-priority-label" value="${escHtml(p.label)}" data-pidx="${i}" placeholder="Label" style="width:160px">
          <div class="color-input-group"><input type="color" class="s-priority-bg" data-pidx="${i}" value="${p.bg || '#d1fae5'}"><input type="text" class="s-priority-color" value="${p.color || '#065f46'}" data-pidx="${i}" placeholder="Text color" style="width:100px;font-family:monospace;font-size:.8rem"></div>
          <span class="status-badge" style="background:${p.bg};color:${p.color}" id="priorityPreview${i}">${escHtml(p.label)}</span>
        </div>
        <div class="setting-actions"><button class="btn btn-sm btn-danger" data-action="del-priority" data-pidx="${i}">\ud83d\uddd1</button></div>
      </div>`
      )
      .join('')}`;
}

function renderContent(state, escHtml) {
  const c = state.settings.content;
  const views = Object.keys(c.viewTitles || {})
    .map(
      (k) =>
        `<div class="setting-row"><div class="setting-label">${escHtml(k)} Title</div><div class="setting-actions"><input class="s-inline s-content-title" data-view="${k}" value="${escHtml(c.viewTitles[k])}" style="width:280px"></div></div>`
    )
    .join('');
  return `<p class="settings-hint">Edit all text labels used throughout the application.</p>
    <h4 style="font-size:.9rem;font-weight:600;margin:12px 0 8px">View Titles</h4>${views}
    <h4 style="font-size:.9rem;font-weight:600;margin:12px 0 8px">Placeholders</h4>
    <div class="setting-row"><div class="setting-label">Search placeholder</div><div class="setting-actions"><input class="s-inline s-content-ph" data-key="search" value="${escHtml(c.placeholders?.search || '')}" style="width:240px"></div></div>
    <div class="setting-row"><div class="setting-label">TMP Number placeholder</div><div class="setting-actions"><input class="s-inline s-content-ph" data-key="tmpNumber" value="${escHtml(c.placeholders?.tmpNumber || '')}" style="width:240px"></div></div>
    <div class="setting-row"><div class="setting-label">Assigned To placeholder</div><div class="setting-actions"><input class="s-inline s-content-ph" data-key="assignedTo" value="${escHtml(c.placeholders?.assignedTo || '')}" style="width:240px"></div></div>
    <h4 style="font-size:.9rem;font-weight:600;margin:12px 0 8px">Labels</h4>
    <div class="setting-row"><div class="setting-label">New Request button</div><div class="setting-actions"><input class="s-inline s-content-label" data-key="newRequest" value="${escHtml(c.labels?.newRequest || '')}" style="width:240px"></div></div>
    <div class="setting-row"><div class="setting-label">Admin Settings button</div><div class="setting-actions"><input class="s-inline s-content-label" data-key="adminSettings" value="${escHtml(c.labels?.adminSettings || '')}" style="width:240px"></div></div>`;
}

function renderTheme(state, escHtml) {
  const t = state.settings.theme;
  const systemColors = [
    { key: 'primary', label: 'Primary' },
    { key: 'primaryLight', label: 'Primary Light' },
    { key: 'primaryDark', label: 'Primary Dark' },
    { key: 'bg', label: 'Page BG' },
    { key: 'surface', label: 'Card BG' },
    { key: 'text', label: 'Text' },
    { key: 'textSecondary', label: 'Text Secondary' },
    { key: 'border', label: 'Border' },
    { key: 'success', label: 'Success' },
    { key: 'warning', label: 'Warning' },
    { key: 'danger', label: 'Danger' },
    { key: 'purple', label: 'Purple' },
    { key: 'cyan', label: 'Cyan' },
  ];
  const sidebarColors = [
    { key: 'sidebarBg', label: 'Sidebar BG' },
    { key: 'sidebarText', label: 'Sidebar Text' },
    { key: 'sidebarNavText', label: 'Nav Text' },
    { key: 'sidebarHoverBg', label: 'Hover BG' },
    { key: 'sidebarActiveBg', label: 'Active BG' },
    { key: 'sidebarHeaderBorder', label: 'Header Border' },
  ];
  const colorRow = (c) =>
    `<div class="setting-row"><div class="setting-label">${c.label}</div><div class="setting-actions"><div class="color-input-group"><input type="color" class="s-theme-color" data-key="${c.key}" value="${t[c.key] || ''}"><input type="text" class="s-theme-hex" data-key="${c.key}" value="${t[c.key] || ''}" style="width:120px"></div></div></div>`;
  const sidebarBgImgPreview = t.sidebarBgImg
    ? `<div style="margin-top:8px"><img src="${escHtml(t.sidebarBgImg)}" style="max-height:60px;width:100%;object-fit:cover;border:1px solid var(--border);border-radius:4px"><br><button class="btn btn-xs btn-outline" data-action="remove-sidebar-bg" style="margin-top:4px">Remove Image</button></div>`
    : '<span style="color:var(--text-secondary);font-size:.85rem">No background image</span>';
  const logoPreview = t.logo
    ? `<div><img src="${escHtml(t.logo)}" style="max-height:60px;border:1px solid var(--border);border-radius:4px;padding:4px;background:#fff"><br><button class="btn btn-xs btn-outline" data-action="remove-logo" style="margin-top:4px">Remove Logo</button></div>`
    : '<span style="color:var(--text-secondary);font-size:.85rem">No logo</span>';
  const bannerPreview = t.banner
    ? `<div><img src="${escHtml(t.banner)}" style="max-height:80px;width:100%;object-fit:cover;border:1px solid var(--border);border-radius:4px"><br><button class="btn btn-xs btn-outline" data-action="remove-banner" style="margin-top:4px">Remove Banner</button></div>`
    : '<span style="color:var(--text-secondary);font-size:.85rem">No banner</span>';

  return `<p class="settings-hint">Customize colors, images, and appearance. Images persist across sessions.</p>

    <h4 style="font-size:.9rem;font-weight:600;margin:0 0 12px">System Colors</h4>
    ${systemColors.map(colorRow).join('')}
    <div class="setting-row"><div class="setting-label">Border Radius</div><div class="setting-actions"><input class="s-inline s-theme-radius" value="${t.radius || '8px'}" style="width:100px"></div></div>
    <div class="setting-row"><div class="setting-label">Font Family</div><div class="setting-actions"><input class="s-inline s-theme-font" value="${escHtml(t.font || '')}" style="width:400px"></div></div>

    <h4 style="font-size:.9rem;font-weight:600;margin:20px 0 12px">\ud83c\udfa8 Sidebar Colors</h4>
    ${sidebarColors.map(colorRow).join('')}
    <div class="setting-row"><div class="setting-label">Subtitle Opacity</div><div class="setting-actions"><input type="range" class="s-theme-range" data-key="sidebarSubOpacity" min="0" max="1" step="0.05" value="${t.sidebarSubOpacity || '0.7'}" style="width:120px"><span class="s-range-val" style="margin-left:8px;font-size:.85rem;color:var(--text-secondary)">${t.sidebarSubOpacity || '0.7'}</span></div></div>

    <h4 style="font-size:.9rem;font-weight:600;margin:20px 0 12px">\ud83d\uddbc\ufe0f Brand Images</h4>
    <div class="setting-row" style="flex-wrap:wrap">
      <div class="setting-label" style="width:100%;margin-bottom:8px"><strong>Logo</strong> (sidebar header + login screen)</div>
      <div style="width:100%">${logoPreview}</div>
      <div style="margin-top:8px"><input type="file" class="s-image-upload" data-imgkey="logo" accept="image/png,image/jpeg,image/svg+xml,image/webp"></div>
    </div>
    <div class="setting-row" style="flex-wrap:wrap">
      <div class="setting-label" style="width:100%;margin-bottom:8px"><strong>Banner</strong> (login screen top)</div>
      <div style="width:100%">${bannerPreview}</div>
      <div style="margin-top:8px"><input type="file" class="s-image-upload" data-imgkey="banner" accept="image/png,image/jpeg,image/webp"></div>
    </div>
    <div class="setting-row" style="flex-wrap:wrap">
      <div class="setting-label" style="width:100%;margin-bottom:8px"><strong>Sidebar Background Image</strong> (tiles behind sidebar content)</div>
      <div style="width:100%">${sidebarBgImgPreview}</div>
      <div style="margin-top:8px"><input type="file" class="s-image-upload" data-imgkey="sidebarBgImg" accept="image/png,image/jpeg,image/webp"></div>
    </div>

    <div style="margin-top:16px;display:flex;gap:8px">
      <button class="btn btn-sm btn-outline" data-action="reset-theme">Reset to Default Theme</button>
    </div>`;
}

function renderColumns(state, DEFAULT_STATUSES, escHtml) {
  const DEFAULT_TABLE_COLUMNS = {};
  ['new', 'in-progress', 'permits-lga', 'approvals', 'completed'].forEach((s) => {
    DEFAULT_TABLE_COLUMNS[s] = [
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
  const cur = state.settings._colStatus || 'new';
  const sel = (state.settings.statuses || DEFAULT_STATUSES)
    .map((s) => `<option value="${s.id}" ${s.id === cur ? 'selected' : ''}>${escHtml(s.label)}</option>`)
    .join('');
  const cols = state.settings.tableColumns[cur] || [];
  return `<p class="settings-hint">Toggle column visibility per status view. Actions is always visible.</p>
    <div style="margin-bottom:16px"><label style="font-size:.85rem;font-weight:600;color:var(--text-secondary)">View: </label>
    <select class="s-col-view-select" style="padding:6px 12px;border:1px solid var(--border);border-radius:6px;font-size:.85rem">${sel}</select></div>
    ${cols.map((c, i) => `<div class="setting-row"><span class="drag-handle" style="opacity:${c.key === 'actions' ? '.3' : '1'}">\u2630</span><div class="setting-label">${escHtml(c.label)} <span style="color:var(--text-secondary);font-size:.8rem">(${c.key})</span></div><div class="setting-actions"><label class="toggle-switch"><input type="checkbox" class="s-col-toggle" data-status="${cur}" data-colidx="${i}" ${c.enabled ? 'checked' : ''} ${c.key === 'actions' ? 'disabled' : ''}><span class="toggle-slider"></span></label></div></div>`).join('')}`;
}

function renderForms(state, escHtml) {
  const fields = state.settings.formFields;
  return `<p class="settings-hint">Toggle visibility and required status of system form fields.</p>${fields
    .map(
      (f, i) =>
        `<div class="setting-row"><span class="drag-handle">\u2630</span><div class="setting-label">${escHtml(f.label)} <span style="color:var(--text-secondary);font-size:.8rem">(${f.key})</span></div><div class="setting-actions"><label style="font-size:.8rem;display:flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox" class="s-field-required" data-fldidx="${i}" ${f.required ? 'checked' : ''}> Required</label><label class="toggle-switch"><input type="checkbox" class="s-field-toggle" data-fldidx="${i}" ${f.enabled ? 'checked' : ''}><span class="toggle-slider"></span></label></div></div>`
    )
    .join('')}`;
}

function renderCustomFields(state, escHtml) {
  const fields = state.settings.customFields || [];
  const palette = ['text', 'number', 'date', 'select', 'textarea', 'checkbox']
    .map((t) => `<span class="palette-item" data-palette="${t}">+ ${t.charAt(0).toUpperCase() + t.slice(1)}</span>`)
    .join('');
  const list = fields.length
    ? fields
        .map(
          (f, i) => `
    <div class="setting-row" data-cfi="${i}">
      <span class="drag-handle">\u2630</span>
      <div class="setting-label"><strong>${escHtml(f.label)}</strong> <span style="font-size:.75rem;color:var(--text-secondary);background:var(--bg);padding:1px 6px;border-radius:4px;text-transform:uppercase">${f.type}</span>${f.required ? ' <span style="color:var(--danger)">*</span>' : ''}</div>
      <div class="setting-actions">
        <label class="toggle-switch"><input type="checkbox" class="s-cfield-toggle" data-cfi="${i}" ${f.enabled !== false ? 'checked' : ''}><span class="toggle-slider"></span></label>
        <button class="btn btn-sm btn-outline" data-action="edit-cfield" data-cfi="${i}">\u270f\ufe0f</button>
        <button class="btn btn-sm btn-danger" data-action="del-cfield" data-cfi="${i}">\ud83d\uddd1</button>
      </div>
    </div>`
        )
        .join('')
    : '<p style="color:var(--text-secondary);text-align:center;padding:20px">No custom fields yet.</p>';

  const ef =
    state.settings._editingCF !== undefined
      ? state.settings.customFields[state.settings._editingCF] || {
          label: '',
          type: 'text',
          required: false,
          options: '',
          gridClass: '',
        }
      : { label: '', type: 'text', required: false, options: '', gridClass: '' };
  const editForm = `<div class="custom-field-form" id="customFieldForm" style="background:var(--bg);border-radius:var(--radius);padding:20px;margin-bottom:16px;border:1px solid var(--border)">
    <h4 style="margin-bottom:12px;font-size:.95rem">${state.settings._editingCF !== undefined ? 'Edit' : 'Add'} Custom Field</h4>
    <div class="form-grid" style="max-width:600px">
      <div class="form-group"><label>Field Label</label><input type="text" id="cf_label" value="${escHtml(ef.label)}" placeholder="e.g. Traffic Control Type"></div>
      <div class="form-group"><label>Field Type</label><select id="cf_type">${['text', 'number', 'date', 'select', 'textarea', 'checkbox'].map((t) => `<option value="${t}" ${ef.type === t ? 'selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}</select></div>
      <div class="form-group full-width" id="cf_options_group" style="display:${ef.type === 'select' ? 'flex' : 'none'}"><label>Options (comma-separated)</label><input type="text" id="cf_options" value="${Array.isArray(ef.options) ? escHtml(ef.options.join(', ')) : escHtml(ef.options || '')}"></div>
      <div class="form-group"><label>Grid Width</label><select id="cf_grid"><option value="" ${!ef.gridClass ? 'selected' : ''}>Half (1/2)</option><option value="full-width" ${ef.gridClass === 'full-width' ? 'selected' : ''}>Full width</option></select></div>
      <div class="form-group"><label style="flex-direction:row;gap:8px;cursor:pointer"><input type="checkbox" id="cf_required" ${ef.required ? 'checked' : ''}> Required</label></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px">
      <button class="btn btn-primary btn-sm" id="cf_save">${state.settings._editingCF !== undefined ? 'Update' : 'Add'} Field</button>
      <button class="btn btn-outline btn-sm" id="cf_cancel">Cancel</button>
    </div>
  </div>`;

  return `<p class="settings-hint">Add custom fields to the TMP form. Click a field type below to start.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;padding:16px;background:var(--bg);border-radius:var(--radius);border:2px dashed var(--border)">${palette}</div>
    ${editForm}
    <div id="customFieldsList">${list}</div>`;
}

function renderUsers(state, DEFAULT_USERS, ROLES, escHtml) {
  const users = state.settings.users || DEFAULT_USERS;
  const ef =
    state.settings._editingUser !== undefined
      ? state.settings.users[state.settings._editingUser] || { username: '', password: '', role: 'viewer' }
      : { username: '', password: '', role: 'viewer' };
  const editForm =
    state.settings._editingUser !== undefined
      ? `<div style="background:var(--bg);border-radius:var(--radius);padding:20px;margin-bottom:16px;border:1px solid var(--border)">
    <h4 style="margin-bottom:12px;font-size:.95rem">Edit User</h4>
    <div class="form-grid" style="max-width:500px">
      <div class="form-group"><label>Username</label><input type="text" id="eu_username" value="${escHtml(ef.username)}"></div>
      <div class="form-group"><label>Password</label><input type="text" id="eu_password" value="${escHtml(ef.password)}" placeholder="Leave empty to keep current"></div>
      <div class="form-group"><label>Role</label><select id="eu_role">${Object.keys(ROLES)
        .map(
          (r) => '<option value="' + r + '" ' + (ef.role === r ? 'selected' : '') + '>' + ROLES[r].label + '</option>'
        )
        .join('')}</select></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px">
      <button class="btn btn-primary btn-sm" id="eu_save">Update User</button>
      <button class="btn btn-outline btn-sm" id="eu_cancel">Cancel</button>
    </div>
  </div>`
      : '';
  return `<p class="settings-hint">Manage user accounts. Default accounts: admin/admin, planner/planner, inspector/inspector, viewer/viewer.</p>
    <div style="margin-bottom:12px"><button class="btn btn-sm btn-outline" data-action="add-user">+ Add User</button></div>
    ${editForm}
    ${users
      .map(
        (u, i) => `
      <div class="setting-row">
        <span class="drag-handle">\ud83d\udc64</span>
        <div class="setting-label"><strong>${escHtml(u.username)}</strong> <span style="font-size:.8rem;color:var(--text-secondary)">(${ROLES[u.role] ? ROLES[u.role].label : u.role})</span></div>
        <div class="setting-actions">
          <button class="btn btn-sm btn-outline" data-action="edit-user" data-uidx="${i}">\u270f\ufe0f</button>
          <button class="btn btn-sm btn-danger" data-action="del-user" data-uidx="${i}" ${users.length <= 1 ? 'disabled' : ''}>\ud83d\uddd1</button>
        </div>
      </div>`
      )
      .join('')}`;
}

function renderTransitions(state, ROLES, getActiveStatuses, getStatusStyle, escHtml) {
  const statuses = getActiveStatuses();
  const rules = state.settings.statusRules || {};
  const allRoles = Object.keys(ROLES);
  return `<p class="settings-hint">Control which roles can advance TMPs from each status. Check the roles allowed to advance from each status.</p>
    ${statuses
      .map((s, i) => {
        if (i >= statuses.length - 1) return '';
        const rule = rules[s.id] || { canAdvanceRoles: ['admin', 'planner', 'inspector'] };
        const checks = allRoles
          .map(
            (r) =>
              '<label style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;font-size:.85rem;cursor:pointer"><input type="checkbox" class="s-transition-role" data-status="' +
              s.id +
              '" data-role="' +
              r +
              '" ' +
              (rule.canAdvanceRoles.includes(r) ? 'checked' : '') +
              '> ' +
              ROLES[r].label +
              '</label>'
          )
          .join('');
        return `<div class="setting-row" style="flex-wrap:wrap"><div class="setting-label" style="width:100%;margin-bottom:8px;font-weight:600">From: <span class="status-badge" style="${getStatusStyle(s.id)}">${escHtml(s.label)}</span> \u2192 ${escHtml(statuses[i + 1].label)}</div><div style="width:100%">${checks}</div></div>`;
      })
      .join('')}`;
}

function renderDefaults(state, escHtml) {
  const DEFAULT_PRIORITIES = [
    { id: 'low', label: 'Low', bg: '#d1fae5', color: '#065f46' },
    { id: 'medium', label: 'Medium', bg: '#fef3c7', color: '#92400e' },
    { id: 'high', label: 'High', bg: '#fee2e2', color: '#991b1b' },
  ];
  const fields = state.settings.formFields.filter((f) => f.enabled).concat(state.settings.customFields || []);
  const dv = state.settings.defaultValues || {};
  return `<p class="settings-hint">Set default values that pre-fill when creating a new TMP request.</p>
    ${fields
      .map((f) => {
        if (f.type === 'checkbox') {
          const checked = dv[f.key] === 'true' || dv[f.key] === true ? 'checked' : '';
          return `<div class="setting-row"><div class="setting-label">${escHtml(f.label)}</div><div class="setting-actions"><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" class="s-default-check" data-dkey="${f.key}" ${checked}> Pre-checked</label></div></div>`;
        }
        const val = f.key.startsWith('custom_') ? dv[f.key] || '' : dv[f.key] || '';
        return `<div class="setting-row"><div class="setting-label">${escHtml(f.label)}</div><div class="setting-actions"><input class="s-inline s-default-val" data-dkey="${f.key}" value="${escHtml(val)}" style="width:200px" placeholder="${f.type === 'select' ? 'Option value (e.g. medium)' : ''}"></div></div>`;
      })
      .join('')}`;
}

function renderWidgets(state, DEFAULT_DASHBOARD_WIDGETS) {
  const w = state.settings.dashboardWidgets || DEFAULT_DASHBOARD_WIDGETS;
  return `<p class="settings-hint">Toggle dashboard widgets on or off.</p>
    <div class="setting-row"><div class="setting-label">Active TMPs Stat</div><div class="setting-actions"><label class="toggle-switch"><input type="checkbox" class="s-widget-toggle" data-wkey="statActiveTMPs" ${w.statActiveTMPs !== false ? 'checked' : ''}><span class="toggle-slider"></span></label></div></div>
    <div class="setting-row"><div class="setting-label">Pending Approvals Stat</div><div class="setting-actions"><label class="toggle-switch"><input type="checkbox" class="s-widget-toggle" data-wkey="statPendingApprovals" ${w.statPendingApprovals !== false ? 'checked' : ''}><span class="toggle-slider"></span></label></div></div>
    <div class="setting-row"><div class="setting-label">Upcoming Works Stat</div><div class="setting-actions"><label class="toggle-switch"><input type="checkbox" class="s-widget-toggle" data-wkey="statUpcomingWorks" ${w.statUpcomingWorks !== false ? 'checked' : ''}><span class="toggle-slider"></span></label></div></div>
    <div class="setting-row"><div class="setting-label">High Priority Stat</div><div class="setting-actions"><label class="toggle-switch"><input type="checkbox" class="s-widget-toggle" data-wkey="statHighPriority" ${w.statHighPriority !== false ? 'checked' : ''}><span class="toggle-slider"></span></label></div></div>
    <div class="setting-row"><div class="setting-label">Status Distribution Chart</div><div class="setting-actions"><label class="toggle-switch"><input type="checkbox" class="s-widget-toggle" data-wkey="chartStatusDistribution" ${w.chartStatusDistribution !== false ? 'checked' : ''}><span class="toggle-slider"></span></label></div></div>`;
}

function renderDensity(state) {
  const d = state.settings.rowDensity || 'comfortable';
  return `<p class="settings-hint">Choose table row density.</p>
    <div class="setting-row"><div class="setting-label"><strong>Compact</strong> \u2014 tighter rows for more data</div><div class="setting-actions"><input type="radio" name="s-density" class="s-density-radio" value="compact" ${d === 'compact' ? 'checked' : ''}></div></div>
    <div class="setting-row"><div class="setting-label"><strong>Comfortable</strong> \u2014 standard row spacing</div><div class="setting-actions"><input type="radio" name="s-density" class="s-density-radio" value="comfortable" ${d === 'comfortable' ? 'checked' : ''}></div></div>`;
}

function renderShortcuts(state, DEFAULT_KEYBOARD_SHORTCUTS, escHtml) {
  const sc = state.settings.keyboardShortcuts || DEFAULT_KEYBOARD_SHORTCUTS;
  return `<p class="settings-hint">Configure keyboard shortcuts. Use standard key notation (e.g. ctrl+n, ctrl+shift+e).</p>
    ${Object.keys(DEFAULT_KEYBOARD_SHORTCUTS)
      .map((k) => {
        const labels = {
          newRequest: 'New Request',
          globalSearch: 'Global Search',
          exportJSON: 'Export JSON',
          dashboard: 'Navigate: Dashboard',
          calendar: 'Navigate: Calendar',
          adminSettings: 'Admin Settings',
          help: 'Help / Shortcuts',
        };
        return `<div class="setting-row"><div class="setting-label">${labels[k] || k}</div><div class="setting-actions"><input class="s-inline s-shortcut-input" data-sckey="${k}" value="${escHtml(sc[k] || '')}" style="width:160px;font-family:monospace;text-align:center"></div></div>`;
      })
      .join('')}
    <p class="settings-hint" style="margin-top:12px">Press <strong>${escHtml(sc.help || '?')}</strong> at any time to view available shortcuts.</p>`;
}

function renderAutomations(state, getActiveStatuses, getStatusLabel, escHtml) {
  const a = state.settings.automations || [];
  const statuses = getActiveStatuses();
  const statusOpts = statuses
    .map((s, i) => (i < statuses.length - 1 ? `<option value="${s.id}">${escHtml(s.label)}</option>` : ''))
    .join('');
  const ef =
    state.settings._editingAuto !== undefined
      ? state.settings.automations[state.settings._editingAuto] || {
          fromStatus: '',
          toStatus: '',
          delayDays: 1,
          enabled: true,
        }
      : { fromStatus: '', toStatus: '', delayDays: 1, enabled: true };
  const editForm =
    state.settings._editingAuto !== undefined
      ? `<div style="background:var(--bg);border-radius:var(--radius);padding:20px;margin-bottom:16px;border:1px solid var(--border)">
    <h4 style="margin-bottom:12px;font-size:.95rem">Edit Automation Rule</h4>
    <div class="form-grid" style="max-width:500px">
      <div class="form-group"><label>From Status</label><select id="ea_from">${statuses.map((s, i) => (i < statuses.length - 1 ? '<option value="' + s.id + '" ' + (ef.fromStatus === s.id ? 'selected' : '') + '>' + escHtml(s.label) + '</option>' : '')).join('')}</select></div>
      <div class="form-group"><label>To Status</label><select id="ea_to">${statuses.map((s, i) => (i > 0 ? '<option value="' + s.id + '" ' + (ef.toStatus === s.id ? 'selected' : '') + '>' + escHtml(s.label) + '</option>' : '')).join('')}</select></div>
      <div class="form-group"><label>Delay (days)</label><input type="number" id="ea_days" value="${ef.delayDays || 1}" min="1" max="365"></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px">
      <button class="btn btn-primary btn-sm" id="ea_save">Update Rule</button>
      <button class="btn btn-outline btn-sm" id="ea_cancel">Cancel</button>
    </div>
  </div>`
      : '';
  return `<p class="settings-hint">Auto-advance rules: when a TMP reaches a status, automatically advance it after N days.</p>
    <div style="margin-bottom:12px"><button class="btn btn-sm btn-outline" data-action="add-auto">+ Add Automation Rule</button></div>
    ${editForm}
    ${
      a.length
        ? a
            .map(
              (r, i) => `
      <div class="setting-row">
        <span class="drag-handle">\ud83e\udd16</span>
        <div class="setting-label"><strong>${getStatusLabel(r.fromStatus)} \u2192 ${getStatusLabel(r.toStatus)}</strong> <span style="font-size:.8rem;color:var(--text-secondary)">${r.delayDays} day${r.delayDays !== 1 ? 's' : ''} delay</span></div>
        <div class="setting-actions">
          <label class="toggle-switch"><input type="checkbox" class="s-auto-toggle" data-aidx="${i}" ${r.enabled !== false ? 'checked' : ''}><span class="toggle-slider"></span></label>
          <button class="btn btn-sm btn-outline" data-action="edit-auto" data-aidx="${i}">\u270f\ufe0f</button>
          <button class="btn btn-sm btn-danger" data-action="del-auto" data-aidx="${i}">\ud83d\uddd1</button>
        </div>
      </div>`
            )
            .join('')
        : '<p style="text-align:center;padding:20px;color:var(--text-secondary)">No automation rules yet. Add one to auto-advance TMPs after a delay.</p>'
    }`;
}

function renderClients(state, escHtml) {
  const clients = state.settings.clients || [];
  const ef =
    state.settings._editingClient !== undefined
      ? state.settings.clients[state.settings._editingClient] || {
          name: '',
          type: 'government',
          contact: '',
          phone: '',
        }
      : { name: '', type: 'government', contact: '', phone: '' };
  const editForm =
    state.settings._editingClient !== undefined
      ? `<div style="background:var(--bg);border-radius:var(--radius);padding:20px;margin-bottom:16px;border:1px solid var(--border)">
    <h4 style="margin-bottom:12px;font-size:.95rem">Edit Client</h4>
    <div class="form-grid" style="max-width:500px">
      <div class="form-group"><label>Client Name</label><input type="text" id="ec_name" value="${escHtml(ef.name)}"></div>
      <div class="form-group"><label>Type</label><select id="ec_type"><option value="government" ${ef.type === 'government' ? 'selected' : ''}>Government</option><option value="private" ${ef.type === 'private' ? 'selected' : ''}>Private</option></select></div>
      <div class="form-group"><label>Contact Email</label><input type="email" id="ec_contact" value="${escHtml(ef.contact || '')}"></div>
      <div class="form-group"><label>Phone</label><input type="text" id="ec_phone" value="${escHtml(ef.phone || '')}"></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px">
      <button class="btn btn-primary btn-sm" id="ec_save">Update Client</button>
      <button class="btn btn-outline btn-sm" id="ec_cancel">Cancel</button>
    </div>
  </div>`
      : '';
  const gov = clients.filter((c) => c.type === 'government');
  const prv = clients.filter((c) => c.type === 'private');
  const renderList = (list) =>
    list
      .map((c) => {
        const idx = state.settings.clients.indexOf(c);
        return `<div class="setting-row"><span class="drag-handle">\ud83c\udfe2</span><div class="setting-label"><strong>${escHtml(c.name)}</strong> <span style="font-size:.75rem;text-transform:uppercase;padding:1px 6px;border-radius:4px;background:${c.type === 'government' ? 'var(--primary)' : 'var(--purple)'};color:#fff;margin-left:6px">${c.type}</span></div><div class="setting-actions"><button class="btn btn-sm btn-outline" data-action="edit-client" data-cidx="${idx}">\u270f\ufe0f</button><button class="btn btn-sm btn-danger" data-action="del-client" data-cidx="${idx}">\ud83d\uddd1</button></div></div>`;
      })
      .join('');
  return `<p class="settings-hint">Manage client database. Clients appear in the TMP form dropdown, categorized by Government / Private.</p>
    <div style="margin-bottom:12px"><button class="btn btn-sm btn-outline" data-action="add-client">+ Add Client</button></div>
    ${editForm}
    ${gov.length ? `<h4 style="font-size:.9rem;font-weight:600;margin:12px 0 8px">\ud83c\udfdb\ufe0f Government (${gov.length})</h4>${renderList(gov)}` : ''}
    ${prv.length ? `<h4 style="font-size:.9rem;font-weight:600;margin:12px 0 8px">\ud83c\udfe2 Private (${prv.length})</h4>${renderList(prv)}` : ''}
    ${!clients.length ? '<p style="text-align:center;padding:20px;color:var(--text-secondary)">No clients yet.</p>' : ''}`;
}

function renderExportImport() {
  return `<p class="settings-hint">Export TMP data as JSON or CSV, or import from a JSON file.</p>
    <div class="setting-row" style="flex-wrap:wrap">
      <div class="setting-label" style="font-weight:600">Export All TMPs as JSON</div>
      <div class="setting-actions"><button class="btn btn-sm btn-outline" data-action="export-json">\u2b07 Download JSON</button></div>
    </div>
    <div class="setting-row" style="flex-wrap:wrap">
      <div class="setting-label" style="font-weight:600">Export All TMPs as CSV</div>
      <div class="setting-actions"><button class="btn btn-sm btn-outline" data-action="export-csv">\u2b07 Download CSV</button></div>
    </div>
    <div class="setting-row" style="flex-wrap:wrap">
      <div class="setting-label" style="font-weight:600">Import TMPs from JSON</div>
      <div style="margin-top:4px"><input type="file" class="s-import-json" accept=".json"></div>
    </div>
    <div class="setting-row" style="flex-wrap:wrap">
      <div class="setting-label" style="font-weight:600">Bulk Create Sample</div>
      <div class="setting-actions"><button class="btn btn-sm btn-outline" data-action="bulk-sample">\ud83d\udce5 Load 3 Sample TMPs</button></div>
    </div>`;
}

function renderBackup() {
  return `<p class="settings-hint">Backup all application data (TMPs, settings, audit log) to a JSON file, or restore from a previous backup.</p>
    <div class="setting-row" style="flex-wrap:wrap">
      <div class="setting-label" style="font-weight:600">Download Full Backup</div>
      <div class="setting-actions"><button class="btn btn-sm btn-primary" data-action="backup-download">\ud83d\udcbe Download Backup</button></div>
    </div>
    <div class="setting-row" style="flex-wrap:wrap">
      <div class="setting-label" style="font-weight:600">Restore from Backup</div>
      <div style="margin-top:4px"><input type="file" class="s-backup-restore" accept=".json"></div>
    </div>
    <p class="settings-hint" style="color:var(--warning)">\u26a0\ufe0f Restoring will replace ALL current data and settings. A confirmation prompt will appear.</p>`;
}

function renderAuditLog(state, escHtml) {
  const formatTimestamp = (i) => {
    if (!i) return '\u2014';
    const d = new Date(i);
    return d.toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };
  const logs = state.auditLog || [];
  const rows = logs.length
    ? logs
        .slice()
        .reverse()
        .slice(0, 200)
        .map(
          (l) => `
    <tr>
      <td>${formatTimestamp(l.timestamp)}</td>
      <td><span class="status-badge" style="background:${l.action === 'create' ? 'var(--success)' : l.action === 'update' ? 'var(--primary)' : l.action === 'delete' ? 'var(--danger)' : l.action === 'advance' ? 'var(--warning)' : 'var(--secondary)'};color:#fff;padding:2px 8px;font-size:.7rem">${l.action}</span></td>
      <td>${escHtml(l.username)}</td>
      <td>${escHtml(l.tmpNumber || '-')}</td>
      <td style="font-size:.8rem;color:var(--text-secondary);max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(l.details || '')}</td>
    </tr>`
        )
        .join('')
    : '<tr><td colspan="5" class="empty-state"><p>No audit log entries yet.</p></td></tr>';
  return `<p class="settings-hint">Audit trail of all TMP actions. Showing last 200 entries (most recent first).</p>
    <div style="margin-bottom:12px"><button class="btn btn-sm btn-outline" data-action="clear-audit">\ud83d\uddd1 Clear Audit Log</button></div>
    <div class="table-container" style="max-height:400px;overflow-y:auto">
    <table><thead><tr><th>Timestamp</th><th>Action</th><th>User</th><th>TMP</th><th>Details</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
