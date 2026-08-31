import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { roleAtLeast } from '../middleware/auth.js';
import { isClientUser } from '../middleware/scope.js';
import { emitEvent } from '../events.js';
import { can } from '../saas/entitlements.js';
import { getTenantId } from '../middleware/tenant.js';
import { entityContext as workflowContext, applicableStages as workflowApplicableStages } from './workflows.js';
import {
  BOARD_ENTITY_TYPES, ensureBoardCard, backfillBoard, defaultColumn,
  entityRow, applyAutoAssign, incompleteColumnStages, ensureBoardColumns
} from '../board.js';

const router = Router();
router.use(authenticate);

function parseDt(str) {
  if (!str) return null;
  if (String(str).includes('T')) return new Date(str);
  return new Date(String(str).replace(' ', 'T') + 'Z');
}

function clientScopedEntityIds(entityType, clientId) {
  if (entityType === 'tmp') {
    return db.prepare('SELECT t.id FROM traffic_management_plans t LEFT JOIN tmp_projects p ON t.project_id = p.id WHERE p.client_id = ?').all(clientId).map(r => r.id);
  }
  return db.prepare(`
    SELECT pe.id FROM permits pe
    INNER JOIN traffic_management_plans t ON pe.tmp_id = t.id
    INNER JOIN tmp_projects p ON t.project_id = p.id
    WHERE p.client_id = ?
  `).all(clientId).map(r => r.id);
}

function columnRequiresValidation(entityType, entityId, column, lane) {
  if (lane === 'emergency') return { missing: [], blocked: false };
  const missing = incompleteColumnStages(entityType, entityId, column);
  return { missing, blocked: missing.length > 0 };
}

function wipCheck(column, entityType, entityId) {
  if (!column.enforce_wip || !column.wip_limit) return { allowed: true, count: 0 };
  const count = db.prepare('SELECT COUNT(*) as c FROM board_cards WHERE column_id = ? AND entity_type = ? AND entity_id != ?').get(column.id, entityType, entityId).c;
  return { allowed: count < column.wip_limit, count };
}

function cardView(entityType, card) {
  let view;
  if (entityType === 'tmp') {
    view = db.prepare(`
      SELECT t.id, t.title, t.reference, t.status, t.plan_type, t.complexity, t.risk_band, t.risk_score,
        t.start_date, t.end_date, t.created_at, s.name as site_name, p.name as project_name, u.name as creator_name
      FROM traffic_management_plans t
      LEFT JOIN sites s ON t.site_id = s.id
      LEFT JOIN tmp_projects p ON t.project_id = p.id
      LEFT JOIN users u ON t.created_by = u.id
      WHERE t.id = ?
    `).get(card.entity_id);
  } else {
    view = db.prepare(`
      SELECT pe.id, pe.status, pe.complexity, pe.submission_date, pe.approval_date, pe.expiry_date, pe.created_at,
        t.title, t.reference, t.plan_type, t.risk_band, t.risk_score, t.start_date, t.end_date, t.created_at as tmp_created_at,
        a.name as authority_name, a.short_name as authority_short, s.name as site_name
      FROM permits pe
      LEFT JOIN traffic_management_plans t ON pe.tmp_id = t.id
      LEFT JOIN authorities a ON pe.authority_id = a.id
      LEFT JOIN sites s ON t.site_id = s.id
      WHERE pe.id = ?
    `).get(card.entity_id);
  }
  if (!view) return null;

  let checklistDone = 0;
  let checklistTotal = 0;
  try {
    const done = db.prepare('SELECT COUNT(*) as c FROM workflow_checklist WHERE entity_type = ? AND entity_id = ? AND is_done = 1').get(entityType, card.entity_id).c;
    const ctx = workflowContext(entityType, card.entity_id);
    const stages = ctx ? workflowApplicableStages(entityType, ctx.complexity, ctx.authority_id) : [];
    checklistDone = done;
    checklistTotal = stages.length;
  } catch {}

  return {
    id: card.id,
    entity_id: card.entity_id,
    column_id: card.column_id,
    lane: card.lane,
    sort_order: card.sort_order,
    assigned_user_id: card.assigned_user_id,
    entered_column_at: card.entered_column_at,
    created_at: card.created_at,
    stale_days: card.entered_column_at ? Math.max(0, Math.floor((Date.now() - (parseDt(card.entered_column_at)?.getTime() || Date.now())) / 86400000)) : 0,
    ...view,
    title: view.title || view.reference || card.entity_id,
    checklist_done: checklistDone,
    checklist_total: checklistTotal
  };
}

