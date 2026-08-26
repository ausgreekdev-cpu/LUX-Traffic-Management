import {
  uid, formatDate, formatTimestamp, todayStr, nowISO,
  daysInMonth, monthName, getDayOfWeek, escHtml, downloadFile,
} from './utils.js';

import {
  apiGet, apiPost, apiPut, apiDelete, isApiAvailable, setApiAvailable,
  loginToApi,
} from './api.js';

import {
  state, editingId, viewingId, settingsTab,
  setEditingId, setViewingId, setSettingsTab,
  ROLES, DEFAULT_STATUSES, DEFAULT_PRIORITIES,
  DEFAULT_FORM_FIELDS, DEFAULT_MENU_ITEMS, DEFAULT_CONTENT,
  DEFAULT_USERS, DEFAULT_THEME, DEFAULT_KEYBOARD_SHORTCUTS,
  DEFAULT_DASHBOARD_WIDGETS, DEFAULT_CLIENTS,
  DEFAULT_TABLE_COLUMNS, DEFAULT_STATUS_RULES,
  persist, persistSettings, persistUser, persistAuditLog,
  loadData, loadSettings, loadUser, loadAuditLog, addAuditLog,
  userRole, canEdit, canDelete, canManageSettings, canAdvance,
  canAdvanceStatus,
  getStatusLabel, getStatusStyle, getPriorityStyle, getPriorityLabel,
  getContent, appName, appTagline,
  getEnabledFormFields, getAllFormFields, getFormFieldsForEdit,
  getEnabledMenuItems, getFilteredTmps, getTmpsByStatus,
  getCountByStatus, getUpcomingWorks, getActiveStatuses,
  getEnabledColumns, getDensityClass, getClientType,
  createTmp, updateTmp, deleteTmp, advanceStatus,
  processScheduledAdvances,
} from './state.js';

import {
  SETTINGS_TABS,
  renderSidebar, renderDashboard, renderTable, renderCalendar,
  renderSettings, renderStatusWithScheduled,
} from './render.js';

function showShortcutHelp(items) {
  document.getElementById('modalTitle').textContent = 'Keyboard Shortcuts';
  document.getElementById('modalBody').innerHTML = '<div class="table-container"><table><thead><tr><th style="width:180px">Shortcut</th><th>Action</th></tr></thead><tbody>' + items + '</tbody></table></div>';
  document.getElementById('modalFooter').innerHTML = '<button class="btn btn-outline" id="modalCancel">Close</button>';
  document.getElementById('modalOverlay').classList.add('open');
}

function openFormModal(tmp) {
  if (!canEdit()) return;
  setEditingId(tmp ? tmp.id : null);
  const eid = editingId;
  const isEdit = !!eid;
  const isAdmin = userRole() === 'admin';
  document.getElementById('modalTitle').textContent = isEdit ? 'Edit TMP Request' : 'New TMP Request';
  let d = tmp || { tmpNumber: '', projectName: '', requestDate: todayStr(), clientName: '', location: '', dateOfWorks: '', details: '', assignedTo: '', priority: 'medium', status: 'new', customFields: {} };
  if (!tmp) {
    const dv = state.settings.defaultValues || {};
    Object.keys(dv).forEach(k => {
      if (dv[k] !== '' && dv[k] !== undefined && dv[k] !== null) {
        if (k.startsWith('custom_')) {
          if (!d.customFields) d.customFields = {};
          d.customFields[k] = dv[k];
        } else {
          d[k] = dv[k];
        }
      }
    });
  }
  const fields = getFormFieldsForEdit();
  const formHtml = fields.map(f => {
    const val = f.key.startsWith('custom_') ? (d.customFields && d.customFields[f.key]) || '' : d[f.key] || '';
    const id = 'f_' + f.key;
    const req = f.required ? 'required' : '';
    const gc = f.gridClass || '';
    let input = '';
    if (f.type === 'select') {
      const opts = f.options && Array.isArray(f.options) ? f.options.map(o => `<option value="${escHtml(o)}" ${val === o ? 'selected' : ''}>${escHtml(o)}</option>`).join('') : (state.settings.priorities || DEFAULT_PRIORITIES).map(p => `<option value="${p.id}" ${val === p.id ? 'selected' : ''}>${escHtml(p.label)}</option>`).join('');
      input = `<select id="${id}">${opts}</select>`;
    } else if (f.type === 'textarea') {
      input = `<textarea id="${id}" ${req}>${escHtml(val)}</textarea>`;
    } else if (f.type === 'date') {
      input = `<input type="date" id="${id}" value="${escHtml(val)}" ${req}>`;
    } else if (f.type === 'checkbox') {
      input = `<label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 0"><input type="checkbox" id="${id}" ${val ? 'checked' : ''}> ${escHtml(f.label)}</label>`;
    } else if (f.key === 'clientName' && state.settings.clients && state.settings.clients.length) {
      const clients = state.settings.clients;
      const gov = clients.filter(c => c.type === 'government');
      const prv = clients.filter(c => c.type === 'private');
      const optsFn = (g) => g.map(c => `<option value="${escHtml(c.name)}" ${val === c.name ? 'selected' : ''} style="${c.type === 'government' ? 'color:var(--primary)' : 'color:var(--purple)'}">\ud83c\udfdb\ufe0f ${escHtml(c.name)}</option>`).join('');
      const govOpts = gov.length ? `<optgroup label="\ud83c\udfdb\ufe0f Government">${optsFn(gov)}</optgroup>` : '';
      const prvOpts = prv.length ? `<optgroup label="\ud83c\udfe2 Private">${optsFn(prv)}</optgroup>` : '';
      input = `<select id="${id}"><option value="">-- Select Client --</option>${govOpts}${prvOpts}</select>`;
    } else {
      const ph = f.key === 'tmpNumber' ? getContent('placeholders.tmpNumber') : (f.key === 'assignedTo' ? getContent('placeholders.assignedTo') : '');
      input = `<input type="${f.type || 'text'}" id="${id}" value="${escHtml(val)}" ${req} placeholder="${ph}">`;
    }
    if (f.type === 'checkbox') return input;
    return `<div class="form-group ${gc}"><label for="${id}">${escHtml(f.label)}${f.required ? '<span style="color:var(--danger)">*</span>' : ''}</label>${input}</div>`;
  }).join('');
  const statusField = isEdit && isAdmin ? `<div class="form-group"><label for="f_status">Status</label><select id="f_status">${(state.settings.statuses || DEFAULT_STATUSES).map(s => `<option value="${s.id}" ${d.status === s.id ? 'selected' : ''}>${escHtml(s.label)}</option>`).join('')}</select></div>` : '';
  const updatedInfo = isEdit ? `<div class="form-group full-width"><p style="font-size:.8rem;color:var(--text-secondary)">Last updated: ${formatTimestamp(tmp.lastUpdated)}</p></div>` : '';
  document.getElementById('modalBody').innerHTML = `<form id="tmpForm" autocomplete="off"><div class="form-grid">${formHtml}${statusField}${updatedInfo}</div></form>`;
  document.getElementById('modalFooter').innerHTML = `<button class="btn btn-outline" id="modalCancel">Cancel</button><button class="btn btn-primary" id="modalSave">${isEdit ? 'Update' : 'Create'} TMP</button>`;
  document.getElementById('modalOverlay').classList.add('open');
}

