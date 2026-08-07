import React, { useEffect, useState } from 'react';
import api from '../api';

const ENTITY_TYPES = ['tmp', 'permit', 'fee', 'document'];
const EVENT_TYPES = [
  'tmp.created', 'tmp.status_changed', 'tmp.completed', 'tmp.complexity_changed', 'tmp.expiring', 'tmp.expired',
  'permit.created', 'permit.status_changed', 'permit.complexity_changed', 'permit.expiring', 'permit.expired',
  'fee.created', 'document.uploaded', 'document.deleted', 'email.sent',
  'stage.completed', 'sla.deadline_approaching', 'sla.overdue', 'agent.completed',
  'correspondence.received', 'correspondence.matched'
];
const OPS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in', 'exists'];
const FIELDS = ['status', 'previous_status', 'complexity', 'plan_type', 'reference', 'tmp_id', 'authority_id', 'is_within_30m_signals', 'requires_mrwa', 'fee_type', 'amount', 'days_left', 'days_overdue', 'entity_type'];
const ACTION_TYPES = [
  { value: 'notify_user', label: 'Notify owner' },
  { value: 'notify_role', label: 'Notify role' },
  { value: 'create_task', label: 'Create task' },
  { value: 'notify_email', label: 'Send email' },
  { value: 'set_field', label: 'Set field' },
  { value: 'raise_trigger', label: 'Raise workflow trigger' },
  { value: 'compute_risk_score', label: 'Recompute risk score' },
  { value: 'run_agent', label: 'Run AI agent' },
  { value: 'webhook', label: 'Webhook' }
];

const emptyCondition = () => ({ field: 'status', op: 'eq', value: '' });
const emptyAction = () => ({ type: 'notify_user', params: { title: '', message: '' } });

const ACTION_PARAMS = {
  notify_user: [
    { key: 'title', label: 'Title', hint: 'Supports {field} placeholders' },
    { key: 'message', label: 'Message', hint: 'Supports {field} placeholders' },
    { key: 'notification_type', label: 'Type', hint: 'e.g. permit, tmp_expiring, sla_warning' }
  ],
  notify_role: [
    { key: 'role', label: 'Role', hint: 'admin / planner / viewer' },
    { key: 'title', label: 'Title', hint: 'Supports {field} placeholders' },
    { key: 'message', label: 'Message', hint: 'Supports {field} placeholders' },
    { key: 'notification_type', label: 'Type', hint: 'optional' }
  ],
  create_task: [
    { key: 'role', label: 'Assign to role', hint: 'admin / planner / viewer' },
    { key: 'title', label: 'Task title', hint: 'Supports {field} placeholders' },
    { key: 'message', label: 'Details', hint: 'optional' },
    { key: 'due_in_days', label: 'Due in days', hint: 'optional' }
  ],
  notify_email: [
    { key: 'to', label: 'To', hint: 'email or {field}' },
    { key: 'template', label: 'Template name', hint: 'rendered from Email Templates tab' },
    { key: 'subject', label: 'Subject override', hint: 'optional; defaults to template' },
    { key: 'body', label: 'Body override', hint: 'optional; defaults to template' }
  ],
  set_field: [
    { key: 'entity_type', label: 'Entity', hint: 'tmp / permit (optional)' },
    { key: 'field', label: 'Field', hint: 'e.g. status, description, expiry_date' },
    { key: 'value', label: 'Value', hint: 'new value' }
  ],
  raise_trigger: [
    { key: 'trigger_type', label: 'Trigger type', hint: 'e.g. mrwa_referral_required' },
    { key: 'description', label: 'Description', hint: 'Supports {field} placeholders' }
  ],
  run_agent: [
    { key: 'agent', label: 'Agent', hint: 'triage / drawing_validation / compliance_checker' }
  ],
  webhook: [
    { key: 'url', label: 'URL', hint: 'POST endpoint receiving the event' }
  ]
};

function paramsToObj(type, values) {
  const obj = {};
  (ACTION_PARAMS[type] || []).forEach(({ key }) => {
    const v = values[key];
    if (v !== undefined && v !== null && String(v).trim() !== '') obj[key] = v;
  });
  return obj;
}

function objToParams(type, obj) {
  const values = {};
  (ACTION_PARAMS[type] || []).forEach(({ key }) => { values[key] = obj[key] || ''; });
  return values;
}