router.get('/columns', (req, res) => {
  const entityType = req.query.entity_type || 'tmp';
  if (!BOARD_ENTITY_TYPES.includes(entityType)) return res.status(400).json({ error: 'Invalid entity_type (tmp or permit)' });
  res.json(db.prepare('SELECT * FROM board_columns WHERE entity_type = ? ORDER BY sort_order').all(entityType));
});

router.post('/columns', roleAtLeast('manager'), (req, res) => {
  const { entity_type, name, description, wip_limit, enforce_wip, colour, maps_to_status, assign_role, requires_stages, stale_business_days, is_final } = req.body || {};
  if (!BOARD_ENTITY_TYPES.includes(entity_type)) return res.status(400).json({ error: 'Invalid entity_type (tmp or permit)' });
  if (!name || !name.trim()) return res.status(400).json({ error: 'Column name required' });
  const dup = db.prepare('SELECT id FROM board_columns WHERE entity_type = ? AND name = ?').get(entity_type, name.trim());
  if (dup) return res.status(400).json({ error: 'A column with that name already exists' });
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM board_columns WHERE entity_type = ?').get(entity_type).m || 0;
  const id = uuid();
  db.prepare(`
    INSERT INTO board_columns (id, entity_type, name, description, sort_order, wip_limit, enforce_wip, colour, maps_to_status, assign_role, requires_stages_json, stale_business_days, is_final)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, entity_type, name.trim(), description || null, maxOrder + 1, wip_limit ?? null, enforce_wip ? 1 : 0, colour || 'bg-gray-50', maps_to_status || null, assign_role || null, requires_stages ? JSON.stringify(requires_stages) : null, stale_business_days ?? null, is_final ? 1 : 0);
  res.status(201).json(db.prepare('SELECT * FROM board_columns WHERE id = ?').get(id));
});

router.put('/columns/:id', roleAtLeast('manager'), (req, res) => {
  const existing = db.prepare('SELECT * FROM board_columns WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Column not found' });
  const { name, description, wip_limit, enforce_wip, colour, maps_to_status, assign_role, requires_stages, stale_business_days, is_final } = req.body || {};
  if (name !== undefined && name !== null && !String(name).trim()) return res.status(400).json({ error: 'Column name cannot be empty' });
  db.prepare(`
    UPDATE board_columns SET name = ?, description = ?, wip_limit = ?, enforce_wip = ?, colour = ?, maps_to_status = ?,
      assign_role = ?, requires_stages_json = ?, stale_business_days = ?, is_final = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(name !== undefined ? String(name).trim() : existing.name, description !== undefined ? description : existing.description, wip_limit !== undefined ? (wip_limit ?? null) : existing.wip_limit, enforce_wip !== undefined ? (enforce_wip ? 1 : 0) : existing.enforce_wip, colour !== undefined ? colour : existing.colour, maps_to_status !== undefined ? (maps_to_status || null) : existing.maps_to_status, assign_role !== undefined ? (assign_role || null) : existing.assign_role, requires_stages !== undefined ? (Array.isArray(requires_stages) ? JSON.stringify(requires_stages) : null) : existing.requires_stages_json, stale_business_days !== undefined ? (stale_business_days ?? null) : existing.stale_business_days, is_final !== undefined ? (is_final ? 1 : 0) : existing.is_final, req.params.id);
  res.json(db.prepare('SELECT * FROM board_columns WHERE id = ?').get(req.params.id));
});

router.delete('/columns/:id', roleAtLeast('manager'), (req, res) => {
  const existing = db.prepare('SELECT * FROM board_columns WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Column not found' });
  const count = db.prepare('SELECT COUNT(*) as c FROM board_cards WHERE column_id = ?').get(req.params.id).c;
  if (count > 0 && !req.body?.force) {
    return res.status(409).json({ error: `Column has ${count} card(s). Move them first or pass force to reassign to the first column.` });
  }
  const fallback = defaultColumn(existing.entity_type);
  if (count > 0 && fallback) {
    db.prepare('UPDATE board_cards SET column_id = ?, updated_at = datetime(\'now\') WHERE column_id = ?').run(fallback.id, req.params.id);
  }
  db.prepare('DELETE FROM board_columns WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.post('/columns/reorder', roleAtLeast('manager'), (req, res) => {
  const { entity_type, ids } = req.body || {};
  if (!BOARD_ENTITY_TYPES.includes(entity_type) || !Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ error: 'entity_type and ordered ids[] are required' });
  }
  const remaining = db.prepare('SELECT id FROM board_columns WHERE entity_type = ? AND id NOT IN (' + ids.map(() => '?').join(',') + ') ORDER BY sort_order').all(entity_type, ...ids).map(r => r.id);
  const ordered = [...ids, ...remaining];
  const cases = ordered.map((_, i) => `WHEN id = ? THEN ${i + 1}`).join(' ');
  const tx = db.transaction(() => {
    // SQLite enforces UNIQUE per-row during UPDATE, so first shift everything out
    // of the 1..N range, then assign final positions without intermediate collisions.
    db.prepare('UPDATE board_columns SET sort_order = sort_order + 10000 WHERE entity_type = ?').run(entity_type);
    db.prepare(`UPDATE board_columns SET sort_order = CASE ${cases} ELSE sort_order END, updated_at = datetime('now') WHERE entity_type = ?`)
      .run(...ordered, entity_type);
  });
  tx();
  res.json(db.prepare('SELECT * FROM board_columns WHERE entity_type = ? ORDER BY sort_order').all(entity_type));
});

