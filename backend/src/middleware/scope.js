import db from '../db.js';

// Client data-scoping helpers: a client account only ever sees data linked
// to the company (clients row) its account is tied to (users.client_id).

export function isClientUser(user) {
  return user?.role === 'client';
}

export function tmpClientFilter(clientId) {
  // Callers are expected to already have tmp_projects joined as `p`.
  return {
    where: 'p.client_id = ?',
    param: clientId
  };
}

export function tmpOwnedByClient(tmp, clientId) {
  if (!tmp) return false;
  const row = db.prepare('SELECT client_id FROM tmp_projects WHERE id = ?').get(tmp.project_id);
  return !!row && row.client_id === clientId;
}

export function permitOwnedByClient(permit, clientId) {
  if (!permit) return false;
  const row = db.prepare(`
    SELECT p.client_id FROM tmp_projects p
    INNER JOIN traffic_management_plans t ON t.project_id = p.id
    WHERE t.id = ?
  `).get(permit.tmp_id);
  return !!row && row.client_id === clientId;
}

export function projectOwnedByClient(project, clientId) {
  return !!project && project.client_id === clientId;
}

export function clientOwnedByClient(client, clientId) {
  return !!client && client.id === clientId;
}
