import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { emitEvent } from '../events.js';

const router = Router();
router.use(authenticate);

const COMPLEXITIES = ['simple', 'standard', 'complex', 'complex_with_notice'];

export function entityContext(entityType, entityId) {
  if (entityType === 'tmp') {
    const t = db.prepare('SELECT complexity FROM traffic_management_plans WHERE id = ?').get(entityId);
    return t ? { complexity: t.complexity || 'standard', authority_id: null } : null;
  }
  if (entityType === 'permit') {
    const p = db.prepare('SELECT complexity, authority_id FROM permits WHERE id = ?').get(entityId);
    return p ? { complexity: p.complexity || 'standard', authority_id: p.authority_id || null } : null;
  }
  return null;
}

export function resolveTemplate(entityType, complexity, authorityId = null) {
  const q = 'SELECT * FROM workflow_templates WHERE entity_type = ?';
  if (authorityId && complexity) {
    const t = db.prepare(`${q} AND authority_id = ? AND complexity = ?`).get(entityType, authorityId, complexity);
    if (t) return t;
  }
  if (complexity) {
    const t = db.prepare(`${q} AND authority_id IS NULL AND complexity = ?`).get(entityType, complexity);
    if (t) return t;
  }
  return db.prepare(`${q} AND is_default = 1`).get(entityType) || null;
}

export function applicableStages(entityType, complexity, authorityId = null) {
  const template = resolveTemplate(entityType, complexity, authorityId);
  if (template) {
    return db.prepare('SELECT * FROM workflow_stages WHERE template_id = ? ORDER BY sort_order').all(template.id);
  }
  return db.prepare('SELECT * FROM workflow_stages WHERE entity_type = ? AND template_id IS NULL ORDER BY sort_order').all(entityType);
}

export function swapTemplateForEntity(entityType, entityId) {
  const ctx = entityContext(entityType, entityId);
  if (!ctx) return;
  const stages = applicableStages(entityType, ctx.complexity, ctx.authority_id);
  const ids = stages.map(s => s.id);
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`DELETE FROM workflow_checklist WHERE entity_type = ? AND entity_id = ? AND stage_id NOT IN (${placeholders})`)
    .run(entityType, entityId, ...ids);
}

export function incompleteRequiredStages(entityType, entityId) {
  const ctx = entityContext(entityType, entityId);
  if (!ctx) return [];
  const stages = applicableStages(entityType, ctx.complexity, ctx.authority_id);
  const required = stages.filter(s => !s.is_optional);
  if (!required.length) return [];
  const ids = required.map(s => s.id);
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(`
    SELECT s.name FROM workflow_stages s
    WHERE s.id IN (${placeholders})
      AND NOT EXISTS (
        SELECT 1 FROM workflow_checklist c
        WHERE c.stage_id = s.id AND c.entity_type = ? AND c.entity_id = ? AND c.is_done = 1
      )
    ORDER BY s.sort_order
  `).all(...ids, entityType, entityId).map(r => r.name);
}