function handleFormSubmit() {
  if (!canEdit()) return;
  const fields = getFormFieldsForEdit();
  const data = {};
  let valid = true;
  const isAdmin = userRole() === 'admin';
  fields.forEach(f => {
    const el = document.getElementById('f_' + f.key);
    if (!el) return;
    if (f.type === 'checkbox') { data[f.key] = el.checked; return; }
    const val = el.value.trim();
    data[f.key] = val;
    if (f.required && !val) valid = false;
  });
  const statusEl = document.getElementById('f_status');
  if (statusEl) data.status = statusEl.value;
  const customFields = {};
  Object.keys(data).forEach(k => {
    if (k.startsWith('custom_')) {
      customFields[k] = data[k];
      delete data[k];
    }
  });
  data.customFields = customFields;
  if (!isAdmin && (!valid || !data.projectName || !data.clientName || !data.location || !data.requestDate || !data.dateOfWorks)) {
    alert('Please fill in all required fields.');
    return;
  }
  if (editingId) updateTmp(editingId, data); else createTmp(data);
  closeModal();
  doRender();
}

function openDetailModal(id) {
  const t = state.tmps.find(x => x.id === id);
  if (!t) return;
  setViewingId(id);
  document.getElementById('modalTitle').textContent = 'TMP Details \u2014 ' + t.tmpNumber;
  const clientType = getClientType(t.clientName);
  const fields = [
    { label: 'TMP Number', value: t.tmpNumber },
    { label: 'Project Name', value: t.projectName },
    { label: 'Request Date', value: formatDate(t.requestDate) },
    {
      label: 'Client', value: t.clientName + (clientType ? ' <span style="font-size:.7rem;text-transform:uppercase;padding:1px 6px;border-radius:4px;background:' + (clientType === 'government' ? 'var(--primary)' : 'var(--purple)') + ';color:#fff;margin-left:4px">' + clientType + '</span>' : ''),
    },
    { label: 'Location', value: t.location, full: true },
    { label: 'Date of Works', value: formatDate(t.dateOfWorks) },
    { label: 'Assigned To', value: t.assignedTo || '\u2014' },
    { label: 'Priority', value: `<span class="status-badge" style="${getPriorityStyle(t.priority)}">${escHtml(getPriorityLabel(t.priority))}</span>` },
    { label: 'Status', value: renderStatusWithScheduled(t, getStatusStyle, getStatusLabel, escHtml, formatDate) },
    { label: 'Details', value: t.details || '\u2014', full: true },
    { label: 'Last Updated', value: formatTimestamp(t.lastUpdated), full: true },
  ];
  if (t.customFields) {
    (state.settings.customFields || []).forEach(f => {
      const v = t.customFields[f.key];
      if (v !== undefined && v !== '' && f.enabled !== false) {
        fields.push({ label: f.label, value: f.type === 'checkbox' ? (v ? 'Yes' : 'No') : escHtml(String(v)), full: false });
      }
    });
  }
  const items = fields.map(f => `<div class="detail-item ${f.full ? 'full-width' : ''}"><div class="detail-label">${f.label}</div><div class="detail-value">${f.value}</div></div>`).join('');
  document.getElementById('modalBody').innerHTML = `<div class="detail-grid">${items}</div>`;
  const btns = [`<button class="btn btn-outline" id="modalCancel">Close</button>`];
  if (canEdit()) btns.push(`<button class="btn btn-outline" data-action="edit" data-id="${t.id}">\u270f\ufe0f Edit</button>`);
  const activeStatuses = getActiveStatuses();
  const curIdx = activeStatuses.findIndex(s => s.id === t.status);
  if (canAdvanceStatus(t.status) && curIdx >= 0 && curIdx < activeStatuses.length - 1) {
    btns.push(`<button class="btn btn-primary" data-action="advance" data-id="${t.id}">\u2192 Move to ${escHtml(activeStatuses[curIdx + 1].label)}</button>`);
  }
  document.getElementById('modalFooter').innerHTML = btns.join('');
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  setEditingId(null);
  setViewingId(null);
}

async function exportJSON() {
  if (isApiAvailable()) {
    try {
      const d = await apiGet('/api/export/json');
      if (d && Array.isArray(d)) {
        downloadFile(JSON.stringify(d, null, 2), 'TMPs_export_' + todayStr() + '.json', 'application/json');
        return;
      }
    } catch (_) {}
  }
  const data = getFilteredTmps();
  downloadFile(JSON.stringify(data, null, 2), 'TMPs_export_' + todayStr() + '.json', 'application/json');
}

