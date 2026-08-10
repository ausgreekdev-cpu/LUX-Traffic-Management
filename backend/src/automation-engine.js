import { v4 as uuid } from 'uuid';
import db from './db.js';
import { onAny } from './events.js';
import { notifyUsers, notifyRole } from './notify.js';
import { sendEmail } from './emailer.js';

const SAFE_FIELDS = {
  tmp: ['status', 'description', 'start_date', 'end_date', 'plan_type', 'complexity', 'complexity_source', 'risk_score', 'risk_band', 'title'],
  permit: ['status', 'complexity', 'expiry_date', 'approval_date', 'rejection_reason', 'is_within_30m_signals', 'requires_mrwa']
};

function parseJson(json, fallback) {
  try { return json ? JSON.parse(json) : fallback; } catch { return fallback; }
}

export function buildContext(event) {
  const ctx = { event_type: event.type, ...event.entity, ...event.payload };
  if (event.entity?.tmp_id) {
    const t = db.prepare('SELECT reference, title, created_by FROM traffic_management_plans WHERE id = ?').get(event.entity.tmp_id);
    if (t) {
      if (ctx.tmp_reference === undefined) ctx.tmp_reference = t.reference;
      if (ctx.tmp_title === undefined) ctx.tmp_title = t.title;
      if (ctx.created_by === undefined) ctx.created_by = t.created_by;
    }
  }
  if (event.entity?.authority_id && ctx.authority_short === undefined) {
    const a = db.prepare('SELECT short_name, name FROM authorities WHERE id = ?').get(event.entity.authority_id);
    if (a) {
      ctx.authority_short = a.short_name;
      ctx.authority_name = a.name;
    }
  }
  return ctx;
}

export function template(str, ctx) {
  if (str === undefined || str === null) return '';
  return String(str).replace(/\{([\w.]+)\}/g, (m, key) => (ctx[key] !== undefined && ctx[key] !== null ? ctx[key] : m));
}

function normalizeCompare(v) {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === 'true' || v === 'TRUE') return 1;
  if (v === 'false' || v === 'FALSE') return 0;
  return v;
}

export function evaluateCondition(cond, ctx) {
  const value = normalizeCompare(ctx[cond.field]);
  const expected = normalizeCompare(cond.value);
  switch (cond.op) {
    case 'eq': return String(value) === String(expected);
    case 'ne': return String(value) !== String(expected);
    case 'gt': return Number(value) > Number(cond.value);
    case 'gte': return Number(value) >= Number(cond.value);
    case 'lt': return Number(value) < Number(cond.value);
    case 'lte': return Number(value) <= Number(cond.value);
    case 'contains': return String(value || '').toLowerCase().includes(String(cond.value).toLowerCase());
    case 'in': {
      const list = Array.isArray(cond.value) ? cond.value : String(cond.value).split(',').map(s => s.trim());
      return list.includes(String(value));
    }
    case 'exists': return cond.value ? value !== undefined && value !== null && value !== '' : value === undefined || value === null || value === '';
    default: return true;
  }
}

function entityTypeOf(event) {
  if (event.type.startsWith('permit')) return 'permit';
  if (event.type.startsWith('tmp')) return 'tmp';
  if (event.type.startsWith('fee')) return 'permit';
  if (event.type.startsWith('document')) return 'tmp';
  if (event.type.startsWith('email')) return 'tmp';
  if (event.type.startsWith('stage')) return event.entity?.entity_type || 'tmp';
  if (event.type.startsWith('sla')) return 'permit';
  return 'tmp';
}

function inCooldown(rule) {
  if (!rule.cooldown_hours) return false;
  const last = db.prepare("SELECT created_at FROM automation_runs WHERE rule_id = ? AND status = 'fired' ORDER BY created_at DESC LIMIT 1").get(rule.id);
  if (!last) return false;
  const diffMs = Date.now() - new Date(last.created_at.replace(' ', 'T') + 'Z').getTime();
  return diffMs < rule.cooldown_hours * 3600000;
}

