import { Router } from 'express';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { AGENTS, runAgent, applyAgentRun } from '../agents.js';

const router = Router();
router.use(authenticate);

function resolveEntity(agent, entityType, entityId) {
  const table = entityType === 'document' ? 'documents' : entityType === 'permit' ? 'permits' : entityType === 'tmp' ? 'traffic_management_plans' : null;
  if (!table) return null;
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(entityId) || null;
}

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT agent_id, COUNT(*) as runs, SUM(CASE WHEN verdict = 'ok' THEN 1 ELSE 0 END) as ok, SUM(CASE WHEN verdict = 'warn' THEN 1 ELSE 0 END) as warn, SUM(CASE WHEN verdict = 'fail' THEN 1 ELSE 0 END) as fail
    FROM agent_runs GROUP BY agent_id
  `).all();
  const counts = Object.fromEntries(rows.map(r => [r.agent_id, r]));
  res.json({ data: AGENTS.map(a => ({ ...a, runs: counts[a.id]?.runs || 0, ok: counts[a.id]?.ok || 0, warn: counts[a.id]?.warn || 0, fail: counts[a.id]?.fail || 0 })) });
});

router.get('/runs', (req, res) => {
  let q = 'SELECT * FROM agent_runs';
  const where = [];
  const params = [];
  if (req.query.entity_type === 'tmp' && req.query.entity_id) {
    const docIds = db.prepare('SELECT id FROM documents WHERE tmp_id = ?').all(req.query.entity_id).map(d => d.id);
    if (docIds.length) {
      where.push("(entity_type = 'tmp' AND entity_id = ?) OR (entity_type = 'document' AND entity_id IN (" + docIds.map(() => '?').join(',') + '))');
      params.push(req.query.entity_id, ...docIds);
    } else {
      where.push('entity_type = ? AND entity_id = ?');
      params.push('tmp', req.query.entity_id);
    }
  } else if (req.query.entity_type) { where.push('entity_type = ?'); params.push(req.query.entity_type); if (req.query.entity_id) { where.push('entity_id = ?'); params.push(req.query.entity_id); } }
  if (req.query.agent_id) { where.push('agent_id = ?'); params.push(req.query.agent_id); }
  if (where.length) q += ' WHERE ' + where.join(' AND ');
  q += ' ORDER BY created_at DESC LIMIT ?';
  params.push(Math.min(200, Math.max(1, parseInt(req.query.limit) || 50)));
  res.json({ data: db.prepare(q).all(...params) });
});

router.post('/:agentId/run', async (req, res) => {
  const agent = AGENTS.find(a => a.id === req.params.agentId);
  if (!agent) return res.status(404).json({ error: 'Unknown agent' });
  const { entity_type, entity_id } = req.body || {};
  if (!entity_id) return res.status(400).json({ error: 'entity_id is required' });
  const entity = resolveEntity(agent, entity_type || agent.entity_type, entity_id);
  if (!entity) return res.status(404).json({ error: 'Entity not found' });
  try {
    const run = await runAgent(agent.id, { type: agent.event_type, entity }, { by: req.user.id });
    res.status(201).json(run);
  } catch (err) {
    res.status(500).json({ error: 'Agent run failed: ' + err.message });
  }
});

router.post('/runs/:id/apply', (req, res) => {
  const run = applyAgentRun(req.params.id, { by: req.user.id });
  if (!run) return res.status(404).json({ error: 'Agent run not found' });
  res.json(run);
});

export default router;
