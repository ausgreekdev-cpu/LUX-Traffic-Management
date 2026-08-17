const BASE = '/api';

// Short TTL cache for settings (app name, labels, branding). AppText and
// Settings both fetch settings; this avoids duplicate requests and speeds up
// full page reloads while still refreshing after a few minutes.
const settingsCache = { value: null, at: 0 };
const SETTINGS_TTL_MS = 5 * 60 * 1000;

async function request(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (res.status === 401 && !options.skipAuthRedirect) {
    localStorage.removeItem('token');
    if (window.location.pathname !== '/login') window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    const message = err.error || 'Request failed';
    if (res.status === 429 && err.retryAfter) {
      throw new Error(`${message} Please try again in ${Math.ceil(err.retryAfter)} seconds.`);
    }
    throw new Error(message);
  }
  return res.json();
}

const api = {
  auth: {
    login: (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data), skipAuthRedirect: true }),
    me: () => request('/auth/me')
  },
  users: {
    list: () => request('/users'),
    create: (data) => request('/users', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/users/${id}`, { method: 'DELETE' })
  },
  clients: {
    list: () => request('/clients'),
    create: (data) => request('/clients', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/clients/${id}`, { method: 'DELETE' })
  },
  sites: {
    list: () => request('/sites'),
    create: (data) => request('/sites', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/sites/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/sites/${id}`, { method: 'DELETE' })
  },
  projects: {
    list: () => request('/projects'),
    create: (data) => request('/projects', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/projects/${id}`, { method: 'DELETE' })
  },
  tmps: {
    list: (params) => { const q = params ? '?' + new URLSearchParams(params).toString() : ''; return request(`/tmps${q}`); },
    get: (id) => request(`/tmps/${id}`),
    create: (data) => request('/tmps', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/tmps/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/tmps/${id}`, { method: 'DELETE' }),
    bulk: (ids, action, status) => request('/tmps/bulk', { method: 'POST', body: JSON.stringify({ ids, action, status }) }),
    riskPreview: (params) => { const q = new URLSearchParams(params).toString(); return request(`/tmps/risk-preview?${q}`); }
  },
  documents: {
    list: (tmpId) => request(`/documents/tmp/${tmpId}`),
    upload: async (tmpId, file) => {
      const token = localStorage.getItem('token');
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BASE}/documents/upload/${tmpId}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
      if (!res.ok) throw new Error('Upload failed');
      return res.json();
    },
    download: (id) => `${BASE}/documents/download/${id}`,
    preview: (id) => `${BASE}/documents/preview/${id}?token=${encodeURIComponent(localStorage.getItem('token') || '')}`,
    delete: (id) => request(`/documents/${id}`, { method: 'DELETE' })
  },
  dashboard: () => request('/dashboard'),
  authorities: {
    list: () => request('/authorities'),
    get: (id) => request(`/authorities/${id}`),
    create: (data) => request('/authorities', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/authorities/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/authorities/${id}`, { method: 'DELETE' }),
    createSLA: (id, data) => request(`/authorities/${id}/sla-rules`, { method: 'POST', body: JSON.stringify(data) }),
    deleteSLA: (authId, ruleId) => request(`/authorities/${authId}/sla-rules/${ruleId}`, { method: 'DELETE' }),
    importDirectory: async (file) => {
      const token = localStorage.getItem('token');
      const form = new FormData();
      form.append('pdf', file);
      const res = await fetch(`${BASE}/authorities/import-directory`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: 'Import failed' })); throw new Error(err.error || 'Import failed'); }
      return res.json();
    }
  },
  permits: {
    list: (params) => { const q = params ? '?' + new URLSearchParams(params).toString() : ''; return request(`/permits${q}`); },
    get: (id) => request(`/permits/${id}`),
    create: (data) => request('/permits', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/permits/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/permits/${id}`, { method: 'DELETE' }),
    bulk: (ids, action, status) => request('/permits/bulk', { method: 'POST', body: JSON.stringify({ ids, action, status }) }),
    createFee: (id, data) => request(`/permits/${id}/fees`, { method: 'POST', body: JSON.stringify(data) }),
    resolveTrigger: (permitId, triggerId) => request(`/permits/${permitId}/triggers/${triggerId}/resolve`, { method: 'PUT' })
  },
  timeEntries: {
    list: (params) => { const q = params ? '?' + new URLSearchParams(params).toString() : ''; return request(`/time-entries${q}`); },
    costCodes: () => request('/time-entries/cost-codes'),
    summary: (params) => { const q = params ? '?' + new URLSearchParams(params).toString() : ''; return request(`/time-entries/summary${q}`); },
    create: (data) => request('/time-entries', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id) => request(`/time-entries/${id}`, { method: 'DELETE' })
  },
  analytics: {
    approvalTimes: (params) => { const q = params ? '?' + new URLSearchParams(params).toString() : ''; return request(`/analytics/approval-times${q}`); },
    rejectionAnalysis: (params) => { const q = params ? '?' + new URLSearchParams(params).toString() : ''; return request(`/analytics/rejection-analysis${q}`); },
    financialSummary: (params) => { const q = params ? '?' + new URLSearchParams(params).toString() : ''; return request(`/analytics/financial-summary${q}`); }
  },
  email: {
    getConfig: () => request('/email/config'),
    config: (data) => request('/email/config', { method: 'POST', body: JSON.stringify(data) }),
    test: (to) => request('/email/test', { method: 'POST', body: JSON.stringify({ to }) }),
    sendTMP: (data) => request('/email/send-tmp', { method: 'POST', body: JSON.stringify(data) }),
    logs: (params) => { const q = params ? '?' + new URLSearchParams(params).toString() : ''; return request(`/email/logs${q}`); },
    templates: () => request('/email/templates'),
    createTemplate: (data) => request('/email/templates', { method: 'POST', body: JSON.stringify(data) }),
    updateTemplate: (id, data) => request(`/email/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteTemplate: (id) => request(`/email/templates/${id}`, { method: 'DELETE' }),
    previewDraft: (data) => request('/email/templates/preview', { method: 'POST', body: JSON.stringify(data) }),
    previewTemplate: (id, data) => request(`/email/templates/${id}/preview`, { method: 'POST', body: JSON.stringify(data) })
  },
  export: {
    tmpPDF: (id) => fetch(`${BASE}/export/tmp/${id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
    downloadCSV: async (url, filename) => {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BASE}${url}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Download failed' }));
        throw new Error(err.error || 'Download failed');
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = objectUrl; a.download = filename; a.click();
      URL.revokeObjectURL(objectUrl);
    }
  },
  notifications: {
    list: (params) => { const q = params ? '?' + new URLSearchParams(params).toString() : ''; return request(`/notifications${q}`); },
    unreadCount: () => request('/notifications/unread-count'),
    markRead: (id) => request(`/notifications/${id}/read`, { method: 'POST' }),
    markAllRead: () => request('/notifications/read-all', { method: 'POST' }),
    scan: () => request('/notifications/scan', { method: 'POST', body: JSON.stringify({}) })
  },
  settings: {
    get: async () => {
      const now = Date.now();
      if (settingsCache.value && now - settingsCache.at < SETTINGS_TTL_MS) return settingsCache.value;
      const value = await request('/settings');
      settingsCache.value = value;
      settingsCache.at = now;
      return value;
    },
    update: (data) => {
      settingsCache.value = null;
      return request('/settings', { method: 'PUT', body: JSON.stringify(data) });
    }
  },
  workflows: {
    stages: (entityType, templateId) => request(`/workflows/stages${templateId ? '?template_id=' + templateId : (entityType ? '?entity_type=' + entityType : '')}`),
    createStage: (data) => request('/workflows/stages', { method: 'POST', body: JSON.stringify(data) }),
    updateStage: (id, data) => request(`/workflows/stages/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteStage: (id) => request(`/workflows/stages/${id}`, { method: 'DELETE' }),
    templates: (entityType) => request(`/workflows/templates${entityType ? '?entity_type=' + entityType : ''}`),
    createTemplate: (data) => request('/workflows/templates', { method: 'POST', body: JSON.stringify(data) }),
    updateTemplate: (id, data) => request(`/workflows/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteTemplate: (id) => request(`/workflows/templates/${id}`, { method: 'DELETE' }),
    checklist: (entityType, entityId) => request(`/workflows/checklist/${entityType}/${entityId}`),
    setStage: (entityType, entityId, stageId, done) => request(`/workflows/checklist/${entityType}/${entityId}`, { method: 'POST', body: JSON.stringify({ stageId, done }) })
  },
  automations: {
    rules: (params) => { const q = params ? '?' + new URLSearchParams(params).toString() : ''; return request(`/automations/rules${q}`); },
    getRule: (id) => request(`/automations/rules/${id}`),
    createRule: (data) => request('/automations/rules', { method: 'POST', body: JSON.stringify(data) }),
    updateRule: (id, data) => request(`/automations/rules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteRule: (id) => request(`/automations/rules/${id}`, { method: 'DELETE' }),
    testRule: (id, entityType, entityId) => request(`/automations/rules/${id}/test`, { method: 'POST', body: JSON.stringify({ entity_type: entityType, entity_id: entityId }) }),
    ruleRuns: (id, params) => { const q = params ? '?' + new URLSearchParams(params).toString() : ''; return request(`/automations/rules/${id}/runs${q}`); },
    runs: (params) => { const q = params ? '?' + new URLSearchParams(params).toString() : ''; return request(`/automations/runs${q}`); },
    presets: () => request('/automations/presets'),
    installPreset: (id) => request(`/automations/presets/${id}/install`, { method: 'POST' }),
    runScheduled: () => request('/automations/run-scheduled', { method: 'POST' })
  },
  agents: {
    list: () => request('/agents'),
    run: (agentId, entityType, entityId) => request(`/agents/${agentId}/run`, { method: 'POST', body: JSON.stringify({ entity_type: entityType, entity_id: entityId }) }),
    runs: (params) => { const q = params ? '?' + new URLSearchParams(params).toString() : ''; return request(`/agents/runs${q}`); },
    apply: (runId) => request(`/agents/runs/${runId}/apply`, { method: 'POST' })
  },
  correspondence: {
    list: (params) => { const q = params ? '?' + new URLSearchParams(params).toString() : ''; return request(`/integrations/correspondence${q}`); },
    review: (id, review_status) => request(`/integrations/correspondence/${id}/review`, { method: 'POST', body: JSON.stringify({ review_status }) })
  },
  kanban: {
    board: (entityType) => request(`/kanban/board?entity_type=${entityType}`),
    move: (entityType, entityId, data) => request(`/kanban/cards/${entityType}/${entityId}`, { method: 'PUT', body: JSON.stringify(data) }),
    columns: (entityType) => request(`/kanban/columns?entity_type=${entityType}`),
    createColumn: (data) => request('/kanban/columns', { method: 'POST', body: JSON.stringify(data) }),
    updateColumn: (id, data) => request(`/kanban/columns/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteColumn: (id, force) => request(`/kanban/columns/${id}`, { method: 'DELETE', body: JSON.stringify({ force: !!force }) }),
    reorderColumns: (entityType, ids) => request('/kanban/columns/reorder', { method: 'POST', body: JSON.stringify({ entity_type: entityType, ids }) }),
    analytics: (entityType, days) => request(`/kanban/analytics?entity_type=${entityType}&days=${days}`)
  },
  branding: {
    public: () => request('/branding', { skipAuthRedirect: true }),
    _scope: (domain) => domain ? `?domain=${encodeURIComponent(domain)}` : '',
    full: (domain) => request(`/branding/full${api.branding._scope(domain)}`),
    save: (data, domain) => request(`/branding${api.branding._scope(domain)}`, { method: 'PUT', body: JSON.stringify(data) }),
    preview: (data) => request('/branding/preview', { method: 'POST', body: JSON.stringify(data) }),
    uploadAsset: async (slot, file, domain) => {
      const token = localStorage.getItem('token');
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BASE}/branding/assets/${slot}${api.branding._scope(domain)}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: 'Upload failed' })); throw new Error(err.error || 'Upload failed'); }
      return res.json();
    },
    deleteAsset: (slot, domain) => request(`/branding/assets/${slot}${api.branding._scope(domain)}`, { method: 'DELETE' }),
    reset: (domain) => request(`/branding/reset${api.branding._scope(domain)}`, { method: 'POST' }),
    versions: (domain) => request(`/branding/versions${api.branding._scope(domain)}`),
    restoreVersion: (id) => request(`/branding/versions/${id}/restore`, { method: 'POST' }),
    domains: () => request('/branding/domain'),
    addDomain: (data) => request('/branding/domain', { method: 'POST', body: JSON.stringify(data) }),
    deleteDomain: (id) => request(`/branding/domain/${id}`, { method: 'DELETE' })
  }
};

export default api;