function logRun(rule, event, status, actionsResult, error) {
  db.prepare(`
    INSERT INTO automation_runs (id, rule_id, event_type, entity_type, entity_id, payload_json, status, actions_json, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuid(), rule.id, event.type, entityTypeOf(event), event.entity?.id || null, JSON.stringify(event.payload || {}), status, JSON.stringify(actionsResult || []), error || null);
}

async function executeAction(action, event, ctx, rule) {
  const { type, params = {} } = action;
  const entityId = event.entity?.id || null;
  switch (type) {
    case 'notify_user': {
      const title = template(params.title, ctx);
      const message = template(params.message, ctx);
      const dedupe = rule.dedupe_key_template ? template(rule.dedupe_key_template, ctx) : `${rule.id}:${event.type}:${entityId || 'x'}`;
      const created = ctx.created_by
        ? notifyUsers(ctx.created_by, { type: params.notification_type || 'automation', title, message, entity_type: entityTypeOf(event), entity_id: entityId, dedupe_key: dedupe })
        : notifyRole('admin', { type: params.notification_type || 'automation', title, message, entity_type: entityTypeOf(event), entity_id: entityId, dedupe_key: dedupe });
      return { type, created };
    }
    case 'notify_role': {
      const title = template(params.title, ctx);
      const message = template(params.message, ctx);
      const dedupe = rule.dedupe_key_template ? template(rule.dedupe_key_template, ctx) : `${rule.id}:${event.type}:${entityId || 'x'}`;
      const role = params.role && ['admin', 'planner', 'viewer'].includes(params.role) ? params.role : 'admin';
      const created = notifyRole(role, { type: params.notification_type || 'automation', title, message, entity_type: entityTypeOf(event), entity_id: entityId, dedupe_key: dedupe });
      return { type, created };
    }
    case 'create_task': {
      const title = template(params.title, ctx);
      let message = template(params.message, ctx);
      if (params.due_in_days) {
        const due = new Date(Date.now() + parseInt(params.due_in_days) * 86400000).toISOString().slice(0, 10);
        message = message + (message ? ' ' : '') + `Due ${due}.`;
      }
      const dedupe = `${rule.id}:task:${entityId || 'x'}`;
      const role = params.role && ['admin', 'planner', 'viewer'].includes(params.role) ? params.role : 'admin';
      const created = notifyRole(role, { type: 'task', title, message, entity_type: entityTypeOf(event), entity_id: entityId, dedupe_key: dedupe });
      return { type, created };
    }
    case 'notify_email': {
      const to = template(params.to, ctx);
      let subject = params.subject !== undefined ? template(params.subject, ctx) : null;
      let body = params.body !== undefined ? template(params.body, ctx) : null;
      if (params.template) {
        const { renderTemplate } = await import('./emailer.js');
        const tpl = renderTemplate(params.template, ctx);
        if (!tpl) return { type, skipped: `template "${params.template}" not found` };
        if (subject === null) subject = tpl.subject;
        if (body === null) body = tpl.body;
      }
      if (!to) return { type, skipped: 'no recipient' };
      try {
        const info = await sendEmail(to, subject, body, event.entity?.tmp_id || entityId || null);
        return { type, messageId: info.messageId };
      } catch (err) {
        return { type, error: err.message };
      }
    }
    case 'set_field': {
      const table = params.entity_type && SAFE_FIELDS[params.entity_type] ? params.entity_type
        : event.type.startsWith('permit') ? 'permit' : event.type.startsWith('tmp') ? 'tmp' : null;
      if (!table || !entityId) return { type, skipped: 'no entity' };
      if (!SAFE_FIELDS[table].includes(params.field)) return { type, skipped: 'unsafe field' };
      db.prepare(`UPDATE ${table} SET ${params.field} = ?, updated_at = datetime('now') WHERE id = ?`).run(String(params.value), entityId);
      return { type, updated: params.field, value: String(params.value) };
    }
    case 'raise_trigger': {
      if (!entityId) return { type, skipped: 'no entity' };
      const existing = db.prepare('SELECT id FROM workflow_triggers WHERE permit_id = ? AND trigger_type = ? AND is_resolved = 0').get(entityId, params.trigger_type);
      if (existing) return { type, skipped: 'trigger already open' };
      db.prepare('INSERT INTO workflow_triggers (id, permit_id, trigger_type, description) VALUES (?, ?, ?, ?)').run(uuid(), entityId, params.trigger_type, template(params.description, ctx));
      return { type, created: true };
    }
    case 'compute_risk_score': {
      const table = event.type.startsWith('permit') ? 'permit' : event.type.startsWith('tmp') ? 'tmp' : null;
      if (!table || !entityId) return { type, skipped: 'no entity' };
      const { applyRiskToTmp } = await import('./risk.js');
      if (table === 'tmp') {
        const t = db.prepare('SELECT * FROM traffic_management_plans WHERE id = ?').get(entityId);
        if (!t) return { type, skipped: 'entity not found' };
        const risk = applyRiskToTmp(entityId, { plan_type: t.plan_type, start_date: t.start_date, end_date: t.end_date, site_id: t.site_id });
        return { type, score: risk.score, band: risk.band };
      }
      const p = db.prepare('SELECT * FROM permits WHERE id = ?').get(entityId);
      if (!p) return { type, skipped: 'entity not found' };
      const t = db.prepare('SELECT * FROM traffic_management_plans WHERE id = ?').get(p.tmp_id);
      if (!t) return { type, skipped: 'tmp not found' };
      const risk = applyRiskToTmp(t.id, { plan_type: t.plan_type, start_date: t.start_date, end_date: t.end_date, site_id: t.site_id });
      return { type, score: risk.score, band: risk.band };
    }
    case 'run_agent': {
      const agentId = params.agent;
      if (!agentId) return { type, skipped: 'no agent' };
      const { AGENTS, runAgent } = await import('./agents.js');
      if (!AGENTS.find(a => a.id === agentId)) return { type, skipped: 'unknown agent' };
      let run;
      try {
        run = await runAgent(agentId, event, { by: event.payload?.by || null });
      } catch (err) {
        return { type, error: err.message };
      }
      const extra = [];
      if (run.verdict !== 'ok') {
        const entityType = entityTypeOf(event);
        if (entityType === 'permit' && entityId) {
          const existing = db.prepare('SELECT id FROM workflow_triggers WHERE permit_id = ? AND trigger_type = ? AND is_resolved = 0').get(entityId, 'agent_blocker');
          if (!existing) {
            db.prepare('INSERT INTO workflow_triggers (id, permit_id, trigger_type, description) VALUES (?, ?, ?, ?)').run(uuid(), entityId, 'agent_blocker', `Agent ${agentId}: ${run.summary}`);
            extra.push('trigger_raised');
          }
        }
        const created = notifyRole('admin', { type: 'agent_alert', title: `Agent ${agentId} flagged ${run.verdict}`, message: run.summary, entity_type: run.entity_type, entity_id: run.entity_id || null, dedupe_key: `agent-${run.id}` });
        extra.push(`notified ${created}`);
      }
      return { type, verdict: run.verdict, score: run.score, run_id: run.id, extra };
    }
    case 'webhook': {
      const url = params.url;
      if (!url) return { type, skipped: 'no url' };
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: event.type, entity: event.entity, payload: event.payload }),
          signal: AbortSignal.timeout(5000)
        });
        return { type, status: res.status };
      } catch (err) {
        return { type, error: err.message };
      }
    }
    default:
      return { type, skipped: 'unknown action type' };
  }
}

export async function evaluateAndExecute(rule, event, { dryRun = false } = {}) {
  const conditions = parseJson(rule.conditions_json, []);
  const actions = parseJson(rule.actions_json, []);
  const ctx = buildContext(event);
  const conditionResults = conditions.map(c => ({ field: c.field, op: c.op, value: c.value, passed: evaluateCondition(c, ctx) }));
  const matched = conditionResults.every(c => c.passed);

  if (dryRun) {
    return { rule_id: rule.id, name: rule.name, matched, conditions: conditionResults, planned_actions: matched ? actions : [] };
  }

  if (!matched) {
    logRun(rule, event, 'skipped', [], null);
    return { rule_id: rule.id, matched: false };
  }
  if (inCooldown(rule)) {
    logRun(rule, event, 'skipped', [], 'cooldown');
    return { rule_id: rule.id, matched: true, skipped: 'cooldown' };
  }

  const results = [];
  for (const action of actions) {
    try {
      results.push(await executeAction(action, event, ctx, rule));
    } catch (err) {
      results.push({ type: action.type, error: err.message });
    }
  }
  const hadError = results.some(r => r.error);
  logRun(rule, event, hadError ? 'error' : 'fired', results, hadError ? results.filter(r => r.error).map(r => r.error).join('; ') : null);
  return { rule_id: rule.id, matched: true, actions: results };
}

export async function processEvent(event) {
  const rules = db.prepare('SELECT * FROM automation_rules WHERE event_type = ? AND is_active = 1 ORDER BY priority DESC').all(event.type);
  const results = [];
  for (const rule of rules) {
    results.push(await evaluateAndExecute(rule, event));
  }
  return results;
}

onAny((event) => { processEvent(event).catch(err => console.error('[automation] error processing event', event.type, err.message)); });