async function exportCSV() {
  if (isApiAvailable()) {
    try {
      const r = await apiGet('/api/export/csv');
      if (r && typeof r === 'string') {
        downloadFile(r, 'TMPs_export_' + todayStr() + '.csv', 'text/csv');
        return;
      }
    } catch (_) {}
  }
  const data = getFilteredTmps();
  const f = ['tmpNumber', 'projectName', 'requestDate', 'clientName', 'location', 'dateOfWorks', 'details', 'assignedTo', 'priority', 'status'];
  const h = f.join(',');
  const rows = data.map(t => f.map(f => '"' + (t[f] || '').replace(/"/g, '""') + '"').join(','));
  downloadFile([h, ...rows].join('\n'), 'TMPs_export_' + todayStr() + '.csv', 'text/csv');
}

function importJSON(jsonStr) {
  let data;
  try { data = JSON.parse(jsonStr); } catch (e) { alert('Invalid JSON file.'); return; }
  if (!Array.isArray(data)) { alert('JSON must contain an array of TMP objects.'); return; }
  if (isApiAvailable()) {
    apiPost('/api/import', data).then(r => {
      alert('Imported ' + (r.imported || 0) + ' TMP(s).');
      doRender();
    }).catch(() => { localImport(data); });
    return;
  }
  localImport(data);
}

function localImport(data) {
  let c = 0;
  data.forEach(item => {
    if (item.projectName || item.clientName || item.location) {
      createTmp(item);
      c++;
    }
  });
  alert('Imported ' + c + ' TMP(s).');
  doRender();
}

async function backupAll() {
  if (isApiAvailable()) {
    try {
      const b = await apiGet('/api/backup');
      if (b) {
        downloadFile(JSON.stringify(b, null, 2), 'TMP_Backup_' + todayStr() + '.json', 'application/json');
        return;
      }
    } catch (_) {}
  }
  const b = { date: nowISO(), data: state.tmps, settings: state.settings, auditLog: state.auditLog };
  downloadFile(JSON.stringify(b, null, 2), 'TMP_Backup_' + todayStr() + '.json', 'application/json');
}

function restoreAll(jsonStr) {
  let data;
  try { data = JSON.parse(jsonStr); } catch (e) { alert('Invalid backup file.'); return; }
  if (!data || !data.data || !Array.isArray(data.data) || !data.settings || !data.settings.menuItems) {
    alert('Invalid backup format.');
    return;
  }
  if (!confirm('This will replace ALL current data and settings. Are you sure?')) return;
  if (isApiAvailable()) {
    apiPost('/api/backup/restore', data).then(() => { location.reload(); }).catch(() => { localRestore(data); });
    return;
  }
  localRestore(data);
}

function localRestore(data) {
  state.tmps = data.data;
  state.settings = data.settings;
  state.auditLog = data.auditLog || [];
  persist();
  persistSettings();
  persistAuditLog();
  alert('Backup restored successfully.');
  doRender();
}

async function bulkSample() {
  if (isApiAvailable()) {
    const r = await apiPost('/api/bulk-sample');
    alert('Created ' + (r.created || 0) + ' sample TMPs.');
    navigate(state.currentView);
    return;
  }
  const td = todayStr();
  const d = (o) => { const dt = new Date(td + 'T00:00:00'); dt.setDate(dt.getDate() + o); return dt.toISOString().slice(0, 10); };
  [
    ['TMP-2024-006', 'King Street Pedestrian Crossing', d(2), 'City Council', 'King Street, Newtown', d(15), 'Pedestrian crossing installation.', 'James Wilson', 'high', 'new'],
    ['TMP-2024-007', 'Harbour Bridge Maintenance', d(-7), 'Transport NSW', 'Sydney Harbour Bridge', d(30), 'Routine maintenance works.', 'Maria Garcia', 'medium', 'in-progress'],
    ['TMP-2024-008', 'Oxford Street Lighting', d(-14), 'City of Sydney', 'Oxford Street, Paddington', d(22), 'Street light upgrade.', 'Alex Kim', 'low', 'permits-lga'],
  ].forEach(r => {
    createTmp({ tmpNumber: r[0], projectName: r[1], requestDate: r[2], clientName: r[3], location: r[4], dateOfWorks: r[5], details: r[6], assignedTo: r[7], priority: r[8], status: r[9] });
  });
  alert('3 sample TMPs created.');
  navigate(state.currentView);
}

function showLogin() {
  document.getElementById('loginOverlay').classList.remove('hidden');
}

function hideLogin() {
  document.getElementById('loginOverlay').classList.add('hidden');
}

function handleLogin(name, role) {
  state.currentUser = { username: name, role: role };
  persistUser();
  hideLogin();
  document.getElementById('sidebarUser').textContent = 'Logged in as ' + name;
  document.getElementById('userBadgeText').textContent = role.charAt(0).toUpperCase() + role.slice(1);
  if (state.currentView === 'settings' && !canManageSettings()) state.currentView = 'dashboard';
  renderSidebar();
  doRender();
}

function handleLogout() {
  state.currentUser = null;
  persistUser();
  showLogin();
  document.getElementById('loginName').value = '';
  document.getElementById('loginPassword').value = '';
}

function navigate(view) {
  if (view === 'settings' && !canManageSettings()) view = 'dashboard';
  state.currentView = view;
  renderSidebar();
  document.getElementById('viewTitle').textContent = getContent('viewTitles.' + view) || view;
  doRender();
}

function updateAdminBtn() {
  const btn = document.getElementById('adminBtn');
  if (btn) btn.style.display = canManageSettings() ? 'flex' : 'none';
}

function updateNewBtn() {
  const btn = document.getElementById('newRequestBtn');
  if (btn) btn.style.display = canEdit() ? 'inline-flex' : 'none';
}

function updateBadges() {
  document.querySelectorAll('.sidebar-nav a').forEach(el => {
    const b = el.querySelector('.nav-badge');
    if (b) b.textContent = getCountByStatus(el.dataset.view) || 0;
  });
}

function doRender() {
  processScheduledAdvances();
  updateBadges();
  updateAdminBtn();
  updateNewBtn();
  const area = document.getElementById('contentArea');
  switch (state.currentView) {
    case 'dashboard':
      area.innerHTML = renderDashboard(state, getActiveStatuses, getCountByStatus, getUpcomingWorks, getStatusStyle, getStatusLabel, getPriorityStyle, getPriorityLabel, renderStatusWithScheduled, formatDate, escHtml);
      break;
    case 'settings':
      area.innerHTML = renderSettings(state, settingsTab, SETTINGS_TABS, DEFAULT_STATUSES, DEFAULT_PRIORITIES, DEFAULT_KEYBOARD_SHORTCUTS, DEFAULT_USERS, DEFAULT_DASHBOARD_WIDGETS, ROLES, getActiveStatuses, getStatusLabel, getStatusStyle, escHtml);
      break;
    case 'calendar':
      area.innerHTML = renderCalendar(state, todayStr, daysInMonth, monthName, getDayOfWeek, escHtml);
      break;
    default:
      area.innerHTML = renderTable(state.currentView, state, getTmpsByStatus, getStatusLabel, getEnabledColumns, canEdit, canDelete, canAdvanceStatus, getActiveStatuses, getPriorityStyle, getPriorityLabel, formatDate, escHtml, getDensityClass);
  }
  document.getElementById('sidebarTitle').textContent = appName();
  document.getElementById('loginTitle').textContent = appName();
  document.getElementById('loginSubtitle').textContent = appTagline();
  document.getElementById('globalSearch').placeholder = getContent('placeholders.search');
}

function setupEvents() {
  document.getElementById('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const n = document.getElementById('loginName').value.trim();
    const pw = document.getElementById('loginPassword').value;
    if (!n || !pw) return;
    document.getElementById('roleDesc').innerHTML = 'Signing in...';
    try {
      const res = await apiPost('/api/auth/login', { username: n, password: pw });
      if (res && res.token) {
        localStorage.setItem('tmp_auth_token', res.token);
        setApiAvailable(true);
        handleLogin(res.user.username, res.user.role);
        return;
      }
    } catch (_) {}
    const users = state.settings.users || DEFAULT_USERS;
    const user = users.find(u => u.username === n && u.password === pw);
    if (user) {
      setApiAvailable(false);
      handleLogin(user.username, user.role);
    } else {
      document.getElementById('roleDesc').innerHTML = '<strong style="color:var(--danger)">Invalid username or password.</strong>';
    }
  });

  document.getElementById('userBadge').addEventListener('click', handleLogout);

  document.getElementById('sidebarNav').addEventListener('click', e => {
    const l = e.target.closest('[data-view]');
    if (l) {
      navigate(l.dataset.view);
      closeSidebar();
    }
  });

  function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('open');
  }

  document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('open');
  });

  document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);

  let searchTimer;
  document.getElementById('globalSearch').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.searchQuery = document.getElementById('globalSearch').value;
      doRender();
    }, 250);
  });

  document.getElementById('newRequestBtn').addEventListener('click', () => {
    if (canEdit()) openFormModal(null);
  });

  document.getElementById('adminBtn').addEventListener('click', () => {
    if (!canManageSettings()) return;
    if (state.currentView === 'settings') navigate('dashboard'); else navigate('settings');
  });

  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-action]');
    if (!t) return;
    const a = t.dataset.action;
    const id = t.dataset.id;
    const idx = t.dataset.idx;
    const sidx = t.dataset.sidx;
    const pidx = t.dataset.pidx;
    const cfi = t.dataset.cfi;
    const uidx = t.dataset.uidx;
    const aidx = t.dataset.aidx;
    const cidx = t.dataset.cidx;
    switch (a) {
      case 'new-request':
        if (canEdit()) openFormModal(null);
        break;
      case 'view':
        openDetailModal(id);
        break;
      case 'edit':
        if (!canEdit()) break;
        closeModal();
        const et = state.tmps.find(x => x.id === id);
        if (et) openFormModal(et);
        break;
      case 'delete':
        if (!canDelete()) break;
        if (confirm('Delete this TMP?')) { deleteTmp(id); doRender(); }
        break;
      case 'advance': {
        if (!canAdvance()) break;
        const rec = state.tmps.find(x => x.id === id);
        if (rec && !canAdvanceStatus(rec.status)) {
          alert('Your role does not have permission to advance from this status.');
          break;
        }
        if (rec) {
          const as = getActiveStatuses();
          const ci = as.findIndex(s => s.id === rec.status);
          if (ci >= 0 && ci < as.length - 1 && confirm('Move "' + rec.tmpNumber + '" to "' + as[ci + 1].label + '"?')) {
            advanceStatus(id);
            doRender();
            if (document.getElementById('modalOverlay').classList.contains('open') && viewingId === id) openDetailModal(id);
          }
        }
      } break;
      case 'cal-prev':
        state.calendarDate.setMonth(state.calendarDate.getMonth() - 1);
        doRender();
        break;
      case 'cal-next':
        state.calendarDate.setMonth(state.calendarDate.getMonth() + 1);
        doRender();
        break;
      case 'cal-today':
        state.calendarDate = new Date();
        doRender();
        break;
      case 'add-menu-item': {
        state.settings.menuItems.push({ id: 'custom-' + Date.now(), label: 'New Item', icon: '\ud83d\udcc4', enabled: true, badge: false });
        persistSettings();
        doRender();
        break;
      }
      case 'del-menu-item': {
        const i = parseInt(idx, 10);
        if (!isNaN(i) && confirm('Delete this menu item?')) {
          state.settings.menuItems.splice(i, 1);
          persistSettings();
          doRender();
        }
      } break;
      case 'move-menu-up': {
        const i = parseInt(idx, 10);
        if (!isNaN(i) && i > 0) {
          const item = state.settings.menuItems.splice(i, 1)[0];
          state.settings.menuItems.splice(i - 1, 0, item);
          persistSettings();
          doRender();
        }
      } break;
      case 'move-menu-down': {
        const i = parseInt(idx, 10);
        if (!isNaN(i) && i < state.settings.menuItems.length - 1) {
          const item = state.settings.menuItems.splice(i, 1)[0];
          state.settings.menuItems.splice(i + 1, 0, item);
          persistSettings();
          doRender();
        }
      } break;
      case 'add-status': {
        const sid = 'status-' + Date.now();
        state.settings.statuses.push({ id: sid, label: 'New Status', bg: '#dbeafe', color: '#1e40af', enabled: true });
        persistSettings();
        doRender();
        break;
      }
      case 'del-status': {
        const i = parseInt(sidx, 10);
        if (!isNaN(i) && confirm('Delete this status?')) {
          state.settings.statuses.splice(i, 1);
          persistSettings();
          doRender();
        }
      } break;
      case 'add-priority': {
        state.settings.priorities.push({ id: 'pri-' + Date.now(), label: 'New Priority', bg: '#e2e8f0', color: '#475569' });
        persistSettings();
        doRender();
        break;
      }
      case 'del-priority': {
        const i = parseInt(pidx, 10);
        if (!isNaN(i) && confirm('Delete this priority?')) {
          state.settings.priorities.splice(i, 1);
          persistSettings();
          doRender();
        }
      } break;
      case 'edit-cfield': {
        const i = parseInt(cfi, 10);
        if (!isNaN(i) && state.settings.customFields[i]) {
          state.settings._editingCF = i;
          doRender();
        }
      } break;
      case 'del-cfield': {
        const i = parseInt(cfi, 10);
        if (!isNaN(i) && confirm('Delete this custom field?')) {
          state.settings.customFields.splice(i, 1);
          state.settings._editingCF = undefined;
          persistSettings();
          doRender();
        }
      } break;
      case 'reset-theme': {
        if (confirm('Reset theme to defaults?')) {
          state.settings.theme = JSON.parse(JSON.stringify(DEFAULT_THEME));
          persistSettings();
          doRender();
        }
        break;
      }
      case 'remove-logo': {
        state.settings.theme.logo = '';
        persistSettings();
        doRender();
        break;
      }
      case 'remove-banner': {
        state.settings.theme.banner = '';
        persistSettings();
        doRender();
        break;
      }
      case 'remove-favicon': {
        state.settings.theme.favicon = '';
        persistSettings();
        doRender();
        break;
      }
      case 'remove-sidebar-bg': {
        state.settings.theme.sidebarBgImg = '';
        persistSettings();
        doRender();
        break;
      }
      case 'add-user': {
        const users = state.settings.users;
        users.push({ username: 'newuser', password: 'password', role: 'viewer' });
        persistSettings();
        doRender();
        break;
      }
      case 'edit-user': {
        const i = parseInt(uidx, 10);
        if (!isNaN(i) && state.settings.users[i]) {
          state.settings._editingUser = i;
          doRender();
        }
      } break;
      case 'del-user': {
        const i = parseInt(uidx, 10);
        if (!isNaN(i) && state.settings.users.length > 1 && confirm('Delete user "' + state.settings.users[i].username + '"?')) {
          state.settings.users.splice(i, 1);
          state.settings._editingUser = undefined;
          persistSettings();
          doRender();
        }
      } break;
      case 'export-json':
        exportJSON();
        break;
      case 'export-csv':
        exportCSV();
        break;
      case 'backup-download':
        backupAll();
        break;
      case 'clear-audit': {
        if (confirm('Clear all audit log entries?')) {
          state.auditLog = [];
          persistAuditLog();
          doRender();
        }
        break;
      }
      case 'bulk-sample':
        bulkSample();
        break;
      case 'add-auto': {
        state.settings.automations.push({
          fromStatus: (getActiveStatuses()[0] || {}).id,
          toStatus: (getActiveStatuses()[1] || {}).id,
          delayDays: 3,
          enabled: true,
        });
        state.settings._editingAuto = state.settings.automations.length - 1;
        persistSettings();
        doRender();
        break;
      }
      case 'edit-auto': {
        const i = parseInt(aidx, 10);
        if (!isNaN(i) && state.settings.automations[i]) {
          state.settings._editingAuto = i;
          doRender();
        }
      } break;
      case 'del-auto': {
        const i = parseInt(aidx, 10);
        if (!isNaN(i) && confirm('Delete this automation rule?')) {
          state.settings.automations.splice(i, 1);
          state.settings._editingAuto = undefined;
          persistSettings();
          doRender();
        }
      } break;
      case 'add-client': {
        state.settings.clients.push({ id: 'client-' + Date.now(), name: 'New Client', type: 'private', contact: '', phone: '' });
        state.settings._editingClient = state.settings.clients.length - 1;
        persistSettings();
        doRender();
        break;
      }
      case 'edit-client': {
        const i = parseInt(cidx, 10);
        if (!isNaN(i) && state.settings.clients[i]) {
          state.settings._editingClient = i;
          doRender();
        }
      } break;
      case 'del-client': {
        const i = parseInt(cidx, 10);
        if (!isNaN(i) && confirm('Delete this client?')) {
          state.settings.clients.splice(i, 1);
          state.settings._editingClient = undefined;
          persistSettings();
          doRender();
        }
      } break;
    }
  });

  document.getElementById('contentArea').addEventListener('click', e => {
    const tab = e.target.closest('[data-stab]');
    if (tab) {
      setSettingsTab(tab.dataset.stab);
      doRender();
    }
  });

  document.getElementById('contentArea').addEventListener('change', e => {
    const el = e.target;
    if (el.id === 's-appName') {
      state.settings.content.appName = el.value;
      persistSettings();
      doRender();
      return;
    }
    if (el.id === 's-appTagline') {
      state.settings.content.appTagline = el.value;
      persistSettings();
      doRender();
      return;
    }
    if (el.classList.contains('s-menu-label')) {
      const i = parseInt(el.dataset.idx, 10);
      if (!isNaN(i)) { state.settings.menuItems[i].label = el.value; persistSettings(); renderSidebar(); }
    }
    if (el.classList.contains('s-menu-icon')) {
      const i = parseInt(el.dataset.idx, 10);
      if (!isNaN(i)) { state.settings.menuItems[i].icon = el.value; persistSettings(); renderSidebar(); }
    }
    if (el.classList.contains('s-menu-toggle')) {
      const i = parseInt(el.dataset.idx, 10);
      if (!isNaN(i)) { state.settings.menuItems[i].enabled = el.checked; persistSettings(); renderSidebar(); doRender(); }
    }
    if (el.classList.contains('s-status-label')) {
      const i = parseInt(el.dataset.sidx, 10);
      if (!isNaN(i)) {
        state.settings.statuses[i].label = el.value;
        persistSettings();
        document.getElementById('statusPreview' + i).textContent = el.value;
        doRender();
      }
    }
    if (el.classList.contains('s-status-bg')) {
      const i = parseInt(el.dataset.sidx, 10);
      if (!isNaN(i)) { state.settings.statuses[i].bg = el.value; persistSettings(); document.getElementById('statusPreview' + i).style.background = el.value; }
    }
    if (el.classList.contains('s-status-color')) {
      const i = parseInt(el.dataset.sidx, 10);
      if (!isNaN(i)) { state.settings.statuses[i].color = el.value; persistSettings(); document.getElementById('statusPreview' + i).style.color = el.value; }
    }
    if (el.classList.contains('s-status-toggle')) {
      const i = parseInt(el.dataset.sidx, 10);
      if (!isNaN(i)) { state.settings.statuses[i].enabled = el.checked; persistSettings(); doRender(); }
    }
    if (el.classList.contains('s-priority-label')) {
      const i = parseInt(el.dataset.pidx, 10);
      if (!isNaN(i)) { state.settings.priorities[i].label = el.value; persistSettings(); document.getElementById('priorityPreview' + i).textContent = el.value; }
    }
    if (el.classList.contains('s-priority-bg')) {
      const i = parseInt(el.dataset.pidx, 10);
      if (!isNaN(i)) { state.settings.priorities[i].bg = el.value; persistSettings(); document.getElementById('priorityPreview' + i).style.background = el.value; }
    }
    if (el.classList.contains('s-priority-color')) {
      const i = parseInt(el.dataset.pidx, 10);
      if (!isNaN(i)) { state.settings.priorities[i].color = el.value; persistSettings(); document.getElementById('priorityPreview' + i).style.color = el.value; }
    }
    if (el.classList.contains('s-content-title')) {
      const v = el.dataset.view;
      if (v) { state.settings.content.viewTitles[v] = el.value; persistSettings(); document.getElementById('viewTitle').textContent = getContent('viewTitles.' + state.currentView); }
    }
    if (el.classList.contains('s-content-ph')) {
      const k = el.dataset.key;
      if (k) {
        if (!state.settings.content.placeholders) state.settings.content.placeholders = {};
        state.settings.content.placeholders[k] = el.value;
        persistSettings();
        document.getElementById('globalSearch').placeholder = getContent('placeholders.search');
      }
    }
    if (el.classList.contains('s-content-label')) {
      const k = el.dataset.key;
      if (k) {
        if (!state.settings.content.labels) state.settings.content.labels = {};
        state.settings.content.labels[k] = el.value;
        persistSettings();
      }
    }
    if (el.classList.contains('s-theme-color')) {
      const k = el.dataset.key;
      if (k) { state.settings.theme[k] = el.value; persistSettings(); }
    }
    if (el.classList.contains('s-theme-hex')) {
      const k = el.dataset.key;
      if (k && el.value.match(/^#[0-9a-f]{6}$/i)) {
        state.settings.theme[k] = el.value;
        const colorInput = document.querySelector(`.s-theme-color[data-key="${k}"]`);
        if (colorInput) colorInput.value = el.value;
        persistSettings();
      }
    }
    if (el.classList.contains('s-theme-radius')) {
      state.settings.theme.radius = el.value;
      persistSettings();
    }
    if (el.classList.contains('s-theme-font')) {
      state.settings.theme.font = el.value;
      persistSettings();
    }
    if (el.classList.contains('s-theme-range')) {
      const k = el.dataset.key;
      if (k) {
        state.settings.theme[k] = el.value;
        const sv = el.parentElement.querySelector('.s-range-val');
        if (sv) sv.textContent = el.value;
        persistSettings();
      }
    }
    if (el.classList.contains('s-image-upload') && el.files && el.files[0]) {
      const imgKey = el.dataset.imgkey;
      if (imgKey) {
        const reader = new FileReader();
        reader.onload = function (ev) {
          state.settings.theme[imgKey] = ev.target.result;
          persistSettings();
          doRender();
        };
        reader.readAsDataURL(el.files[0]);
      }
    }
    if (el.classList.contains('s-col-view-select')) {
      state.settings._colStatus = el.value;
      doRender();
    }
    if (el.classList.contains('s-col-toggle')) {
      const s = el.dataset.status;
      const i = parseInt(el.dataset.colidx, 10);
      if (s && !isNaN(i) && state.settings.tableColumns[s] && state.settings.tableColumns[s][i]) {
        state.settings.tableColumns[s][i].enabled = el.checked;
        persistSettings();
      }
    }
    if (el.classList.contains('s-field-required')) {
      const i = parseInt(el.dataset.fldidx, 10);
      if (!isNaN(i) && state.settings.formFields[i]) {
        state.settings.formFields[i].required = el.checked;
        persistSettings();
      }
    }
    if (el.classList.contains('s-field-toggle')) {
      const i = parseInt(el.dataset.fldidx, 10);
      if (!isNaN(i) && state.settings.formFields[i]) {
        state.settings.formFields[i].enabled = el.checked;
        persistSettings();
      }
    }
    if (el.classList.contains('s-cfield-toggle')) {
      const i = parseInt(el.dataset.cfi, 10);
      if (!isNaN(i) && state.settings.customFields[i]) {
        state.settings.customFields[i].enabled = el.checked;
        persistSettings();
      }
    }
    if (el.id === 'cf_type') {
      const og = document.getElementById('cf_options_group');
      if (og) og.style.display = el.value === 'select' ? 'flex' : 'none';
    }
    if (el.classList.contains('s-transition-role')) {
      const status = el.dataset.status;
      const role = el.dataset.role;
      if (status && role) {
        if (!state.settings.statusRules) state.settings.statusRules = {};
        if (!state.settings.statusRules[status]) state.settings.statusRules[status] = { canAdvanceRoles: ['admin', 'planner', 'inspector'] };
        const rule = state.settings.statusRules[status];
        if (el.checked) {
          if (!rule.canAdvanceRoles.includes(role)) rule.canAdvanceRoles.push(role);
        } else {
          rule.canAdvanceRoles = rule.canAdvanceRoles.filter(r => r !== role);
        }
        persistSettings();
      }
    }
    if (el.classList.contains('s-default-val')) {
      const k = el.dataset.dkey;
      if (k) {
        if (!state.settings.defaultValues) state.settings.defaultValues = {};
        state.settings.defaultValues[k] = el.value;
        persistSettings();
      }
    }
    if (el.classList.contains('s-default-check')) {
      const k = el.dataset.dkey;
      if (k) {
        if (!state.settings.defaultValues) state.settings.defaultValues = {};
        state.settings.defaultValues[k] = el.checked ? 'true' : '';
        persistSettings();
      }
    }
    if (el.classList.contains('s-widget-toggle')) {
      const k = el.dataset.wkey;
      if (k) {
        if (!state.settings.dashboardWidgets) state.settings.dashboardWidgets = {};
        state.settings.dashboardWidgets[k] = el.checked;
        persistSettings();
      }
    }
    if (el.classList.contains('s-density-radio') && el.checked) {
      state.settings.rowDensity = el.value;
      persistSettings();
      doRender();
    }
    if (el.classList.contains('s-shortcut-input')) {
      const k = el.dataset.sckey;
      if (k) {
        if (!state.settings.keyboardShortcuts) state.settings.keyboardShortcuts = {};
        state.settings.keyboardShortcuts[k] = el.value;
        persistSettings();
      }
    }
    if (el.classList.contains('s-auto-toggle')) {
      const i = parseInt(el.dataset.aidx, 10);
      if (!isNaN(i) && state.settings.automations[i]) {
        state.settings.automations[i].enabled = el.checked;
        persistSettings();
      }
    }
    if (el.classList.contains('s-import-json') && el.files && el.files[0]) {
      const reader = new FileReader();
      reader.onload = function (ev) { importJSON(ev.target.result); el.value = ''; };
      reader.readAsText(el.files[0]);
    }
    if (el.classList.contains('s-backup-restore') && el.files && el.files[0]) {
      const reader = new FileReader();
      reader.onload = function (ev) { restoreAll(ev.target.result); el.value = ''; };
      reader.readAsText(el.files[0]);
    }
  });

  document.getElementById('contentArea').addEventListener('click', e => {
    if (e.target.id === 'cf_save') {
      const label = document.getElementById('cf_label').value.trim();
      const type = document.getElementById('cf_type').value;
      const rawOptions = document.getElementById('cf_options') ? document.getElementById('cf_options').value : '';
      const gridClass = document.getElementById('cf_grid') ? document.getElementById('cf_grid').value : '';
      const required = document.getElementById('cf_required') ? document.getElementById('cf_required').checked : false;
      if (!label) { alert('Field label required.'); return; }
      const options = type === 'select' ? rawOptions.split(',').map(o => o.trim()).filter(Boolean) : undefined;
      const key = 'custom_' + label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      const field = { key, label, type, required, options, gridClass, enabled: true };
      if (state.settings._editingCF !== undefined) {
        const orig = state.settings.customFields[state.settings._editingCF];
        field.key = orig.key;
        state.settings.customFields[state.settings._editingCF] = field;
      } else {
        state.settings.customFields.push(field);
      }
      state.settings._editingCF = undefined;
      persistSettings();
      doRender();
    }
    if (e.target.id === 'cf_cancel') {
      state.settings._editingCF = undefined;
      doRender();
    }
    const palette = e.target.closest('[data-palette]');
    if (palette) {
      state.settings._editingCF = undefined;
      doRender();
      setTimeout(() => {
        const te = document.getElementById('cf_type');
        const og = document.getElementById('cf_options_group');
        if (te) {
          te.value = palette.dataset.palette;
          if (og) og.style.display = palette.dataset.palette === 'select' ? 'flex' : 'none';
        }
      }, 50);
    }
    if (e.target.id === 'eu_save') {
      const i = state.settings._editingUser;
      if (i === undefined || !state.settings.users[i]) return;
      const username = document.getElementById('eu_username').value.trim();
      const password = document.getElementById('eu_password').value;
      const role = document.getElementById('eu_role').value;
      if (!username) { alert('Username required.'); return; }
      if (password) state.settings.users[i].password = password;
      state.settings.users[i].username = username;
      state.settings.users[i].role = role;
      state.settings._editingUser = undefined;
      persistSettings();
      doRender();
    }
    if (e.target.id === 'eu_cancel') {
      state.settings._editingUser = undefined;
      doRender();
    }
    if (e.target.id === 'ea_save') {
      const i = state.settings._editingAuto;
      if (i === undefined || !state.settings.automations[i]) return;
      state.settings.automations[i].fromStatus = document.getElementById('ea_from').value;
      state.settings.automations[i].toStatus = document.getElementById('ea_to').value;
      state.settings.automations[i].delayDays = parseInt(document.getElementById('ea_days').value, 10) || 1;
      state.settings._editingAuto = undefined;
      persistSettings();
      doRender();
    }
    if (e.target.id === 'ea_cancel') {
      state.settings._editingAuto = undefined;
      doRender();
    }
    if (e.target.id === 'ec_save') {
      const i = state.settings._editingClient;
      if (i === undefined || !state.settings.clients[i]) return;
      const name = document.getElementById('ec_name').value.trim();
      if (!name) { alert('Client name required.'); return; }
      state.settings.clients[i].name = name;
      state.settings.clients[i].type = document.getElementById('ec_type').value;
      state.settings.clients[i].contact = document.getElementById('ec_contact').value.trim();
      state.settings.clients[i].phone = document.getElementById('ec_phone').value.trim();
      state.settings._editingClient = undefined;
      persistSettings();
      doRender();
    }
    if (e.target.id === 'ec_cancel') {
      state.settings._editingClient = undefined;
      doRender();
    }
  });

  document.getElementById('modalFooter').addEventListener('click', e => {
    const el = e.target.closest('button,[data-action]');
    if (!el) return;
    if (el.id === 'modalCancel') { closeModal(); e.stopPropagation(); return; }
    if (el.id === 'modalSave') { handleFormSubmit(); e.stopPropagation(); return; }
    const act = el.dataset.action;
    if (act === 'edit') {
      if (!canEdit()) return;
      const t = state.tmps.find(x => x.id === el.dataset.id);
      if (t) { closeModal(); openFormModal(t); }
      e.stopPropagation();
    }
    if (act === 'advance') {
      if (!canAdvance()) return;
      const rec = state.tmps.find(x => x.id === el.dataset.id);
      if (rec && !canAdvanceStatus(rec.status)) {
        alert('Your role does not have permission to advance from this status.');
        e.stopPropagation();
        return;
      }
      if (rec) {
        const as = getActiveStatuses();
        const ci = as.findIndex(s => s.id === rec.status);
        if (ci >= 0 && ci < as.length - 1 && confirm('Move "' + rec.tmpNumber + '" to "' + as[ci + 1].label + '"?')) {
          advanceStatus(el.dataset.id);
          doRender();
          if (viewingId === el.dataset.id) openDetailModal(el.dataset.id); else closeModal();
        }
      }
      e.stopPropagation();
    }
  });

  document.getElementById('contentArea').addEventListener('dragstart', e => {
    const row = e.target.closest('.setting-row[draggable]');
    if (row) {
      row.classList.add('dragging');
      e.dataTransfer.setData('text/plain', row.dataset.idx);
    }
  });
  document.getElementById('contentArea').addEventListener('dragover', e => {
    const row = e.target.closest('.setting-row[draggable]');
    if (row) { e.preventDefault(); row.classList.add('drag-over'); }
  });
  document.getElementById('contentArea').addEventListener('dragleave', e => {
    const row = e.target.closest('.setting-row[draggable]');
    if (row) row.classList.remove('drag-over');
  });
  document.getElementById('contentArea').addEventListener('drop', e => {
    e.preventDefault();
    const target = e.target.closest('.setting-row[draggable]');
    if (!target) return;
    target.classList.remove('drag-over');
    const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
    const toIdx = parseInt(target.dataset.idx, 10);
    if (!isNaN(fromIdx) && !isNaN(toIdx) && fromIdx !== toIdx) {
      const items = state.settings.menuItems;
      const item = items.splice(fromIdx, 1)[0];
      items.splice(toIdx, 0, item);
      persistSettings();
      doRender();
    }
  });
  document.getElementById('contentArea').addEventListener('dragend', e => {
    document.querySelectorAll('.setting-row.dragging,.setting-row.drag-over').forEach(el => el.classList.remove('dragging', 'drag-over'));
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  document.addEventListener('keydown', e => {
    const sc = state.settings.keyboardShortcuts || DEFAULT_KEYBOARD_SHORTCUTS;
    const combo = (e.ctrlKey ? 'ctrl+' : '') + (e.shiftKey ? 'shift+' : '') + (e.altKey ? 'alt+' : '') + e.key.toLowerCase();
    if (e.key === sc.help || (e.key === '?' && !e.ctrlKey && !e.altKey && !e.metaKey) || (e.key === '/' && e.ctrlKey)) {
      e.preventDefault();
      const helpItems = Object.keys(DEFAULT_KEYBOARD_SHORTCUTS).map(k => {
        const labels = { newRequest: 'New TMP Request', globalSearch: 'Global Search', exportJSON: 'Export JSON to file', dashboard: 'Go to Dashboard', calendar: 'Go to Calendar', adminSettings: 'Open Admin Settings', help: 'Show this help' };
        return '<tr><td style="font-family:monospace;font-weight:600">' + escHtml(sc[k] || DEFAULT_KEYBOARD_SHORTCUTS[k]) + '</td><td>' + labels[k] + '</td></tr>';
      }).join('');
      showShortcutHelp(helpItems);
      return;
    }
    Object.keys(sc).forEach(k => {
      if (k === 'help') return;
      const s = sc[k] || DEFAULT_KEYBOARD_SHORTCUTS[k];
      if (combo === s.toLowerCase()) {
        e.preventDefault();
        switch (k) {
          case 'newRequest': if (canEdit()) openFormModal(null); break;
          case 'globalSearch': document.getElementById('globalSearch').focus(); break;
          case 'exportJSON': exportJSON(); break;
          case 'dashboard': navigate('dashboard'); break;
          case 'calendar': navigate('calendar'); break;
          case 'adminSettings':
            if (canManageSettings()) {
              if (state.currentView === 'settings') navigate('dashboard'); else navigate('settings');
            }
            break;
        }
      }
    });
  });
}

async function init() {
  await Promise.all([loadData(), loadSettings(), loadAuditLog()]);
  loadUser();

  const hashMap = {
    '#dashboard': 'dashboard',
    '#new': 'new',
    '#in-progress': 'in-progress',
    '#permits-lga': 'permits-lga',
    '#approvals': 'approvals',
    '#completed': 'completed',
    '#calendar': 'calendar',
    '#settings': 'settings',
  };
  const reverseMap = {
    'dashboard': '#dashboard',
    'new': '#new',
    'in-progress': '#in-progress',
    'permits-lga': '#permits-lga',
    'approvals': '#approvals',
    'completed': '#completed',
    'calendar': '#calendar',
    'settings': '#settings',
  };

  const origNavigate = navigate;
  const navigateFn = function (v) {
    if (v === 'settings' && !canManageSettings()) v = 'dashboard';
    const h = reverseMap[v];
    if (h && window.location.hash !== h) history.pushState(null, '', h);
    origNavigate(v);
  };

  Object.defineProperty(window, '_navigateRef', { value: navigateFn });

  window.addEventListener('hashchange', () => {
    const v = hashMap[window.location.hash] || 'dashboard';
    origNavigate(v);
  });

  setupEvents();

  if (state.currentUser) {
    hideLogin();
    document.getElementById('sidebarUser').textContent = 'Logged in as ' + state.currentUser.username;
    document.getElementById('userBadgeText').textContent = state.currentUser.role.charAt(0).toUpperCase() + state.currentUser.role.slice(1);
    navigateFn(hashMap[window.location.hash] || 'dashboard');
  } else {
    showLogin();
    navigateFn('dashboard');
  }
}

document.addEventListener('DOMContentLoaded', init);

export {
  navigate as navigateView,
  doRender as render,
  openFormModal,
  openDetailModal,
  closeModal,
  showLogin,
  hideLogin,
  handleLogin,
  handleLogout,
  exportJSON,
  exportCSV,
  importJSON,
  backupAll,
  restoreAll,
  bulkSample,
};