function ActionEditor({ action, onChange }) {
  const [values, setValues] = useState(() => objToParams(action.type, action.params));
  const fields = ACTION_PARAMS[action.type] || [];
  const update = (key, val) => {
    const next = { ...values, [key]: val };
    setValues(next);
    onChange({ ...action, params: paramsToObj(action.type, next) });
  };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {fields.map(f => (
        <div key={f.key}>
          <label className="text-xs text-gray-500 block mb-0.5">{f.label}</label>
          <input value={values[f.key] || ''} onChange={e => update(f.key, e.target.value)}
            placeholder={f.hint} className="input" />
        </div>
      ))}
    </div>
  );
}

function previewText(rule) {
  const conds = (rule.conditions || []).map(c => `${c.field} ${c.op} ${c.value}`).join(' AND ');
  const acts = (rule.actions || []).map(a => a.type).join(', ');
  return `WHEN ${rule.event_type || '?'}${conds ? ` IF ${conds}` : ''} THEN ${acts || '?'}`;
}

export default function AutomationSettings() {
  const [tab, setTab] = useState('rules');
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);
  const [runs, setRuns] = useState([]);
  const [presets, setPresets] = useState([]);
  const [testResult, setTestResult] = useState(null);
  const [saved, setSaved] = useState('');
  const [agents, setAgents] = useState([]);
  const [agentRuns, setAgentRuns] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [tplForm, setTplForm] = useState(null);

  const load = () => Promise.all([
    api.automations.rules().then(r => setRules(r.data)),
    api.automations.runs({ limit: 20 }).then(r => setRuns(r.data)),
    api.agents.list().then(r => setAgents(r.data)),
    api.agents.runs({ limit: 50 }).then(r => setAgentRuns(r.data)),
    api.email.templates().then(setTemplates)
  ]);

  useEffect(() => { setLoading(true); load().finally(() => setLoading(false)); /* eslint-disable-next-line */ }, []);
  useEffect(() => { api.automations.presets().then(r => setPresets(r.data)).catch(() => {}); }, []);

  const newForm = () => ({
    name: '', description: '', entity_type: 'tmp', event_type: 'tmp.created',
    conditions: [emptyCondition()], actions: [emptyAction()],
    is_active: true, priority: 0, cooldown_hours: 0, dedupe_key_template: ''
  });

  const startEdit = (rule) => {
    setTab('rules');
    setEditing(rule);
    setForm({
      name: rule.name, description: rule.description || '', entity_type: rule.entity_type,
      event_type: rule.event_type,
      conditions: (rule.conditions || []).map(c => ({ ...c })),
      actions: (rule.actions || []).map(a => ({ ...a, params: { ...a.params } })),
      is_active: !!rule.is_active, priority: rule.priority || 0,
      cooldown_hours: rule.cooldown_hours || 0, dedupe_key_template: rule.dedupe_key_template || ''
    });
    setTestResult(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return alert('Rule name is required');
    try {
      const payload = { ...form, conditions: form.conditions.filter(c => c.field && c.op), actions: form.actions.filter(a => a.type) };
      if (!payload.actions.length) return alert('At least one action is required');
      if (editing) await api.automations.updateRule(editing.id, payload);
      else await api.automations.createRule(payload);
      setSaved(editing ? 'Rule updated' : 'Rule created');
      setTimeout(() => setSaved(''), 2500);
      setEditing(null); setForm(null);
      await load();
    } catch (err) { alert(err.message); }
  };

  const handleDelete = async (rule) => {
    if (!confirm(`Delete rule "${rule.name}"? Its run history will be kept.`)) return;
    try {
      await api.automations.deleteRule(rule.id);
      await load();
    } catch (err) { alert(err.message); }
  };

  const toggleActive = async (rule) => {
    try {
      const fresh = await api.automations.getRule(rule.id);
      await api.automations.updateRule(rule.id, { ...fresh, is_active: !rule.is_active });
      await load();
    } catch (err) { alert(err.message); }
  };

  const handleTest = async (rule, entityType, entityId) => {
    if (!entityId) return alert('Enter an entity ID to test against');
    try {
      setTestResult({ loading: true, rule });
      const result = await api.automations.testRule(rule.id, entityType, entityId);
      setTestResult({ loading: false, rule, result });
    } catch (err) {
      setTestResult({ loading: false, rule, error: err.message });
    }
  };

  const installPreset = async (p) => {
    try {
      const result = await api.automations.installPreset(p.id);
      setSaved(result.installed ? `Preset "${p.name}" installed` : 'Preset already installed');
      setTimeout(() => setSaved(''), 2500);
      setPresets(presets.map(x => x.id === p.id ? { ...x, installed: true } : x));
      await load();
    } catch (err) { alert(err.message); }
  };

  const runScanNow = async () => {
    try {
      await api.automations.runScheduled();
      setSaved('Scheduled checks run - rules fired');
      setTimeout(() => setSaved(''), 2500);
      await load();
    } catch (err) { alert(err.message); }
  };

  const handleAgentRun = async (agent, entityType, entityId) => {
    if (!entityId) return alert('Enter an entity ID to run the agent against');
    try {
      const result = await api.agents.run(agent.id, entityType, entityId);
      setSaved(`Agent "${agent.name}" ran: ${result.verdict} (${result.score}/100)`);
      setTimeout(() => setSaved(''), 4000);
      await load();
    } catch (err) { alert(err.message); }
  };

  const handleAgentApply = async (run) => {
    try {
      const result = await api.agents.apply(run.id);
      setSaved(result.applied?.action ? `Recommendation applied (${result.applied.complexity})` : 'Run acknowledged');
      setTimeout(() => setSaved(''), 4000);
      await load();
    } catch (err) { alert(err.message); }
  };

  const handleTemplateSave = async (e) => {
    e.preventDefault();
    if (!tplForm.name.trim() || !tplForm.subject.trim() || !tplForm.body.trim()) return alert('Name, subject and body are required');
    try {
      if (tplForm.id) await api.email.updateTemplate(tplForm.id, { name: tplForm.name, subject: tplForm.subject, body: tplForm.body, event_type: tplForm.event_type || undefined });
      else await api.email.createTemplate({ name: tplForm.name, subject: tplForm.subject, body: tplForm.body, event_type: tplForm.event_type || undefined });
      setSaved('Email template saved');
      setTimeout(() => setSaved(''), 2500);
      setTplForm(null);
      await load();
    } catch (err) { alert(err.message); }
  };

  if (loading && !rules.length) return <p className="text-gray-500">Loading…</p>;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-header">Automation & Trigger Settings</h1>
          <p className="page-sub mt-1">Event-driven rules that react to TMP, permit, fee, document and SLA events. All rules are user-editable and run in the background.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={runScanNow} className="btn btn-ghost">Run scheduled checks</button>
          <button onClick={() => { setEditing(null); setForm(newForm()); setTestResult(null); }} className="btn btn-primary">+ New rule</button>
        </div>
      </div>

      {saved && <p className="text-sm text-green-600 dark:text-green-400">{saved}</p>}

      <div className="flex gap-2 flex-wrap">
        {[['rules', 'Rules'], ['presets', 'Preset library'], ['agents', 'AI Agents'], ['templates', 'Email templates'], ['history', 'Run history']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`tab ${tab === key ? 'tab-active' : 'tab-inactive'}`}>
            {label}
          </button>
        ))}
      </div>

      {form && (
        <form onSubmit={handleSave} className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{editing ? 'Edit rule' : 'New rule'}</h2>
            <button type="button" onClick={() => { setEditing(null); setForm(null); }} className="text-gray-500 text-sm">Cancel</button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Rule name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input" required />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Description</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Entity</label>
              <select value={form.entity_type} onChange={e => setForm(f => ({ ...f, entity_type: e.target.value }))} className="input">
                {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Event</label>
              <select value={form.event_type} onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))} className="input">
                {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">Conditions (IF — all must match)</label>
              <button type="button" onClick={() => setForm(f => ({ ...f, conditions: [...f.conditions, emptyCondition()] }))} className="text-xs text-lux-600 dark:text-lux-400 hover:underline">+ Add condition</button>
            </div>
            <div className="space-y-2">
              {form.conditions.map((c, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <input list="auto-fields" value={c.field} onChange={e => setForm(f => { const cs = [...f.conditions]; cs[i] = { ...cs[i], field: e.target.value }; return { ...f, conditions: cs }; })} className="input w-44" placeholder="field" />
                  <select value={c.op} onChange={e => setForm(f => { const cs = [...f.conditions]; cs[i] = { ...cs[i], op: e.target.value }; return { ...f, conditions: cs }; })} className="input">
                    {OPS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <input value={c.value} onChange={e => setForm(f => { const cs = [...f.conditions]; cs[i] = { ...cs[i], value: e.target.value }; return { ...f, conditions: cs }; })} className="input w-40" placeholder="value" />
                  <button type="button" onClick={() => setForm(f => ({ ...f, conditions: f.conditions.filter((_, j) => j !== i) }))} className="text-red-500 text-xs">✕</button>
                </div>
              ))}
            </div>
            <datalist id="auto-fields">{FIELDS.map(f => <option key={f} value={f} />)}</datalist>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">Actions (THEN)</label>
              <button type="button" onClick={() => setForm(f => ({ ...f, actions: [...f.actions, emptyAction()] }))} className="text-xs text-lux-600 dark:text-lux-400 hover:underline">+ Add action</button>
            </div>
            <div className="space-y-3">
              {form.actions.map((a, i) => (
                <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <select value={a.type} onChange={e => setForm(f => { const as = [...f.actions]; as[i] = { type: e.target.value, params: {} }; return { ...f, actions: as }; })} className="input">
                      {ACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <button type="button" onClick={() => setForm(f => ({ ...f, actions: f.actions.filter((_, j) => j !== i) }))} className="text-red-500 text-xs">✕</button>
                  </div>
                  <ActionEditor action={a} onChange={(next) => setForm(f => { const as = [...f.actions]; as[i] = next; return { ...f, actions: as }; })} />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Priority (higher runs first)</label>
              <input type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Cooldown (hours between runs)</label>
              <input type="number" value={form.cooldown_hours} onChange={e => setForm(f => ({ ...f, cooldown_hours: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Dedupe key template</label>
              <input value={form.dedupe_key_template} onChange={e => setForm(f => ({ ...f, dedupe_key_template: e.target.value }))} placeholder="e.g. approval-{id}" className="input" />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
            Rule active
          </label>

          <p className="text-xs bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-2 font-mono">{previewText(form)}</p>

          <button type="submit" className="btn btn-primary">{editing ? 'Update rule' : 'Create rule'}</button>
        </form>
      )}

      {tab === 'rules' && (
        <div className="card divide-y dark:divide-gray-700">
          {rules.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">No rules yet — create one or install presets.</p>
          ) : rules.map(rule => (
            <div key={rule.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{rule.name}</p>
                    <span className={`badge ${rule.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                      {rule.is_active ? 'Active' : 'Paused'}
                    </span>
                    <span className="text-xs text-gray-400">{rule.entity_type} · {rule.event_type}</span>
                  </div>
                  {rule.description && <p className="text-xs text-gray-500 mt-0.5">{rule.description}</p>}
                  <p className="text-xs text-gray-400 mt-1 font-mono">{previewText({ event_type: rule.event_type, conditions: rule.conditions ? JSON.parse(JSON.stringify(rule.conditions)) : [], actions: rule.actions ? JSON.parse(JSON.stringify(rule.actions)) : [] })}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => toggleActive(rule)} className="btn btn-ghost btn-sm">
                    {rule.is_active ? 'Pause' : 'Activate'}
                  </button>
                  <button onClick={() => startEdit(rule)} className="text-lux-600 dark:text-lux-400 hover:underline text-xs font-medium">Edit</button>
                  <button onClick={() => handleDelete(rule)} className="text-red-500 hover:underline text-xs font-medium">Delete</button>
                </div>
              </div>

              <details className="mt-2">
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">Test console</summary>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <select id={`test-type-${rule.id}`} defaultValue="permit" className="input !py-1">
                    <option value="tmp">tmp</option>
                    <option value="permit">permit</option>
                  </select>
                  <input id={`test-id-${rule.id}`} placeholder="entity id (e.g. demo-permit-5)" className="input w-56" />
                  <button onClick={() => handleTest(rule, document.getElementById(`test-type-${rule.id}`).value, document.getElementById(`test-id-${rule.id}`).value)}
                    className="btn btn-ghost btn-sm">Dry-run test</button>
                </div>
                {testResult && testResult.rule?.id === rule.id && (
                  <div className="mt-2 text-xs bg-gray-50 dark:bg-gray-900 rounded p-3 space-y-1">
                    {testResult.loading ? <p className="text-gray-500">Testing…</p> : testResult.error ? (
                      <p className="text-red-600">{testResult.error}</p>
                    ) : (
                      <>
                        <p>Matched: <b className={testResult.result.matched ? 'text-green-600' : 'text-red-600'}>{String(testResult.result.matched)}</b></p>
                        {testResult.result.conditions?.map((c, i) => (
                          <p key={i} className={c.passed ? 'text-green-700' : 'text-red-600'}>
                            {c.field} {c.op} {JSON.stringify(c.value)} → {c.passed ? 'pass' : 'fail'}
                          </p>
                        ))}
                        {testResult.result.planned_actions?.map((a, i) => <p key={i} className="text-gray-600">→ {a.type}</p>)}
                      </>
                    )}
                  </div>
                )}
              </details>
            </div>
          ))}
        </div>
      )}

      {tab === 'presets' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {presets.map(p => (
            <div key={p.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-sm">{p.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>
                  <p className="text-xs text-gray-400 mt-1">{p.entity_type} · {p.event_type}</p>
                </div>
                <button onClick={() => installPreset(p)} disabled={p.installed}
                  className={`btn btn-sm shrink-0 ${p.installed ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 cursor-default' : 'btn-primary'}`}>
                  {p.installed ? 'Installed' : 'Install'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'agents' && (
        <div className="space-y-6">
          <p className="text-sm text-gray-500 dark:text-gray-400">Agents are deterministic automation actions with a human-in-the-loop gate: they produce a verdict, score and findings report — recommendations are applied only when you confirm. They run automatically when the preset rules below are installed, or manually here.</p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {agents.map(a => (
              <div key={a.id} className="card p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-sm">{a.name}</p>
                  <span className={`badge ${a.fail ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : a.warn ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'}`}>
                    {a.runs ? `${a.runs} runs` : 'never run'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{a.description}</p>
                <p className="text-xs text-gray-400 mt-1">{a.entity_type} · {a.event_type}</p>
                <div className="mt-3 flex items-center gap-2">
                  <input id={`agent-entity-${a.id}`} placeholder="entity id" className="input" />
                  <button onClick={() => handleAgentRun(a, a.entity_type, document.getElementById(`agent-entity-${a.id}`).value)}
                    className="btn btn-primary btn-sm shrink-0">Run now</button>
                </div>
              </div>
            ))}
          </div>
          <div className="card overflow-x-auto">
            <h2 className="px-4 pt-4 font-semibold text-sm">Agent runs</h2>
            <table className="w-full text-sm mt-2">
              <thead className="text-left text-xs text-gray-500 border-b dark:border-gray-700">
                <tr>
                  <th className="table-th">Verdict</th>
                  <th className="table-th">Agent</th>
                  <th className="table-th">Entity</th>
                  <th className="table-th">Score</th>
                  <th className="table-th">Summary</th>
                  <th className="table-th">When</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {agentRuns.length === 0 ? (
                  <tr><td className="table-td text-gray-500" colSpan={6}>No agent runs yet.</td></tr>
                ) : agentRuns.map(run => {
                  let findings = [];
                  let recommendations = [];
                  try { findings = run.findings_json ? JSON.parse(run.findings_json) : []; } catch {}
                  try { recommendations = run.recommended_json ? JSON.parse(run.recommended_json) : []; } catch {}
                  return (
                    <tr key={run.id}>
                      <td className="table-td">
                        <span className={`badge ${run.verdict === 'ok' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : run.verdict === 'warn' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>{run.verdict}</span>
                      </td>
                      <td className="table-td text-xs">{run.agent_id}</td>
                      <td className="table-td text-xs">{run.entity_type}:{String(run.entity_id || '').slice(0, 16)}</td>
                      <td className="table-td">{run.score != null ? Math.round(run.score) : '—'}</td>
                      <td className="table-td text-xs max-w-md">{run.summary}
                        {findings.length > 0 && (
                          <details className="mt-1">
                            <summary className="text-xs text-gray-500 cursor-pointer">Findings ({findings.length})</summary>
                            <ul className="mt-1 space-y-1">
                              {findings.map((f, i) => (
                                <li key={i} className={`text-xs ${f.severity === 'fail' ? 'text-red-600' : f.severity === 'warn' ? 'text-yellow-600' : f.severity === 'ok' ? 'text-green-600' : 'text-gray-500'}`}>
                                  <b>{f.label}:</b> {f.detail}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </td>
                      <td className="table-td text-xs text-gray-500">
                        {run.created_at?.slice(0, 16)}
                        {recommendations.length > 0 && !run.applied && (
                          <button onClick={() => handleAgentApply(run)} className="ml-2 text-xs px-2 py-0.5 rounded bg-green-500 hover:bg-green-600 text-white">Apply</button>
                        )}
                        {run.applied && <span className="ml-2 text-xs text-green-600">applied{run.applied_at ? ' ' + run.applied_at.slice(0, 10) : ''}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'templates' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Reusable email templates rendered with <b>{'{field}'}</b> placeholders (e.g. {'{reference}'}, {'{tmp_reference}'}, {'{expiry_date}'}). Reference a template by name in the <b>Send email</b> rule action.</p>
          <div className="flex justify-end">
            <button onClick={() => setTplForm({ name: '', subject: '', body: '', event_type: '', id: null })} className="btn btn-primary btn-sm">+ New template</button>
          </div>
          {tplForm && (
            <form onSubmit={handleTemplateSave} className="card p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Name *</label>
                  <input value={tplForm.name} onChange={e => setTplForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. permit_approved" className="input w-full" />
                </div>
                <div>
                  <label className="label">Event type (optional)</label>
                  <input value={tplForm.event_type} onChange={e => setTplForm(f => ({ ...f, event_type: e.target.value }))} placeholder="e.g. permit.status_changed" className="input w-full" />
                </div>
              </div>
              <div>
                <label className="label">Subject *</label>
                <input value={tplForm.subject} onChange={e => setTplForm(f => ({ ...f, subject: e.target.value }))} placeholder="Permit approved for {tmp_reference}" className="input w-full" />
              </div>
              <div>
                <label className="label">Body *</label>
                <textarea value={tplForm.body} onChange={e => setTplForm(f => ({ ...f, body: e.target.value }))} rows={5} placeholder="Dear customer,{newline}Your permit for {tmp_reference} has been approved..." className="input w-full font-mono text-xs" />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn btn-primary btn-sm">{tplForm.id ? 'Update' : 'Create'}</button>
                <button type="button" onClick={() => setTplForm(null)} className="btn btn-ghost btn-sm">Cancel</button>
              </div>
            </form>
          )}
          <div className="card divide-y dark:divide-gray-700">
            {templates.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">No templates yet.</p>
            ) : templates.map(t => (
              <div key={t.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{t.name}</p>
                    <p className="text-xs text-gray-500 truncate">{t.subject}</p>
                    {t.event_type && <p className="text-xs text-gray-400 mt-0.5">{t.event_type}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setTplForm({ name: t.name, subject: t.subject, body: t.body, event_type: t.event_type || '', id: t.id })} className="text-amber-600 hover:underline text-xs">Edit</button>
                    <button onClick={async () => { if (confirm(`Delete template "${t.name}"?`)) { try { await api.email.deleteTemplate(t.id); await load(); } catch (err) { alert(err.message); } } }} className="text-red-500 hover:underline text-xs">Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-500 border-b dark:border-gray-700">
              <tr>
                <th className="table-th">Status</th>
                <th className="table-th">Rule</th>
                <th className="table-th">Event</th>
                <th className="table-th">Entity</th>
                <th className="table-th">Result</th>
                <th className="table-th">When</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {runs.length === 0 ? (
                <tr><td className="table-td text-gray-500" colSpan={6}>No rule executions yet.</td></tr>
              ) : runs.map(run => {
                let actionsText = '—';
                try {
                  const acts = run.actions_json ? JSON.parse(run.actions_json) : [];
                  actionsText = acts.map(a => a.error ? `${a.type} (error: ${a.error})` : `${a.type}${a.skipped ? ` (${a.skipped})` : a.created !== undefined ? ` (${a.created ? 'ok' : 'no-op'})` : a.status ? ` (${a.status})` : ''}`).join(', ') || 'no actions';
                } catch {}
                return (
                  <tr key={run.id}>
                    <td className="table-td">
                      <span className={`badge ${run.status === 'fired' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : run.status === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="table-td">{run.rule_name || run.rule_id}</td>
                    <td className="table-td text-xs">{run.event_type}</td>
                    <td className="table-td text-xs">{run.entity_type}{run.entity_id ? `:${String(run.entity_id).slice(0, 16)}` : ''}</td>
                    <td className="table-td text-xs max-w-xs truncate">{actionsText}</td>
                    <td className="table-td text-xs text-gray-500">{run.created_at?.slice(0, 16)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