router.get('/board', (req, res) => {
  const entityType = req.query.entity_type || 'tmp';
  if (!BOARD_ENTITY_TYPES.includes(entityType)) return res.status(400).json({ error: 'Invalid entity_type (tmp or permit)' });
  ensureBoardColumns();
  backfillBoard(entityType);

  const clientId = isClientUser(req.user) ? req.user.clientId : null;
  const scoped = clientId ? clientScopedEntityIds(entityType, clientId) : null;

  let cards = db.prepare('SELECT * FROM board_cards WHERE entity_type = ?').all(entityType);
  if (scoped) {
    const set = new Set(scoped);
    cards = cards.filter(c => set.has(c.entity_id));
  }

  const views = cards.map(c => cardView(entityType, c)).filter(Boolean);
  const columns = db.prepare('SELECT * FROM board_columns WHERE entity_type = ? ORDER BY sort_order').all(entityType)
    .map(c => ({ ...c, count: views.filter(v => v.column_id === c.id).length }));

  const lanes = ['emergency', ...Array.from(new Set(views.map(v => v.lane).filter(Boolean).filter(l => l !== 'emergency')))];
  const users = db.prepare('SELECT id, name, role FROM users ORDER BY name').all()
    .filter(u => u.role !== 'client');
  const statuses = db.prepare(entityType === 'tmp'
    ? 'SELECT DISTINCT status FROM traffic_management_plans'
    : 'SELECT DISTINCT status FROM permits').all().map(r => r.status);

  res.json({ entity_type: entityType, columns, lanes, cards: views, users, statuses });
});

