import { v4 as uuid } from 'uuid';
import db from './db.js';
import { emitEvent } from './events.js';
import { applicableStages as workflowsStages, entityContext } from './routes/workflows.js';

export const BOARD_ENTITY_TYPES = ['tmp', 'permit'];

export const DEFAULT_TMP_COLUMNS = [
  { name: 'Backlog', sort_order: 1, wip_limit: null, maps_to_status: 'draft', colour: 'bg-gray-100', description: 'Plans captured but not yet started' },
  { name: 'Drafting', sort_order: 2, wip_limit: 10, maps_to_status: null, colour: 'bg-blue-50', description: 'TMP drawings and documentation being prepared' },
  { name: 'Client Review', sort_order: 3, wip_limit: 8, maps_to_status: null, colour: 'bg-purple-50', description: 'Plan sent to the client for sign-off', requires_stages_json: JSON.stringify(['TMP drawing prepared', 'Internal review']) },
  { name: 'Safety Audit', sort_order: 4, wip_limit: 8, maps_to_status: 'submitted', colour: 'bg-amber-50', assign_role: 'staff', stale_business_days: 3, requires_stages_json: JSON.stringify(['TMP drawing prepared', 'Internal review', 'Client sign-off', 'Site risk assessment']) },
  { name: 'Council Pending Approval', sort_order: 5, wip_limit: 15, maps_to_status: 'submitted', colour: 'bg-orange-50', stale_business_days: 5, requires_stages_json: JSON.stringify(['TMP drawing prepared', 'Internal review', 'Client sign-off', 'Site risk assessment']) },
  { name: 'Approved / Deployment', sort_order: 6, wip_limit: 12, maps_to_status: 'approved', colour: 'bg-green-50' },
  { name: 'Completed', sort_order: 7, wip_limit: null, maps_to_status: 'completed', colour: 'bg-green-100', is_final: 1 }
];

export const DEFAULT_PERMIT_COLUMNS = [
  { name: 'Backlog', sort_order: 1, wip_limit: null, maps_to_status: 'draft', colour: 'bg-gray-100', description: 'Permits not yet prepared' },
  { name: 'Submission Prep', sort_order: 2, wip_limit: 10, maps_to_status: null, colour: 'bg-blue-50', description: 'Application pack being assembled' },
  { name: 'Submitted', sort_order: 3, wip_limit: 12, maps_to_status: 'submitted', colour: 'bg-blue-100', stale_business_days: 5 },
  { name: 'Under Review', sort_order: 4, wip_limit: 12, maps_to_status: 'under_review', colour: 'bg-purple-50', stale_business_days: 7 },
  { name: 'Approved / Active', sort_order: 5, wip_limit: null, maps_to_status: 'approved', colour: 'bg-green-50' },
  { name: 'Completed / Expired', sort_order: 6, wip_limit: null, maps_to_status: 'completed', colour: 'bg-green-100', is_final: 1 },
  { name: 'Rejected / Cancelled', sort_order: 7, wip_limit: null, maps_to_status: 'rejected', colour: 'bg-red-50' }
];

