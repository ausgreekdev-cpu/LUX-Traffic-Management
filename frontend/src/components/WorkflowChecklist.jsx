import React, { useEffect, useState } from 'react';
import api from '../api';

export default function WorkflowChecklist({ entityType, entityId }) {
  const [checklist, setChecklist] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.workflows.checklist(entityType, entityId).then(setChecklist).catch(() => setChecklist({ data: [], required_complete: true }));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [entityType, entityId]);

  if (!checklist || checklist.data.length === 0) return null;

  const done = checklist.data.filter(s => s.is_done).length;
  const total = checklist.data.length;
  const toggle = async (stage) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.workflows.setStage(entityType, entityId, stage.id, !stage.is_done);
      await load();
    } catch (err) {
      alert(err.message);
    }
    setBusy(false);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold">Workflow checklist</h2>
        <span className="text-xs text-gray-500">{done}/{total} done</span>
      </div>
      <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded mb-3 overflow-hidden">
        <div className="h-full bg-amber-500 transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
      <div className="space-y-2">
        {checklist.data.map(stage => (
          <label key={stage.id} className="flex items-start gap-2 text-sm cursor-pointer p-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-700">
            <input type="checkbox" checked={!!stage.is_done} onChange={() => toggle(stage)} className="mt-0.5" />
            <span className="min-w-0">
              <span className={`font-medium ${stage.is_done ? 'line-through text-gray-400' : ''}`}>{stage.name}</span>
              {stage.description && <span className="block text-xs text-gray-500">{stage.description}</span>}
              {stage.is_done && stage.done_at && <span className="block text-xs text-gray-400">Done {stage.done_at?.slice(0, 10)}</span>}
            </span>
            <span className={`ml-auto shrink-0 text-xs px-2 py-0.5 rounded ${stage.is_optional ? 'bg-gray-100 text-gray-500' : 'bg-red-100 text-red-700'}`}>
              {stage.is_optional ? 'Optional' : 'Required'}
            </span>
          </label>
        ))}
      </div>
      {!checklist.required_complete && (
        <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">All required stages must be ticked before this can be marked approved or completed.</p>
      )}
    </div>
  );
}
