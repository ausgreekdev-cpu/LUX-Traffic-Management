import { v4 as uuid } from 'uuid';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from './db.js';
import { emitEvent } from './events.js';
import { suggestComplexity, computeRisk } from './risk.js';
import { incompleteRequiredStages, swapTemplateForEntity } from './routes/workflows.js';

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = process.env.UPLOADS_DIR || path.resolve(__dirname, '..', 'uploads');

export const AGENTS = [
  {
    id: 'triage',
    name: 'Complexity & Risk Triage Agent',
    description: 'Validates complexity class and risk band from site data, plan type and duration. Recommends a corrected complexity when the current one is misclassified.',
    entity_type: 'tmp',
    event_type: 'tmp.created'
  },
  {
    id: 'drawing_validation',
    name: 'Drawing Validation Agent',
    description: 'Checks uploaded drawings for the TMP reference, title-block fields, AS 1742.3 compliance markers and sign-off details.',
    entity_type: 'document',
    event_type: 'document.uploaded'
  },
  {
    id: 'compliance_checker',
    name: 'Permit Compliance Checker',
    description: 'Audits a submitted permit against workflow stages, documents, referral rules, SLA rules, risk mitigations and fees.',
    entity_type: 'permit',
    event_type: 'permit.submitted'
  }
];