export function ensureBoardColumns() {
  for (const entityType of BOARD_ENTITY_TYPES) {
    const count = db.prepare('SELECT COUNT(*) as c FROM board_columns WHERE entity_type = ?').get(entityType).c;
    if (count > 0) continue;
    const defaults = entityType === 'tmp' ? DEFAULT_TMP_COLUMNS : DEFAULT_PERMIT_COLUMNS;
    const insert = db.prepare(`
      INSERT INTO board_columns (id, entity_type, name, description, sort_order, wip_limit, colour, maps_to_status, assign_role, requires_stages_json, stale_business_days, is_final)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const tx = db.transaction((cols) => {
      for (const c of cols) {
        insert.run(uuid(), entityType, c.name, c.description || null, c.sort_order, c.wip_limit ?? null, c.colour, c.maps_to_status || null, c.assign_role || null, c.requires_stages_json || null, c.stale_business_days ?? null, c.is_final || 0);
      }
    });
    tx(defaults);
  }
  return true;
}

export function defaultColumn(entityType) {
  return db.prepare('SELECT * FROM board_columns WHERE entity_type = ? ORDER BY sort_order LIMIT 1').get(entityType) || null;
}

export function columnForStatus(entityType, status) {
  return db.prepare('SELECT * FROM board_columns WHERE entity_type = ? AND maps_to_status = ? ORDER BY sort_order LIMIT 1').get(entityType, status)
    || defaultColumn(entityType);
}

export function resolveLane(entityType, entityId) {
  if (entityType === 'permit') {
    const p = db.prepare('SELECT a.short_name FROM permits pe LEFT JOIN authorities a ON pe.authority_id = a.id WHERE pe.id = ?').get(entityId);
    return (p && p.short_name) || '';
  }
  return '';
}

export function entityRow(entityType, entityId) {
  const table = entityType === 'tmp' ? 'traffic_management_plans' : 'permits';
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(entityId) || null;
}

export function ensureBoardCard(entityType, entityId) {
  const existing = db.prepare('SELECT * FROM board_cards WHERE entity_type = ? AND entity_id = ?').get(entityType, entityId);
  if (existing) return existing;
  const entity = entityRow(entityType, entityId);
  const col = entity ? columnForStatus(entityType, entity.status) : defaultColumn(entityType);
  if (!col) return null;
  const id = uuid();
  const lane = resolveLane(entityType, entityId);
  const created = entity?.created_at || new Date().toISOString();
  db.prepare(`
    INSERT INTO board_cards (id, entity_type, entity_id, column_id, lane, sort_order, entered_column_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?, datetime('now'))
  `).run(id, entityType, entityId, col.id, lane, created, created);
  db.prepare('INSERT INTO board_card_history (id, card_id, column_id, lane, entered_at) VALUES (?, ?, ?, ?, ?)')
    .run(uuid(), id, col.id, lane, created);
  return db.prepare('SELECT * FROM board_cards WHERE id = ?').get(id);
}

export function backfillBoard(entityType) {
  const table = entityType === 'tmp' ? 'traffic_management_plans' : 'permits';
  const ids = db.prepare(`SELECT id FROM ${table}`).all().map(r => r.id);
  let created = 0;
  for (const id of ids) {
    if (!db.prepare('SELECT id FROM board_cards WHERE entity_type = ? AND entity_id = ?').get(entityType, id)) {
      ensureBoardCard(entityType, id);
      created++;
    }
  }
  return created;
}

export function pickUserForRole(role) {
  if (!role) return null;
  const row = db.prepare(`
    SELECT u.id FROM users u
    LEFT JOIN board_cards bc ON bc.assigned_user_id = u.id
    WHERE u.role = ?
    GROUP BY u.id
    ORDER BY COUNT(bc.id) ASC, u.name ASC
    LIMIT 1
  `).get(role);
  return row ? row.id : null;
}

export function applyAutoAssign(column, entityType, entityId) {
  if (!column || !column.assign_role) return null;
  const userId = pickUserForRole(column.assign_role);
  if (!userId) return null;
  db.prepare("UPDATE board_cards SET assigned_user_id = ?, updated_at = datetime('now') WHERE entity_type = ? AND entity_id = ?").run(userId, entityType, entityId);
  emitEvent('board.card_assigned', { entity_type: entityType, entity_id: entityId, role: column.assign_role, assigned_user_id: userId, column_id: column.id, column_name: column.name });
  return userId;
}

export function businessDaysAgo(days) {
  const now = new Date();
  const cursor = new Date(now);
  let remaining = days;
  while (remaining > 0) {
    cursor.setDate(cursor.getDate() - 1);
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) remaining--;
  }
  return cursor.toISOString();
}

export function incompleteColumnStages(entityType, entityId, column) {
  if (!column || !column.requires_stages_json) return [];
  let names;
  try { names = JSON.parse(column.requires_stages_json); } catch { return []; }
  if (!Array.isArray(names) || !names.length) return [];
  const ctx = entityContext(entityType, entityId);
  const stages = ctx ? workflowsStages(entityType, ctx.complexity, ctx.authority_id) : [];
  const byName = new Map(stages.map(s => [s.name, s]));
  const done = new Set(db.prepare('SELECT s.name as name FROM workflow_checklist c JOIN workflow_stages s ON c.stage_id = s.id WHERE c.entity_type = ? AND c.entity_id = ? AND c.is_done = 1').all(entityType, entityId).map(r => r.name));
  return names.filter(n => byName.has(n) && !done.has(n));
}