router.put('/cards/:entityType/:entityId', (req, res) => {
  const { entityType, entityId } = req.params;
  if (!BOARD_ENTITY_TYPES.includes(entityType)) return res.status(400).json({ error: 'Invalid entity type' });
  const entity = entityRow(entityType, entityId);
  if (!entity) return res.status(404).json({ error: 'Entity not found' });

  const { column_id, lane, sort_order, assigned_user_id, force } = req.body || {};
  const card = ensureBoardCard(entityType, entityId);
  if (!card) return res.status(500).json({ error: 'Could not place card on board' });

  const targetColumn = column_id !== undefined && column_id !== card.column_id
    ? db.prepare('SELECT * FROM board_columns WHERE id = ? AND entity_type = ?').get(column_id, entityType)
    : db.prepare('SELECT * FROM board_columns WHERE id = ?').get(card.column_id);
  if (!targetColumn) return res.status(400).json({ error: 'Invalid column' });

  const nextLane = lane !== undefined ? lane : card.lane;
  const nextSort = sort_order !== undefined ? sort_order : card.sort_order;

  const columnChanged = targetColumn.id !== card.column_id;
  const laneChanged = nextLane !== card.lane;
  const isEmergency = nextLane === 'emergency';

  // dispatch lanes are Agency-only (pro = list view only). Gate lane === 'dispatch'.
  if (nextLane && String(nextLane).toLowerCase() === 'dispatch') {
    const tenantId = getTenantId(req);
    if (tenantId && !can(tenantId, 'dispatch')) {
      return res.status(402).json({ error: 'upgrade_required', feature: 'dispatch', message: 'Dispatch lanes require Agency plan. Upgrade to Agency.' });
    }
  }

  if (columnChanged && !isEmergency) {
    const { missing } = columnRequiresValidation(entityType, entityId, targetColumn, nextLane);
    if (missing.length && !force) {
      return res.status(409).json({ error: `Definition of Done not met: ${missing.join(', ')}`, missing });
    }
    const wip = wipCheck(targetColumn, entityType, entityId);
    if (!wip.allowed) {
      return res.status(409).json({ error: `Column "${targetColumn.name}" is at its WIP limit (${wip.count}/${targetColumn.wip_limit})` });
    }
  }

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    if (columnChanged || laneChanged) {
      db.prepare('UPDATE board_card_history SET left_at = ? WHERE card_id = ? AND left_at IS NULL').run(now, card.id);
      db.prepare('INSERT INTO board_card_history (id, card_id, column_id, lane, entered_at) VALUES (?, ?, ?, ?, ?)').run(uuid(), card.id, targetColumn.id, nextLane, now);
    }
    const nextAssigned = assigned_user_id !== undefined ? assigned_user_id : card.assigned_user_id;
    db.prepare(`
      UPDATE board_cards SET column_id = ?, lane = ?, sort_order = ?, assigned_user_id = ?,
        entered_column_at = CASE WHEN ? THEN ? ELSE entered_column_at END, updated_at = datetime('now')
      WHERE id = ?
    `).run(targetColumn.id, nextLane, nextSort, nextAssigned, columnChanged ? 1 : 0, now, card.id);
  });
  tx();

  let autoAssigned = null;
  if (targetColumn.assign_role && assigned_user_id === undefined && !isEmergency) {
    autoAssigned = applyAutoAssign(targetColumn, entityType, entityId);
  }

  if (targetColumn.maps_to_status && targetColumn.maps_to_status !== entity.status) {
    const previous_status = entity.status;
    if (entityType === 'tmp') {
      db.prepare('UPDATE traffic_management_plans SET status = ?, updated_at = datetime(\'now\') WHERE id = ?').run(targetColumn.maps_to_status, entityId);
      db.prepare('INSERT INTO plan_activities (id, tmp_id, user_id, action, description) VALUES (?, ?, ?, ?, ?)').run(uuid(), entityId, req.user.id, 'status_changed', `Status changed to ${targetColumn.maps_to_status} (kanban)`);
      const updated = db.prepare('SELECT * FROM traffic_management_plans WHERE id = ?').get(entityId);
      emitEvent('tmp.status_changed', { ...entity, ...updated }, { previous_status, by: req.user.id, from_kanban: true });
      if (targetColumn.maps_to_status === 'completed') {
        emitEvent('tmp.completed', updated, { previous_status, by: req.user.id, from_kanban: true });
      }
    } else {
      db.prepare('UPDATE permits SET status = ?, updated_at = datetime(\'now\') WHERE id = ?').run(targetColumn.maps_to_status, entityId);
      const updated = db.prepare('SELECT * FROM permits WHERE id = ?').get(entityId);
      emitEvent('permit.status_changed', { ...entity, ...updated }, { previous_status, by: req.user.id, from_kanban: true });
    }
  }

  if (columnChanged || laneChanged) {
    emitEvent('board.card_moved', {
      id: card.id,
      entity_type: entityType,
      entity_id: entityId,
      from_column: card.column_id,
      from_column_name: db.prepare('SELECT name FROM board_columns WHERE id = ?').get(card.column_id)?.name || null,
      to_column: targetColumn.id,
      to_column_name: targetColumn.name,
      from_lane: card.lane,
      to_lane: nextLane,
      lane: nextLane,
      status: entity.status,
      title: entity.title,
      reference: entity.reference,
      created_by: entity.created_by,
      by: req.user.id
    });
  }

  const updated = ensureBoardCard(entityType, entityId);
  res.json({ ...cardView(entityType, updated), auto_assigned: autoAssigned });
});

