import { useEffect, useState } from 'react';
import api from '../api';
import { useAppText } from '../context/AppText';

const types = [
  { value: 'tmp', label: 'TMP' },
  { value: 'permit', label: 'Permit' }
];

const complexities = [
  { value: 'simple', label: 'Simple' },
  { value: 'standard', label: 'Standard' },
  { value: 'complex', label: 'Complex' },
  { value: 'complex_with_notice', label: 'Complex + notice' }
];
export default function WorkflowSettings() {
  const { pageTitle, complexity } = useAppText();
  const [entityType, setEntityType] = useState('tmp');
  const [templates, setTemplates] = useState([]);
  const [authorities, setAuthorities] = useState([]);
  const [selection, setSelection] = useState('global');
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stageForm, setStageForm] = useState({ name: '', description: '', is_optional: false });
  const [editingStageId, setEditingStageId] = useState(null);
  const [templateForm, setTemplateForm] = useState({ name: '', description: '', complexity: 'standard', authority_id: '', is_default: false });
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [saved, setSaved] = useState('');

  const flash = (msg) => { setSaved(msg); setTimeout(() => setSaved(''), 2500); };

  const loadTemplates = () => api.workflows.templates(entityType).then(setTemplates).catch(() => setTemplates([]));

  useEffect(() => {
    setLoading(true);
    api.authorities.list().then(setAuthorities).catch(() => {});
    loadTemplates()
      .then(() => { setSelection('global'); setStages([]); setStageForm({ name: '', description: '', is_optional: false }); setEditingStageId(null); })
      .finally(() => setLoading(false));
    /* eslint-disable-next-line */
  }, [entityType]);

  const loadStages = () => {
    if (selection === 'global') return api.workflows.stages(entityType).then(setStages).catch(() => setStages([]));
    return api.workflows.stages(null, selection).then(setStages).catch(() => setStages([]));
  };

  useEffect(() => { loadStages().catch(() => {}); }, [selection, entityType]);

  const handleStageSubmit = async (e) => {
    e.preventDefault();
    if (!stageForm.name.trim()) return alert('Stage name is required');
    try {
      if (editingStageId) {
        await api.workflows.updateStage(editingStageId, stageForm);
      } else if (selection === 'global') {
        await api.workflows.createStage({ entity_type: entityType, ...stageForm });
      } else {
        await api.workflows.createStage({ entity_type: entityType, template_id: selection, ...stageForm });
      }
      setStageForm({ name: '', description: '', is_optional: false });
      setEditingStageId(null);
      flash(editingStageId ? 'Stage updated' : 'Stage added');
      await loadStages();
    } catch (err) { alert(err.message); }
  };

  const handleDeleteStage = async (id) => {
    if (!confirm('Delete this stage? Checklist entries for existing TMPs/permits will also be removed.')) return;
    try {
      await api.workflows.deleteStage(id);
      await loadStages();
    } catch (err) { alert(err.message); }
  };

  const toggleOptional = async (stage) => {
    try {
      await api.workflows.updateStage(stage.id, { is_optional: !stage.is_optional });
      await loadStages();
    } catch (err) { alert(err.message); }
  };

  const move = async (stage, dir) => {
    const sorted = [...stages].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex(s => s.id === stage.id);
    const swapWith = sorted[idx + dir];
    if (!swapWith) return;
    try {
      await api.workflows.updateStage(stage.id, { sort_order: swapWith.sort_order });
      await api.workflows.updateStage(swapWith.id, { sort_order: stage.sort_order });
      await loadStages();
    } catch (err) { alert(err.message); }
  };

  const handleTemplateSubmit = async (e) => {
    e.preventDefault();
    if (!templateForm.name.trim()) return alert('Template name is required');
    try {
      if (editingTemplateId) {
        await api.workflows.updateTemplate(editingTemplateId, { name: templateForm.name, description: templateForm.description, is_default: templateForm.is_default });
      } else {
        await api.workflows.createTemplate({ entity_type: entityType, ...templateForm, authority_id: templateForm.authority_id || null });
      }
      setShowTemplateForm(false);
      setTemplateForm({ name: '', description: '', complexity: 'standard', authority_id: '', is_default: false });
      setEditingTemplateId(null);
      flash(editingTemplateId ? 'Template updated' : 'Template created');
      const list = await loadTemplates();
      if (list?.length && editingTemplateId) setSelection(editingTemplateId);
    } catch (err) { alert(err.message); }
  };

  const handleDeleteTemplate = async (id) => {
    if (!confirm('Delete this template? Its stages (and checklist entries) will also be removed. Existing records fall back to the default or global stages.')) return;
    try {
      await api.workflows.deleteTemplate(id);
      if (selection === id) setSelection('global');
      await loadTemplates();
    } catch (err) { alert(err.message); }
  };

  const setDefault = async (t) => {
    try {
      await api.workflows.updateTemplate(t.id, { is_default: !t.is_default });
      await loadTemplates();
    } catch (err) { alert(err.message); }
  };

  if (loading) return <p className="text-gray-500">Loading…</p>;

  const selected = templates.find(t => t.id === selection);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-header">{pageTitle('workflows', 'Workflow Templates')}</h1>
        <p className="page-sub mt-1">Stages now branch by <b>complexity</b> and <b>authority</b>. A record uses the most specific template that matches (authority + complexity → complexity → default → global fallback). Required stages gate approval/completion; optional ones are tracked but not enforced.</p>
      </div>

      <div className="flex gap-2">
        {types.map(t => (
          <button key={t.value} onClick={() => { setEntityType(t.value); setEditingStageId(null); setEditingTemplateId(null); setShowTemplateForm(false); }}
            className={`tab ${entityType === t.value ? 'tab-active' : 'tab-inactive'}`}>
            {t.label} stages
          </button>
        ))}
      </div>

      {saved && <p className="text-sm text-green-600 dark:text-green-400">{saved}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => { setSelection('global'); setEditingStageId(null); }}
          className={`px-3 py-1.5 rounded text-sm ${selection === 'global' ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}>
          Global fallback
        </button>
        {templates.map(t => (
          <button key={t.id} onClick={() => { setSelection(t.id); setEditingStageId(null); }}
            className={`px-3 py-1.5 rounded text-sm flex items-center gap-1.5 ${selection === t.id ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}>
            {t.is_default ? '⭐ ' : ''}{t.name}
            <span className="text-xs opacity-70">({complexity(t.complexity)}{t.authority_short ? ` · ${t.authority_short}` : ''})</span>
          </button>
        ))}
        <button onClick={() => { setShowTemplateForm(true); setEditingTemplateId(null); setTemplateForm({ name: '', description: '', complexity: 'standard', authority_id: '', is_default: false }); }}
          className="btn btn-primary btn-sm">
          + Template
        </button>
      </div>

      {showTemplateForm && (
        <form onSubmit={handleTemplateSubmit} className="card p-4 space-y-3">
          <h2 className="font-semibold">{editingTemplateId ? 'Edit template' : `New ${entityType} template`}</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Name *</label>
              <input value={templateForm.name} onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))} className="input" required />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Description</label>
              <input value={templateForm.description} onChange={e => setTemplateForm(f => ({ ...f, description: e.target.value }))} className="input" />
            </div>
            {!editingTemplateId && (
              <>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Complexity</label>
                  <select value={templateForm.complexity} onChange={e => setTemplateForm(f => ({ ...f, complexity: e.target.value }))} className="input">
                    {complexities.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Authority (optional)</label>
                  <select value={templateForm.authority_id} onChange={e => setTemplateForm(f => ({ ...f, authority_id: e.target.value }))} className="input">
                    <option value="">All authorities</option>
                    {authorities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={templateForm.is_default} onChange={e => setTemplateForm(f => ({ ...f, is_default: e.target.checked }))} />
            Default template for {entityType === 'tmp' ? 'TMPs' : 'permits'} (used when no complexity matches)
          </label>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary btn-sm">{editingTemplateId ? 'Update' : 'Create'}</button>
            <button type="button" onClick={() => { setShowTemplateForm(false); setEditingTemplateId(null); }} className="text-gray-500 text-sm px-2 py-1.5">Cancel</button>
          </div>
        </form>
      )}

      <div className="card">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-sm">{selection === 'global' ? 'Global fallback stages' : selected?.name || 'Stages'}</h2>
            {selection !== 'global' && selected && (
              <p className="text-xs text-gray-500">
                {complexity(selected.complexity)} · {selected.authority_name || 'All authorities'}{selected.is_default ? ' · Default' : ''}
              </p>
            )}
          </div>
          {selection !== 'global' && (
            <div className="flex gap-2 text-xs">
              <button onClick={() => setDefault(selected)} className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">{selected.is_default ? 'Unset default' : 'Set as default'}</button>
              <button onClick={() => { setEditingTemplateId(selected.id); setTemplateForm({ name: selected.name, description: selected.description || '', is_default: !!selected.is_default }); setShowTemplateForm(true); }} className="text-lux-600 dark:text-lux-400 hover:underline">Edit</button>
              <button onClick={() => handleDeleteTemplate(selected.id)} className="text-red-500 hover:underline">Delete</button>
            </div>
          )}
        </div>
        <div className="divide-y dark:divide-gray-700">
          {stages.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">No stages in this set — add the first one below.</p>
          ) : stages.map((stage, i) => (
            <div key={stage.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{stage.name}</p>
                  <span className={`badge ${stage.is_optional ? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>
                    {stage.is_optional ? 'Optional' : 'Required'}
                  </span>
                </div>
                {stage.description && <p className="text-xs text-gray-500 mt-0.5">{stage.description}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex flex-col">
                  <button disabled={i === 0} onClick={() => move(stage, -1)} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs leading-none">▲</button>
                  <button disabled={i === stages.length - 1} onClick={() => move(stage, 1)} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs leading-none">▼</button>
                </div>
                <button onClick={() => toggleOptional(stage)} className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">
                  {stage.is_optional ? 'Make required' : 'Make optional'}
                </button>
                <button onClick={() => { setEditingStageId(stage.id); setStageForm({ name: stage.name, description: stage.description || '', is_optional: !!stage.is_optional }); }} className="text-lux-600 dark:text-lux-400 hover:underline text-xs">Edit</button>
                <button onClick={() => handleDeleteStage(stage.id)} className="text-red-500 hover:underline text-xs">Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={handleStageSubmit} className="card p-4">
        <h2 className="font-semibold mb-3">{editingStageId ? 'Edit stage' : `Add stage${selection === 'global' ? ' (global fallback)' : ` to ${selected?.name || 'template'}`}`}</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-40">
            <label className="text-xs text-gray-500 block mb-1">Name</label>
            <input value={stageForm.name} onChange={e => setStageForm(f => ({ ...f, name: e.target.value }))} className="input" required />
          </div>
          <div className="flex-1 min-w-52">
            <label className="text-xs text-gray-500 block mb-1">Description</label>
            <input value={stageForm.description} onChange={e => setStageForm(f => ({ ...f, description: e.target.value }))} className="input" />
          </div>
          <label className="flex items-center gap-2 text-sm mb-1">
            <input type="checkbox" checked={stageForm.is_optional} onChange={e => setStageForm(f => ({ ...f, is_optional: e.target.checked }))} />
            Optional
          </label>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary btn-sm">{editingStageId ? 'Update' : 'Add stage'}</button>
            {editingStageId && (
              <button type="button" onClick={() => { setEditingStageId(null); setStageForm({ name: '', description: '', is_optional: false }); }} className="text-gray-500 text-sm px-2 py-1.5">Cancel</button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
