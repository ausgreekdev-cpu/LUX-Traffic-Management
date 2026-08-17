import { useEffect, useState } from 'react';
import api from '../../api';

const COLOURS = [
  { v: 'bg-gray-100', label: 'Gray' },
  { v: 'bg-blue-50', label: 'Blue' },
  { v: 'bg-blue-100', label: 'Blue (strong)' },
  { v: 'bg-purple-50', label: 'Purple' },
  { v: 'bg-amber-50', label: 'Amber' },
  { v: 'bg-orange-50', label: 'Orange' },
  { v: 'bg-green-50', label: 'Green' },
  { v: 'bg-green-100', label: 'Green (strong)' },
  { v: 'bg-red-50', label: 'Red' }
];

const STATUS_OPTIONS = {
  tmp: ['', 'draft', 'submitted', 'approved', 'rejected', 'completed', 'cancelled'],
  permit: ['', 'draft', 'submitted', 'under_review', 'approved', 'rejected', 'expired', 'cancelled', 'completed']
};

export default function ColumnEditor({ entityType, onChanged, onError }) {
  const [columns, setColumns] = useState([]);
  const [edits, setEdits] = useState({});
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.kanban.columns(entityType).then(setColumns).catch(err => onError(err.message));
  useEffect(() => { load(); }, [entityType]);

  const patch = (id, key, value) => setEdits(e => ({ ...e, [id]: { ...e[id], [key]: value } }));

  const save = async (id) => {
    const changes = edits[id];
    if (!changes) return;
    setBusy(true);
    try {
      const body = { ...changes };
      if (body.requires_stages !== undefined) body.requires_stages = String(body.requires_stages).split(',').map(s => s.trim()).filter(Boolean);
      await api.kanban.updateColumn(id, body);
      setEdits(e => { const n = { ...e }; delete n[id]; return n; });
      await load();
      onChanged && onChanged();
    } catch (err) {
      onError(err.message);
    }
    setBusy(false);
  };

  const remove = async (col) => {
    if (!confirm(`Delete column "${col.name}"? Cards will move to the first column.`)) return;
    try {
      await api.kanban.deleteColumn(col.id, true);
      await load();
      onChanged && onChanged();
    } catch (err) {
      onError(err.message);
    }
  };

  const move = async (index, dir) => {
    const ordered = [...columns];
    const target = index + dir;
    if (target < 0 || target >= ordered.length) return;
    const [item] = ordered.splice(index, 1);
    ordered.splice(target, 0, item);
    try {
      await api.kanban.reorderColumns(entityType, ordered.map(c => c.id));
      await load();
      onChanged && onChanged();
    } catch (err) {
      onError(err.message);
    }
  };

  const add = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await api.kanban.createColumn({ entity_type: entityType, name: newName.trim() });
      setNewName('');
      await load();
      onChanged && onChanged();
    } catch (err) {
      onError(err.message);
    }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New column name" className="input flex-1" />
        <button onClick={add} disabled={busy || !newName.trim()} className="btn btn-primary">Add column</button>
      </div>

      <div className="space-y-3">
        {columns.map((col, idx) => {
          const e = edits[col.id] || {};
          const requires = e.requires_stages !== undefined ? e.requires_stages : (col.requires_stages ? col.requires_stages.join(', ') : '');
          const dirty = Object.keys(e).length > 0;
          return (
            <div key={col.id} className="card p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className={`h-4 w-4 rounded ${col.colour || 'bg-gray-100'}`} />
                  <h3 className="font-semibold">{col.name}</h3>
                  <span className="text-xs text-gray-400">{idx + 1}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => move(idx, -1)} disabled={idx === 0} className="btn btn-sm">↑</button>
                  <button onClick={() => move(idx, 1)} disabled={idx === columns.length - 1} className="btn btn-sm">↓</button>
                  <button onClick={() => remove(col)} className="text-red-500 hover:underline text-xs px-2">Delete</button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">WIP limit (empty = unlimited)</label>
                  <input type="number" min="0" value={e.wip_limit !== undefined ? e.wip_limit : (col.wip_limit ?? '')} onChange={ev => patch(col.id, 'wip_limit', ev.target.value === '' ? null : Number(ev.target.value))} className="input w-full" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Enforce WIP</label>
                  <input type="checkbox" checked={e.enforce_wip !== undefined ? !!e.enforce_wip : !!col.enforce_wip} onChange={ev => patch(col.id, 'enforce_wip', ev.target.checked)} className="mt-2" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Maps to status</label>
                  <select value={e.maps_to_status !== undefined ? (e.maps_to_status || '') : (col.maps_to_status || '')} onChange={ev => patch(col.id, 'maps_to_status', ev.target.value)} className="input w-full">
                    {(STATUS_OPTIONS[entityType] || ['']).map(s => <option key={s || 'none'} value={s}>{s || '— none —'}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Auto-assign role</label>
                  <select value={e.assign_role !== undefined ? (e.assign_role || '') : (col.assign_role || '')} onChange={ev => patch(col.id, 'assign_role', ev.target.value)} className="input w-full">
                    <option value="">— none —</option>
                    {['developer', 'manager', 'staff', 'client'].map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-gray-500 block mb-1">Definition of Done — required workflow stages (comma separated)</label>
                  <input value={requires} onChange={ev => patch(col.id, 'requires_stages', ev.target.value)} placeholder="e.g. TMP drawing prepared, Internal review" className="input w-full" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Stale after (business days)</label>
                  <input type="number" min="0" value={e.stale_business_days !== undefined ? (e.stale_business_days ?? '') : (col.stale_business_days ?? '')} onChange={ev => patch(col.id, 'stale_business_days', ev.target.value === '' ? null : Number(ev.target.value))} className="input w-full" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Final column (done)</label>
                  <input type="checkbox" checked={e.is_final !== undefined ? !!e.is_final : !!col.is_final} onChange={ev => patch(col.id, 'is_final', ev.target.checked)} className="mt-2" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Colour</label>
                  <select value={e.colour || col.colour || 'bg-gray-100'} onChange={ev => patch(col.id, 'colour', ev.target.value)} className="input w-full">
                    {COLOURS.map(c => <option key={c.v} value={c.v}>{c.label}</option>)}
                  </select>
                </div>
              </div>

              {dirty && <button onClick={() => save(col.id)} disabled={busy} className="btn btn-primary btn-sm mt-3">Save changes</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}