function recordRun(agentId, entityType, entityId, result, by = null) {
  const id = uuid();
  db.prepare(`
    INSERT INTO agent_runs (id, agent_id, entity_type, entity_id, verdict, score, summary, findings_json, recommended_json, applied_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, agentId, entityType, entityId || null, result.verdict, result.score, result.summary, JSON.stringify(result.findings || []), JSON.stringify(result.recommendations || []), by || null);
  return { id, agent_id: agentId, entity_type: entityType, entity_id: entityId, ...result };
}

function grade(findings) {
  const fails = findings.filter(f => f.severity === 'fail').length;
  const warns = findings.filter(f => f.severity === 'warn').length;
  const score = Math.max(0, Math.min(100, 100 - fails * 25 - warns * 10));
  const verdict = fails > 0 ? 'fail' : warns > 0 ? 'warn' : 'ok';
  return { score, verdict };
}

function getTmpContext(tmpId) {
  const tmp = db.prepare('SELECT * FROM traffic_management_plans WHERE id = ?').get(tmpId);
  if (!tmp) return null;
  const site = tmp.site_id ? db.prepare('SELECT * FROM sites WHERE id = ?').get(tmp.site_id) : null;
  return { tmp, site };
}

const triage = (entity) => {
  const ctx = getTmpContext(entity.id);
  if (!ctx) return { findings: [{ severity: 'fail', label: 'TMP not found', detail: `No TMP with id ${entity.id}` }], recommendations: [], summary: 'TMP not found' };
  const { tmp, site } = ctx;
  const suggested = suggestComplexity({ plan_type: tmp.plan_type || 'temporary', start_date: tmp.start_date, end_date: tmp.end_date, site });
  const risk = computeRisk({ plan_type: tmp.plan_type || 'temporary', start_date: tmp.start_date, end_date: tmp.end_date, site });
  const findings = [
    { severity: 'info', label: 'Current complexity', detail: `${tmp.complexity || 'standard'} (source: ${tmp.complexity_source || 'manual'})` },
    { severity: 'info', label: 'Triage suggestion', detail: `${suggested} from plan type ${tmp.plan_type || 'temporary'}, ${tmp.start_date && tmp.end_date ? `${Math.round((new Date(tmp.end_date) - new Date(tmp.start_date)) / 86400000)} days` : 'open dates'}${site ? `, site ${site.name}` : ''}` },
    { severity: 'info', label: 'Risk assessment', detail: `C ${risk.consequence} × L ${risk.likelihood} = ${risk.score} (${risk.band})${risk.mitigations.length ? ' - mitigations: ' + risk.mitigations.join('; ') : ''}` }
  ];
  if (suggested !== tmp.complexity) {
    findings.push({ severity: 'warn', label: 'Complexity mismatch', detail: `Record is ${tmp.complexity || 'standard'} but triage suggests ${suggested}. Apply the recommendation to swap the workflow stage set.` });
  } else {
    findings.push({ severity: 'ok', label: 'Complexity matches triage', detail: `${suggested} is correct for this site and schedule.` });
  }
  const g = grade(findings.filter(f => f.severity !== 'info'));
  return {
    ...g,
    findings,
    recommendations: suggested !== tmp.complexity ? [{ action: 'set_complexity', complexity: suggested, complexity_source: 'auto' }] : [],
    summary: suggested === tmp.complexity
      ? `Complexity ${suggested} and risk band ${risk.band} are consistent with triage rules.`
      : `Triage suggests ${suggested} (current: ${tmp.complexity || 'standard'}). Risk band: ${risk.band} (${risk.score}/25).`
  };
};

const drawingValidation = async (entity) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(entity.id);
  if (!doc) return { findings: [{ severity: 'fail', label: 'Document not found', detail: `No document with id ${entity.id}` }], recommendations: [], summary: 'Document not found' };
  const tmp = db.prepare('SELECT * FROM traffic_management_plans WHERE id = ?').get(doc.tmp_id);
  const findings = [];
  const ext = path.extname(doc.original_name || '').toLowerCase();
  const isPdf = ext === '.pdf';
  const isCad = ['.dwg', '.dxf'].includes(ext);
  if (isPdf || isCad) {
    findings.push({ severity: 'ok', label: 'Drawing format', detail: `${ext.toUpperCase()} is an accepted drawing format.` });
  } else if (['.png', '.jpg', '.jpeg'].includes(ext)) {
    findings.push({ severity: 'warn', label: 'Image only', detail: 'Raster image cannot be text-checked. Confirm a scaled drawing accompanies it.' });
  } else {
    findings.push({ severity: 'warn', label: 'Unusual format', detail: `${ext.toUpperCase()} is not a standard drawing format (PDF/DWG/DXF).` });
  }
  if (!doc.size || doc.size < 10240) {
    findings.push({ severity: 'warn', label: 'Suspiciously small file', detail: `${doc.size || 0} bytes - likely not a complete drawing.` });
  }
  if (tmp && !String(doc.original_name).toLowerCase().includes('drawing') && !String(doc.original_name).toLowerCase().includes(tmp.reference?.toLowerCase() || 'tmp')) {
    findings.push({ severity: 'warn', label: 'Naming convention', detail: `File name "${doc.original_name}" does not reference the TMP (${tmp.reference}) or the word "drawing".` });
  }
  if (isPdf) {
    try {
      const filePath = path.join(uploadDir, doc.filename);
      if (fs.existsSync(filePath)) {
        const buffer = fs.readFileSync(filePath);
        const parsed = await new PDFParse({ data: buffer }).getText();
        const text = parsed.text || '';
        const refPattern = /TMP-\d{4}-\d{3}/i;
        const hasRef = refPattern.test(text);
        const hasSignage = /\bAS\s?1742\.?3\b|sign\b|bollard|barricad/i.test(text);
        const hasDate = /\b(0?[1-9]|[12]\d|3[01])\s?[A-Za-z]{3}\s?\d{4}|20\d{2}/.test(text);
        const hasTitle = /title|drawing\s?no|revision|rev/i.test(text);
        if (tmp && !hasRef) findings.push({ severity: 'warn', label: 'Reference missing in PDF', detail: `PDF text does not contain the TMP reference (${tmp.reference}).` });
        if (!hasSignage) findings.push({ severity: 'fail', label: 'No traffic control references', detail: 'PDF text contains no AS 1742.3 / sign / barricade markers - may not be a traffic management drawing.' });
        if (!hasDate) findings.push({ severity: 'warn', label: 'No date detected', detail: 'Could not detect a date in the PDF text.' });
        if (!hasTitle) findings.push({ severity: 'warn', label: 'Title block markers missing', detail: 'No drawing number / revision / title markers found in the PDF text.' });
        if (hasSignage && hasDate && (!tmp || hasRef)) findings.push({ severity: 'ok', label: 'Key markers found', detail: 'Reference, date and traffic control markers present.' });
      } else {
        findings.push({ severity: 'warn', label: 'File missing on disk', detail: 'Upload record exists but the file cannot be read.' });
      }
    } catch (err) {
      findings.push({ severity: 'warn', label: 'PDF text extraction failed', detail: err.message });
    }
  } else if (isCad) {
    findings.push({ severity: 'warn', label: 'CAD file not text-scanned', detail: 'DWG/DXF is binary. Manual review of layers and sheet numbers is required.' });
  }
  const g = grade(findings.filter(f => f.severity !== 'info'));
  const fails = findings.filter(f => f.severity === 'fail').length;
  return {
    ...g,
    findings,
    recommendations: [],
    summary: fails
      ? `Drawing validation failed ${fails} check(s) - correct and re-upload before internal review.`
      : `Drawing validation ${g.verdict === 'ok' ? 'passed' : 'flagged minor issues'} (score ${g.score}/100).`
  };
};

const complianceChecker = (entity) => {
  const permit = db.prepare('SELECT * FROM permits WHERE id = ?').get(entity.id);
  if (!permit) return { findings: [{ severity: 'fail', label: 'Permit not found', detail: `No permit with id ${entity.id}` }], recommendations: [], summary: 'Permit not found' };
  const tmp = db.prepare('SELECT * FROM traffic_management_plans WHERE id = ?').get(permit.tmp_id);
  const findings = [];
  const missingStages = incompleteRequiredStages('permit', permit.id);
  if (missingStages.length) {
    findings.push({ severity: 'fail', label: 'Incomplete required stages', detail: missingStages.join(', ') });
  } else {
    findings.push({ severity: 'ok', label: 'Required workflow stages complete', detail: 'All required permit stages are done.' });
  }
  const docs = tmp ? db.prepare('SELECT COUNT(*) as c FROM documents WHERE tmp_id = ?').get(tmp.id).c : 0;
  if (tmp && docs === 0) {
    findings.push({ severity: 'fail', label: 'No documents', detail: 'The parent TMP has no uploaded documents (drawing pack missing).' });
  } else if (tmp) {
    findings.push({ severity: 'ok', label: 'Documents present', detail: `${docs} document(s) attached to ${tmp.reference}.` });
  }
  if (permit.is_within_30m_signals && !permit.requires_mrwa) {
    findings.push({ severity: 'fail', label: 'MRWA referral missing', detail: 'Site is within 30m of signalised intersections but the permit is not marked as requiring MRWA.' });
  } else {
    findings.push({ severity: 'ok', label: 'Referral state consistent', detail: permit.is_within_30m_signals ? 'MRWA referral flagged on the permit.' : 'No signalised-intersection proximity flagged.' });
  }
  const sla = db.prepare('SELECT * FROM sla_rules WHERE authority_id = ? AND complexity = ?').get(permit.authority_id, permit.complexity || 'standard');
  if (!sla) {
    findings.push({ severity: 'fail', label: 'No SLA rule', detail: `No SLA rule for authority ${permit.authority_id} at complexity ${permit.complexity || 'standard'}. Expected decision date cannot be computed.` });
  } else {
    findings.push({ severity: 'ok', label: 'SLA rule present', detail: `${sla.assessment_days} assessment day(s)${sla.public_notice_days ? `, ${sla.public_notice_days} public-notice day(s)` : ''}.` });
  }
  if (tmp && ['extreme', 'high'].includes(tmp.risk_band)) {
    let mitigations = [];
    try { mitigations = tmp.risk_mitigations ? JSON.parse(tmp.risk_mitigations) : []; } catch {}
    if (mitigations.length) {
      findings.push({ severity: 'ok', label: 'Risk mitigations recorded', detail: `${tmp.risk_band} band mitigations: ${mitigations.join('; ')}` });
    } else {
      findings.push({ severity: 'fail', label: 'Risk mitigations missing', detail: `${tmp.risk_band} risk band requires mitigations but none are recorded.` });
    }
  }
  const feeCount = db.prepare('SELECT COUNT(*) as c FROM permit_fees WHERE permit_id = ?').get(permit.id).c;
  if (feeCount === 0) {
    findings.push({ severity: 'warn', label: 'No fees captured', detail: 'No fees have been captured for this permit.' });
  } else {
    findings.push({ severity: 'ok', label: 'Fees captured', detail: `${feeCount} fee record(s).` });
  }
  const g = grade(findings.filter(f => f.severity !== 'info'));
  const fails = findings.filter(f => f.severity === 'fail').length;
  return {
    ...g,
    findings,
    recommendations: fails ? [{ action: 'review_blockers' }] : [],
    summary: fails
      ? `Compliance check failed with ${fails} blocker(s). Fix these before submitting: ${findings.filter(f => f.severity === 'fail').map(f => f.label).join(', ')}`
      : g.verdict === 'warn'
        ? `Compliance check passed with warnings (score ${g.score}/100). Address before submission.`
        : `Compliance check passed (score ${g.score}/100) - ready to submit.`
  };
};

const RUNNERS = {
  triage,
  drawing_validation: drawingValidation,
  compliance_checker: complianceChecker
};

export async function runAgent(agentId, event, { by = null } = {}) {
  const agent = AGENTS.find(a => a.id === agentId);
  if (!agent) throw new Error(`Unknown agent: ${agentId}`);
  const runner = RUNNERS[agentId];
  const entity = event.entity || {};
  const result = agentId === 'drawing_validation' ? await runner(entity) : runner(entity);
  const run = recordRun(agentId, agent.entity_type, entity.id || null, result, by);
  emitEvent('agent.completed', { agent_id: agentId, entity_type: agent.entity_type, entity_id: entity.id || null, verdict: result.verdict, score: result.score, run_id: run.id }, { by });
  return run;
}

export function applyAgentRun(runId, { by = null } = {}) {
  const run = db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(runId);
  if (!run) return null;
  if (run.applied) return { ...run, already_applied: true };
  let applied = null;
  if (run.agent_id === 'triage' && run.entity_type === 'tmp') {
    const tmp = db.prepare('SELECT * FROM traffic_management_plans WHERE id = ?').get(run.entity_id);
    if (tmp) {
      let recommendations = [];
      try { recommendations = run.recommended_json ? JSON.parse(run.recommended_json) : []; } catch {}
      const rec = recommendations.find(r => r.action === 'set_complexity');
      if (rec) {
        const prev = tmp.complexity || 'standard';
        db.prepare("UPDATE traffic_management_plans SET complexity = ?, complexity_source = 'auto', updated_at = datetime('now') WHERE id = ?").run(rec.complexity, run.entity_id);
        swapTemplateForEntity('tmp', run.entity_id);
        db.prepare('INSERT INTO plan_activities (id, tmp_id, user_id, action, description) VALUES (?, ?, ?, ?, ?)')
          .run(uuid(), run.entity_id, by || null, 'complexity_changed', `Complexity changed to ${rec.complexity} (applied from triage agent)`);
        emitEvent('tmp.complexity_changed', { id: run.entity_id, complexity: rec.complexity, previous_complexity: prev, complexity_source: 'auto', applied_by_agent: run.agent_id }, { by });
        applied = { action: 'set_complexity', complexity: rec.complexity };
      }
    }
  }
  db.prepare('UPDATE agent_runs SET applied = 1, applied_by = ?, applied_at = datetime(\'now\') WHERE id = ?').run(by || null, runId);
  return { ...run, applied: 1, applied_by: by || null, applied_at: new Date().toISOString(), applied };
}

export function latestRunFor(agentId, entityType, entityId) {
  return db.prepare('SELECT * FROM agent_runs WHERE agent_id = ? AND entity_type = ? AND entity_id = ? ORDER BY created_at DESC LIMIT 1').get(agentId, entityType, entityId);
}
