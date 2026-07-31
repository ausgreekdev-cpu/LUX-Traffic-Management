import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

export function ensureWorkflowSeeds() {
  const count = db.prepare('SELECT COUNT(*) as c FROM workflow_stages').get().c;
  if (count > 0) return;
  const insert = db.prepare('INSERT INTO workflow_stages (id, entity_type, name, description, is_optional, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
  const defaults = [
    ['tmp', 'TMP drawing prepared', 'Traffic plan drawing is finalised', 0, 1],
    ['tmp', 'Internal review', 'QA review of the plan and documents', 0, 2],
    ['tmp', 'Client sign-off', 'Client approval of the plan before submission', 1, 3],
    ['permit', 'Submission prepared', 'Application and supporting documents assembled', 0, 1],
    ['permit', 'Public notice issued', 'Public notice period completed where required', 1, 2],
    ['permit', 'MRWA referral', 'MRWA referral sent and acknowledged', 1, 3]
  ];
  const tx = db.transaction((rows) => {
    for (const [type, name, description, optional, order] of rows) {
      insert.run(uuid(), type, name, description, optional, order);
    }
  });
  tx(defaults);
}

export function incompleteRequiredStages(entityType, entityId) {
  return db.prepare(`
    SELECT s.name FROM workflow_stages s
    WHERE s.entity_type = ?
      AND s.is_optional = 0
      AND NOT EXISTS (
        SELECT 1 FROM workflow_checklist c
        WHERE c.stage_id = s.id AND c.entity_type = ? AND c.entity_id = ? AND c.is_done = 1
      )
    ORDER BY s.sort_order
  `).all(entityType, entityType, entityId).map(r => r.name);
}

router.get('/stages', (req, res) => {
  const entityType = req.query.entity_type;
  const params = [];
  let q = 'SELECT * FROM workflow_stages';
  if (entityType) { q += ' WHERE entity_type = ?'; params.push(entityType); }
  q += ' ORDER BY sort_order';
  res.json(db.prepare(q).all(...params));
});

router.post('/stages', authorize('admin'), (req, res) => {
  const { entity_type, name, description, is_optional } = req.body || {};
  if (!entity_type || !['tmp', 'permit'].includes(entity_type)) return res.status(400).json({ error: 'Valid entity_type required (tmp or permit)' });
  if (!name || !name.trim()) return res.status(400).json({ error: 'Stage name required' });
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM workflow_stages WHERE entity_type = ?').get(entity_type).m || 0;
  const id = uuid();
  db.prepare('INSERT INTO workflow_stages (id, entity_type, name, description, is_optional, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, entity_type, name.trim(), description || null, is_optional ? 1 : 0, maxOrder + 1);
  res.status(201).json(db.prepare('SELECT * FROM workflow_stages WHERE id = ?').get(id));
});

router.put('/stages/:id', authorize('admin'), (req, res) => {
  const existing = db.prepare('SELECT * FROM workflow_stages WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Stage not found' });
  const { name, description, is_optional, sort_order } = req.body || {};
  db.prepare('UPDATE workflow_stages SET name = ?, description = ?, is_optional = ?, sort_order = ? WHERE id = ?')
    .run(name?.trim() || existing.name, description !== undefined ? description : existing.description, is_optional !== undefined ? (is_optional ? 1 : 0) : existing.is_optional, sort_order !== undefined ? sort_order : existing.sort_order, req.params.id);
  res.json(db.prepare('SELECT * FROM workflow_stages WHERE id = ?').get(req.params.id));
});

router.delete('/stages/:id', authorize('admin'), (req, res) => {
  const result = db.prepare('DELETE FROM workflow_stages WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Stage not found' });
  res.json({ success: true });
});

router.get('/checklist/:entityType/:entityId', (req, res) => {
  const { entityType, entityId } = req.params;
  if (!['tmp', 'permit'].includes(entityType)) return res.status(400).json({ error: 'Invalid entity type' });
  const stages = db.prepare('SELECT * FROM workflow_stages WHERE entity_type = ? ORDER BY sort_order').all(entityType);
  const checklist = db.prepare('SELECT stage_id, is_done, done_by, done_at FROM workflow_checklist WHERE entity_type = ? AND entity_id = ?').all(entityType, entityId);
  const byStage = Object.fromEntries(checklist.map(c => [c.stage_id, c]));
  const data = stages.map(s => ({
    ...s,
    is_done: byStage[s.id]?.is_done ? 1 : 0,
    done_by: byStage[s.id]?.done_by || null,
    done_at: byStage[s.id]?.done_at || null
  }));
  res.json({ data, required_complete: data.filter(s => !s.is_optional).every(s => s.is_done) });
});

router.post('/checklist/:entityType/:entityId', (req, res) => {
  const { entityType, entityId } = req.params;
  if (!['tmp', 'permit'].includes(entityType)) return res.status(400).json({ error: 'Invalid entity type' });
  const { stageId, done } = req.body || {};
  const stage = db.prepare('SELECT * FROM workflow_stages WHERE id = ? AND entity_type = ?').get(stageId, entityType);
  if (!stage) return res.status(404).json({ error: 'Stage not found' });
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO workflow_checklist (id, stage_id, entity_type, entity_id, is_done, done_at, done_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(stage_id, entity_type, entity_id)
    DO UPDATE SET is_done = excluded.is_done, done_at = excluded.done_at, done_by = excluded.done_by
  `).run(uuid(), stageId, entityType, entityId, done ? 1 : 0, done ? now : null, done ? req.user.id : null);
  res.json({ success: true });
});

export default router;