router.get('/analytics', (req, res) => {
  const entityType = req.query.entity_type || 'tmp';
  if (!BOARD_ENTITY_TYPES.includes(entityType)) return res.status(400).json({ error: 'Invalid entity_type (tmp or permit)' });
  const days = Math.min(365, Math.max(1, parseInt(req.query.days) || 30));
  ensureBoardColumns();
  backfillBoard(entityType);

  const columns = db.prepare('SELECT * FROM board_columns WHERE entity_type = ? ORDER BY sort_order').all(entityType);
  const finalIds = new Set(columns.filter(c => c.is_final).map(c => c.id));

  const cards = db.prepare('SELECT id, entity_id, column_id, created_at FROM board_cards WHERE entity_type = ?').all(entityType);
  const history = db.prepare(`
    SELECT h.* FROM board_card_history h INNER JOIN board_cards c ON h.card_id = c.id
    WHERE c.entity_type = ?
    ORDER BY h.card_id, h.entered_at
  `).all(entityType);

  const byCard = {};
  for (const h of history) {
    (byCard[h.card_id] ||= []).push(h);
  }

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  const cfd = [];
  for (let i = 0; i < days; i++) {
    const dayStart = new Date(start);
    dayStart.setDate(start.getDate() + i);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayStart.getDate() + 1);
    const row = { date: dayStart.toISOString().slice(0, 10), columns: {}, total: 0 };
    for (const c of columns) {
      let count = 0;
      for (const card of cards) {
        const list = byCard[card.id];
        if (!list) {
          if (card.column_id === c.id && parseDt(card.created_at) <= dayEnd) count++;
          continue;
        }
        for (const h of list) {
          const entered = parseDt(h.entered_at);
          const left = parseDt(h.left_at);
          if (h.column_id === c.id && entered <= dayEnd && (!left || left > dayStart)) { count++; break; }
        }
      }
      row.columns[c.id] = count;
      row.total += count;
    }
    cfd.push(row);
  }

  function avgAndMedian(arr) {
    if (!arr.length) return { avg_days: 0, median_days: 0, sample_count: 0 };
    const sorted = [...arr].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mid = Math.floor(sorted.length / 2);
    return {
      avg_days: Math.round((sum / sorted.length) * 10) / 10,
      median_days: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
      sample_count: sorted.length
    };
  }

  const leads = [];
  const cycles = [];
  for (const card of cards) {
    const list = byCard[card.id] || [];
    const first = list.length ? parseDt(list[0].entered_at) : parseDt(card.created_at);
    if (!first) continue;
    const finalEntry = list.find(h => finalIds.has(h.column_id));
    if (!finalEntry) continue;
    const enteredFinal = parseDt(finalEntry.entered_at);
    if (!enteredFinal) continue;
    const created = parseDt(card.created_at);
    if (created) leads.push((enteredFinal - created) / 86400000);
    cycles.push((enteredFinal - first) / 86400000);
  }

  const timeInColumn = columns.map(c => {
    const durations = [];
    for (const h of history) {
      if (h.column_id !== c.id) continue;
      const entered = parseDt(h.entered_at);
      const left = parseDt(h.left_at);
      if (!entered) continue;
      durations.push(((left || new Date()) - entered) / 86400000);
    }
    const agg = avgAndMedian(durations);
    return { column_id: c.id, column_name: c.name, avg_days: agg.avg_days, median_days: agg.median_days, sample_count: agg.sample_count };
  });

  res.json({ entity_type: entityType, columns: columns.map(c => ({ id: c.id, name: c.name, sort_order: c.sort_order, colour: c.colour })), cfd, lead_time: avgAndMedian(leads), cycle_time: avgAndMedian(cycles), time_in_column: timeInColumn });
});

router.get('/lanes', (req, res) => {
  const entityType = req.query.entity_type || 'tmp';
  if (!BOARD_ENTITY_TYPES.includes(entityType)) return res.status(400).json({ error: 'Invalid entity_type (tmp or permit)' });
  ensureBoardColumns();
  backfillBoard(entityType);
  const lanes = db.prepare('SELECT DISTINCT lane FROM board_cards WHERE entity_type = ? AND lane != \'\'').all(entityType).map(r => r.lane);
  res.json({ lanes: ['emergency', ...lanes.filter(l => l !== 'emergency')] });
});

export default router;
