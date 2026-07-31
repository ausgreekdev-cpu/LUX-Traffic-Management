const BASE = '/api';

async function request(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (res.status === 401) { localStorage.removeItem('token'); window.location.href = '/login'; throw new Error('Unauthorized'); }
  if (!res.ok) { const err = await res.json().catch(() => ({ error: 'Request failed' })); throw new Error(err.error || 'Request failed'); }
  return res.json();
}

const api = {
  auth: {
    login: (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
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
    get: (id) => request(`/clients/${id}`),
    create: (data) => request('/clients', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/clients/${id}`, { method: 'DELETE' })
  },
  sites: {
    list: () => request('/sites'),
    get: (id) => request(`/sites/${id}`),
    create: (data) => request('/sites', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/sites/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/sites/${id}`, { method: 'DELETE' })
  },
  projects: {
    list: () => request('/projects'),
    get: (id) => request(`/projects/${id}`),
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
    bulk: (ids, action, status) => request('/tmps/bulk', { method: 'POST', body: JSON.stringify({ ids, action, status }) })
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
    slaRules: (id) => request(`/authorities/${id}/sla-rules`),
    createSLA: (id, data) => request(`/authorities/${id}/sla-rules`, { method: 'POST', body: JSON.stringify(data) }),
    deleteSLA: (authId, ruleId) => request(`/authorities/${authId}/sla-rules/${ruleId}`, { method: 'DELETE' }),
    costCodes: () => request('/authorities/cost-codes'),
    signalisedIntersections: (params) => { const q = params ? '?' + new URLSearchParams(params).toString() : ''; return request(`/authorities/signalised-intersections${q}`); },
    createIntersection: (data) => request('/authorities/signalised-intersections', { method: 'POST', body: JSON.stringify(data) }),
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
    fees: (id) => request(`/permits/${id}/fees`),
    createFee: (id, data) => request(`/permits/${id}/fees`, { method: 'POST', body: JSON.stringify(data) }),
    triggers: (id) => request(`/permits/${id}/triggers`),
    resolveTrigger: (permitId, triggerId) => request(`/permits/${permitId}/triggers/${triggerId}/resolve`, { method: 'PUT' }),
    calculateSLA: (authId, params) => { const q = new URLSearchParams(params).toString(); return request(`/permits/calculate-sla/${authId}?${q}`); }
  },
  timeEntries: {
    list: (params) => { const q = params ? '?' + new URLSearchParams(params).toString() : ''; return request(`/time-entries${q}`); },
    costCodes: () => request('/time-entries/cost-codes'),
    summary: (params) => { const q = params ? '?' + new URLSearchParams(params).toString() : ''; return request(`/time-entries/summary${q}`); },
    create: (data) => request('/time-entries', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/time-entries/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/time-entries/${id}`, { method: 'DELETE' })
  },
  analytics: {
    approvalTimes: (params) => { const q = params ? '?' + new URLSearchParams(params).toString() : ''; return request(`/analytics/approval-times${q}`); },
    plannerThroughput: (params) => { const q = params ? '?' + new URLSearchParams(params).toString() : ''; return request(`/analytics/planner-throughput${q}`); },
    rejectionAnalysis: (params) => { const q = params ? '?' + new URLSearchParams(params).toString() : ''; return request(`/analytics/rejection-analysis${q}`); },
    financialSummary: (params) => { const q = params ? '?' + new URLSearchParams(params).toString() : ''; return request(`/analytics/financial-summary${q}`); },
    dashboard: () => request('/analytics/dashboard')
  },
  email: {
    config: (data) => request('/email/config', { method: 'POST', body: JSON.stringify(data) }),
    test: (to) => request('/email/test', { method: 'POST', body: JSON.stringify({ to }) }),
    sendTMP: (data) => request('/email/send-tmp', { method: 'POST', body: JSON.stringify(data) }),
    logs: (params) => { const q = params ? '?' + new URLSearchParams(params).toString() : ''; return request(`/email/logs${q}`); }
  },
  export: {
    tmpPDF: (id) => fetch(`${BASE}/export/tmp/${id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
    permitsPDF: () => fetch(`${BASE}/export/permits-summary`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
    downloadCSV: async (url, filename) => {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BASE}${url}`, { headers: { Authorization: `Bearer ${token}` } });
      const blob = await res.blob();
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
      URL.revokeObjectURL(blob);
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
    get: () => request('/settings'),
    update: (data) => request('/settings', { method: 'PUT', body: JSON.stringify(data) })
  },
  workflows: {
    stages: (entityType) => request(`/workflows/stages${entityType ? '?entity_type=' + entityType : ''}`),
    createStage: (data) => request('/workflows/stages', { method: 'POST', body: JSON.stringify(data) }),
    updateStage: (id, data) => request(`/workflows/stages/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteStage: (id) => request(`/workflows/stages/${id}`, { method: 'DELETE' }),
    checklist: (entityType, entityId) => request(`/workflows/checklist/${entityType}/${entityId}`),
    setStage: (entityType, entityId, stageId, done) => request(`/workflows/checklist/${entityType}/${entityId}`, { method: 'POST', body: JSON.stringify({ stageId, done }) })
  }
};

export default api;
