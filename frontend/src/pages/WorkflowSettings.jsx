import React, { useEffect, useState } from 'react';
import api from '../api';

const types = [
  { value: 'tmp', label: 'TMP' },
  { value: 'permit', label: 'Permit' }
];

export default function WorkflowSettings() {
  const [entityType, setEntityType] = useState('tmp');
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', description: '', is_optional: false });
  const [editingId, setEditingId] = useState(null);
  const [saved, setSaved] = useState('');

  const load = () => api.workflows.stages(entityType).then(setStages);
  useEffect(() => { setLoading(true); load().finally(() => setLoading(false)); /* eslint-disable-next-line */ }, [entityType]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return alert('Stage name is required');
    try {
      if (editingId) {
        await api.workflows.updateStage(editingId, form);
      } else {
        await api.workflows.createStage({ entity_type: entityType, ...form });
      }
      setForm({ name: '', description: '', is_optional: false });
      setEditingId(null);
      setSaved(editingId ? 'Stage updated' : 'Stage added');
      setTimeout(() => setSaved(''), 2500);
      await load();
    } catch (err) { alert(err.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this stage? Checklist entries for existing TMPs/permits will also be removed.')) return;
    try {
      await api.workflows.deleteStage(id);
      await load();
    } catch (err) { alert(err.message); }
  };

  const toggleOptional = async (stage) => {
    try {
      await api.workflows.updateStage(stage.id, { is_optional: !stage.is_optional });
      await load();
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
      await load();
    } catch (err) { alert(err.message); }
  };

  if (loading) return <p className="text-gray-500">Loading…</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Workflow Stages</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Configure the stages each TMP or permit must pass through. Required stages must be ticked before a record can be marked <b>approved</b> or <b>completed</b>; optional stages are tracked but not enforced.</p>
      </div>

      <div className="flex gap-2">
        {types.map(t => (
          <button key={t.value} onClick={() => { setEntityType(t.value); setEditingId(null); setForm({ name: '', description: '', is_optional: false }); }}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${entityType === t.value ? 'bg-amber-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
            {t.label} stages
          </button>
        ))}
      </div>

      {saved && <p className="text-sm text-green-600 dark:text-green-400">{saved}</p>}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow divide-y dark:divide-gray-700">
        {stages.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">No stages configured yet — add the first one below.</p>
        ) : stages.map((stage, i) => (
          <div key={stage.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm">{stage.name}</p>
                <span className={`text-xs px-2 py-0.5 rounded ${stage.is_optional ? 'bg-gray-100 text-gray-500' : 'bg-red-100 text-red-700'}`}>
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
              <button onClick={() => { setEditingId(stage.id); setForm({ name: stage.name, description: stage.description || '', is_optional: !!stage.is_optional }); }} className="text-amber-600 hover:underline text-xs">Edit</button>
              <button onClick={() => handleDelete(stage.id)} className="text-red-500 hover:underline text-xs">Delete</button>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <h2 className="font-semibold mb-3">{editingId ? 'Edit stage' : `Add ${entityType} stage`}</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-40">
            <label className="text-xs text-gray-500 block mb-1">Name</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="border rounded px-2 py-1.5 text-sm w-full" required />
          </div>
          <div className="flex-1 min-w-52">
            <label className="text-xs text-gray-500 block mb-1">Description</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="border rounded px-2 py-1.5 text-sm w-full" />
          </div>
          <label className="flex items-center gap-2 text-sm mb-1">
            <input type="checkbox" checked={form.is_optional} onChange={e => setForm(f => ({ ...f, is_optional: e.target.checked }))} />
            Optional
          </label>
          <div className="flex gap-2">
            <button type="submit" className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded text-sm">{editingId ? 'Update' : 'Add stage'}</button>
            {editingId && (
              <button type="button" onClick={() => { setEditingId(null); setForm({ name: '', description: '', is_optional: false }); }} className="text-gray-500 text-sm px-2 py-1.5">Cancel</button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