export function ensureWorkflowSeeds() {
  const stageCount = db.prepare('SELECT COUNT(*) as c FROM workflow_stages').get().c;
  if (stageCount === 0) {
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

  const templateCount = db.prepare('SELECT COUNT(*) as c FROM workflow_templates').get().c;
  if (templateCount > 0) return;

  const insertTemplate = db.prepare('INSERT INTO workflow_templates (id, name, description, entity_type, complexity, authority_id, is_default) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insertStage = db.prepare('INSERT INTO workflow_stages (id, entity_type, name, description, is_optional, sort_order, template_id) VALUES (?, ?, ?, ?, ?, ?, ?)');

  const tmpTemplates = [
    { key: ['simple', null], name: 'Simple works', description: 'Minor short-duration works on local roads.', stages: [
      [0, 'TMP drawing prepared', 'Traffic plan drawing is finalised', 0],
      [0, 'Internal review', 'QA review of the plan and documents', 1]
    ]},
    { key: ['standard', null], name: 'Standard works', description: 'Typical road works requiring client sign-off.', stages: [
      [0, 'TMP drawing prepared', 'Traffic plan drawing is finalised', 0],
      [0, 'Internal review', 'QA review of the plan and documents', 0],
      [0, 'Client sign-off', 'Client approval of the plan before submission', 0]
    ]},
    { key: ['complex', null], name: 'Complex works', description: 'Multi-stage plans with referral requirements.', stages: [
      [0, 'TMP drawing prepared', 'Traffic plan drawing is finalised', 0],
      [0, 'Internal review', 'QA review of the plan and documents', 0],
      [0, 'Client sign-off', 'Client approval of the plan before submission', 0],
      [0, 'Site risk assessment', 'Consequence × likelihood risk assessment completed', 0],
      [0, 'MRWA referral', 'MRWA referral sent and acknowledged', 1]
    ]},
    { key: ['complex_with_notice', null], name: 'Complex works + public notice', description: 'Complex works requiring a public notice period.', stages: [
      [0, 'TMP drawing prepared', 'Traffic plan drawing is finalised', 0],
      [0, 'Internal review', 'QA review of the plan and documents', 0],
      [0, 'Client sign-off', 'Client approval of the plan before submission', 0],
      [0, 'Site risk assessment', 'Consequence × likelihood risk assessment completed', 0],
      [0, 'Public notice issued', 'Public notice period completed', 0],
      [0, 'MRWA referral', 'MRWA referral sent and acknowledged', 1]
    ]}
  ];

  const permitTemplates = [
    { key: ['simple', null], name: 'Simple submission', description: 'Straightforward application pack.', stages: [
      [0, 'Submission prepared', 'Application and supporting documents assembled', 0]
    ]},
    { key: ['standard', null], name: 'Standard submission', description: 'Standard application with optional notice.', stages: [
      [0, 'Submission prepared', 'Application and supporting documents assembled', 0],
      [0, 'Public notice issued', 'Public notice period completed where required', 1]
    ]},
    { key: ['complex', null], name: 'Complex submission', description: 'Application requiring MRWA referral.', stages: [
      [0, 'Submission prepared', 'Application and supporting documents assembled', 0],
      [0, 'MRWA referral', 'MRWA referral sent and acknowledged', 0],
      [0, 'Public notice issued', 'Public notice period completed where required', 1]
    ]},
    { key: ['complex_with_notice', null], name: 'Complex submission + notice', description: 'Application with mandatory public notice.', stages: [
      [0, 'Submission prepared', 'Application and supporting documents assembled', 0],
      [0, 'Public notice issued', 'Public notice period completed', 0],
      [0, 'MRWA referral', 'MRWA referral sent and acknowledged', 1]
    ]}
  ];

  const tx = db.transaction(() => {
    for (const [entityType, list] of [['tmp', tmpTemplates], ['permit', permitTemplates]]) {
      for (const t of list) {
        const id = uuid();
        const [complexity, authorityId] = t.key;
        insertTemplate.run(id, t.name, t.description, entityType, complexity, authorityId, 0);
        for (const [optional, name, description, order] of t.stages) {
          insertStage.run(uuid(), entityType, name, description, optional, order, id);
        }
      }
    }
    const cop = db.prepare("SELECT id FROM authorities WHERE short_name = 'COP'").get();
    if (cop) {
      const id = uuid();
      insertTemplate.run(id, 'COP standard + public notice', 'City of Perth requires public notice even for standard complexity.', 'permit', 'standard', cop.id, 0);
      insertStage.run(uuid(), 'permit', 'Submission prepared', 'Application and supporting documents assembled', 0, 1, id);
      insertStage.run(uuid(), 'permit', 'Public notice issued', 'Public notice period completed', 0, 2, id);
      insertStage.run(uuid(), 'permit', 'MRWA referral', 'MRWA referral sent and acknowledged', 1, 3, id);
    }
  });
  tx();
}

router.get('/templates', (req, res) => {
  const entityType = req.query.entity_type;
  const params = [];
  let q = `
    SELECT wt.*, au.name as authority_name, au.short_name as authority_short,
      (SELECT COUNT(*) FROM workflow_stages s WHERE s.template_id = wt.id) as stage_count
    FROM workflow_templates wt
    LEFT JOIN authorities au ON wt.authority_id = au.id`;
  if (entityType) { q += ' WHERE wt.entity_type = ?'; params.push(entityType); }
  q += ' ORDER BY wt.entity_type, wt.complexity NULLS LAST, wt.name';
  res.json(db.prepare(q).all(...params));
});

router.post('/templates', authorize('admin'), (req, res) => {
  const { name, description, entity_type, complexity, authority_id, is_default } = req.body || {};
  if (!entity_type || !['tmp', 'permit'].includes(entity_type)) return res.status(400).json({ error: 'Valid entity_type required (tmp or permit)' });
  if (!name || !name.trim()) return res.status(400).json({ error: 'Template name required' });
  if (is_default) {
    db.prepare('UPDATE workflow_templates SET is_default = 0 WHERE entity_type = ?').run(entity_type);
    const id = uuid();
    db.prepare('INSERT INTO workflow_templates (id, name, description, entity_type, complexity, authority_id, is_default) VALUES (?, ?, ?, ?, ?, NULL, 1)')
      .run(id, name.trim(), description || null, entity_type);
    return res.status(201).json(db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get(id));
  }
  const complexityVal = complexity || 'standard';
  if (!COMPLEXITIES.includes(complexityVal)) return res.status(400).json({ error: 'Valid complexity required (simple, standard, complex, complex_with_notice)' });
  const authId = authority_id || null;
  if (authId && !db.prepare('SELECT id FROM authorities WHERE id = ?').get(authId)) return res.status(404).json({ error: 'Authority not found' });
  if (!authId) db.prepare('DELETE FROM workflow_templates WHERE entity_type = ? AND complexity = ? AND authority_id IS NULL').run(entity_type, complexityVal);
  const id = uuid();
  db.prepare('INSERT INTO workflow_templates (id, name, description, entity_type, complexity, authority_id, is_default) VALUES (?, ?, ?, ?, ?, ?, 0)')
    .run(id, name.trim(), description || null, entity_type, complexityVal, authId);
  res.status(201).json(db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get(id));
});

router.put('/templates/:id', authorize('admin'), (req, res) => {
  const existing = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Template not found' });
  const { name, description, is_default } = req.body || {};
  if (is_default && !existing.is_default) {
    db.prepare('UPDATE workflow_templates SET is_default = 0 WHERE entity_type = ?').run(existing.entity_type);
  }
  db.prepare('UPDATE workflow_templates SET name = ?, description = ?, is_default = ? WHERE id = ?')
    .run(name?.trim() || existing.name, description !== undefined ? description : existing.description, is_default !== undefined ? (is_default ? 1 : 0) : existing.is_default, req.params.id);
  res.json(db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get(req.params.id));
});

router.delete('/templates/:id', authorize('admin'), (req, res) => {
  const result = db.prepare('DELETE FROM workflow_templates WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Template not found' });
  res.json({ success: true });
});

router.get('/stages', (req, res) => {
  const entityType = req.query.entity_type;
  const templateId = req.query.template_id;
  const params = [];
  let q = 'SELECT * FROM workflow_stages';
  const conds = [];
  if (templateId) { conds.push('template_id = ?'); params.push(templateId); }
  else if (entityType) { conds.push('entity_type = ? AND template_id IS NULL'); params.push(entityType); }
  if (conds.length) q += ' WHERE ' + conds.join(' AND ');
  q += ' ORDER BY sort_order';
  res.json(db.prepare(q).all(...params));
});

router.post('/stages', authorize('admin'), (req, res) => {
  const { entity_type, name, description, is_optional, template_id } = req.body || {};
  const template = template_id ? db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get(template_id) : null;
  const type = template ? template.entity_type : entity_type;
  if (!type || !['tmp', 'permit'].includes(type)) return res.status(400).json({ error: 'Valid entity_type required (tmp or permit)' });
  if (!name || !name.trim()) return res.status(400).json({ error: 'Stage name required' });
  const maxOrder = template_id
    ? (db.prepare('SELECT MAX(sort_order) as m FROM workflow_stages WHERE template_id = ?').get(template_id).m || 0)
    : (db.prepare('SELECT MAX(sort_order) as m FROM workflow_stages WHERE entity_type = ? AND template_id IS NULL').get(type).m || 0);
  const id = uuid();
  db.prepare('INSERT INTO workflow_stages (id, entity_type, name, description, is_optional, sort_order, template_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, type, name.trim(), description || null, is_optional ? 1 : 0, maxOrder + 1, template_id || null);
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
  const ctx = entityContext(entityType, entityId);
  const stages = ctx ? applicableStages(entityType, ctx.complexity, ctx.authority_id) : [];
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
  const stage = db.prepare('SELECT * FROM workflow_stages WHERE id = ?').get(stageId);
  if (!stage || stage.entity_type !== entityType) return res.status(404).json({ error: 'Stage not found' });
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO workflow_checklist (id, stage_id, entity_type, entity_id, is_done, done_at, done_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(stage_id, entity_type, entity_id)
    DO UPDATE SET is_done = excluded.is_done, done_at = excluded.done_at, done_by = excluded.done_by
  `).run(uuid(), stageId, entityType, entityId, done ? 1 : 0, done ? now : null, done ? req.user.id : null);
  if (done) {
    emitEvent('stage.completed', { stage_id: stageId, stage_name: stage.name, entity_type: entityType, entity_id: entityId, done_by: req.user.id });
  }
  res.json({ success: true });
});

export default router;
