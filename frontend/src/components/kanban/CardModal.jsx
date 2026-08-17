import { useEffect, useState } from 'react';
import api from '../../api';
import { useAppText } from '../../context/AppText';
import { badgeFor, TMP_BADGES, PERMIT_BADGES } from '../../utils/status';
import WorkflowChecklist from '../WorkflowChecklist';

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('') || '?';
}

export default function CardModal({ card, columns, users, lanes, entityType, canAssign, onClose, onChanged, onError }) {
  const { status } = useAppText();
  const [busy, setBusy] = useState(false);
  const [lane, setLane] = useState(card.lane || '');
  const [assignee, setAssignee] = useState(card.assigned_user_id || '');
  const [targetCol, setTargetCol] = useState(card.column_id);
  const [customLane, setCustomLane] = useState('');

  useEffect(() => {
    setLane(card.lane || '');
    setAssignee(card.assigned_user_id || '');
    setTargetCol(card.column_id);
  }, [card.id, card.lane, card.assigned_user_id, card.column_id]);

  const badgeMap = entityType === 'tmp' ? TMP_BADGES : PERMIT_BADGES;
  const laneOptions = ['emergency', '', ...lanes.filter(l => l !== 'emergency')];

  const submit = async (payload) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.kanban.move(entityType, card.entity_id, payload);
      await onChanged();
    } catch (err) {
      onError(err.message);
    }
    setBusy(false);
  };

  const applyLane = () => {
    const nextLane = lane === '__custom__' ? customLane.trim() : lane;
    submit({ lane: nextLane });
  };

  const applyAssignee = () => {
    submit({ assigned_user_id: assignee || null });
  };

  const moveColumn = () => {
    if (!targetCol || targetCol === card.column_id) return;
    submit({ column_id: targetCol });
  };

  const targetColumn = columns.find(c => c.id === targetCol);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-lg truncate">{card.title}</h2>
              <span className="text-xs font-mono text-gray-400">{card.reference}</span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {card.site_name || 'No site'} · <span className={`inline-block px-1.5 py-0.5 rounded ${badgeFor(badgeMap, card.status)}`}>{status(card.status)}</span>
              {card.risk_band && <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${card.risk_band === 'extreme' || card.risk_band === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : card.risk_band === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'}`}>{String(card.risk_band).toUpperCase()}</span>}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {card.start_date && <>Start {card.start_date.slice(0, 10)}</>}
              {card.end_date && <> · End {card.end_date.slice(0, 10)}</>}
              {card.authority_short && <> · {card.authority_short}</>}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 shrink-0 p-1" aria-label="Close">✕</button>
        </div>

        <div className="p-4 space-y-4">
          {card.lane === 'emergency' && (
            <div className="px-3 py-2 rounded-lg emg-soft border border-[color:var(--system-emergency)] text-sm">
              Emergency / Fast-Track lane — this card bypasses Definition of Done and WIP limits.
            </div>
          )}

          {card.stale_days > 0 && targetColumn?.stale_business_days && card.stale_days >= targetColumn.stale_business_days && (
            <div className="px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-300">
              Stale — in “{targetColumn.name}” for {card.stale_days} days (threshold {targetColumn.stale_business_days} business days).
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Swimlane</label>
              <select value={laneOptions.includes(lane) ? lane : '__custom__'} onChange={e => setLane(e.target.value)} className="input w-full mt-1">
                <option value="emergency">Emergency / Fast-Track</option>
                <option value="">General</option>
                {lanes.filter(l => l !== 'emergency').map(l => <option key={l} value={l}>{l}</option>)}
                <option value="__custom__">Other lane…</option>
              </select>
              {lane === '__custom__' && (
                <div className="flex gap-2 mt-2">
                  <input value={customLane} onChange={e => setCustomLane(e.target.value)} placeholder="Lane name" className="input flex-1" />
                  <button onClick={applyLane} disabled={busy || !customLane.trim()} className="btn btn-primary btn-sm">Set</button>
                </div>
              )}
              {lane !== '__custom__' && <button onClick={applyLane} disabled={busy} className="btn btn-sm mt-2">Set lane</button>}
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Assigned to</label>
              <select value={assignee} onChange={e => setAssignee(e.target.value)} className="input w-full mt-1" disabled={!canAssign}>
                <option value="">Unassigned</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
              </select>
              {canAssign && <button onClick={applyAssignee} disabled={busy} className="btn btn-sm mt-2">Assign</button>}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Move to column</label>
            <div className="flex gap-2 mt-1 flex-wrap">
              <select value={targetCol} onChange={e => setTargetCol(e.target.value)} className="input flex-1 min-w-40">
                {columns.map(c => <option key={c.id} value={c.id}>{c.name} {c.wip_limit ? `(${c.count}/${c.wip_limit})` : ''}</option>)}
              </select>
              <button onClick={moveColumn} disabled={busy || !targetCol || targetCol === card.column_id} className="btn btn-primary btn-sm">Move</button>
            </div>
            {targetColumn?.requires_stages && (
              <p className="text-xs text-gray-500 mt-1">This column requires: {targetColumn.requires_stages.join(', ')}</p>
            )}
          </div>

          <WorkflowChecklist entityType={entityType} entityId={card.entity_id} />
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500">
          <span>In {targetColumn?.name || 'column'} for {card.stale_days} day(s)</span>
          <a href={`/${entityType === 'tmp' ? 'tmps' : 'permits'}/${card.entity_id}`} onClick={onClose} className="text-lux-600 dark:text-lux-400 hover:underline font-medium">Open full record →</a>
        </div>
      </div>
    </div>
  );
}

function assigneeInitials(card, users) {
  const u = users.find(x => x.id === card.assigned_user_id);
  return u ? initials(u.name) : null;
}

export { assigneeInitials };