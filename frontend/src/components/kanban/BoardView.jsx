import { useState } from 'react';
import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, useDraggable, useDroppable } from '@dnd-kit/core';
import { badgeFor, TMP_BADGES, PERMIT_BADGES } from '../../utils/status';
import { useAppText } from '../../context/AppText';
import { assigneeInitials } from './CardModal';

const CELL_SEP = '\u0000';

function laneLabel(lane) {
  if (lane === 'emergency') return 'Emergency / Fast-Track';
  if (!lane) return 'General';
  return lane;
}

function laneBadge(lane) {
  if (lane === 'emergency') return 'emg-soft';
  if (!lane) return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
  return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
}

function wipClass(column) {
  if (!column.wip_limit) return '';
  const at = column.count >= column.wip_limit;
  if (at && column.enforce_wip) return 'wip-ring-alert';
  if (at) return 'wip-ring-warn';
  return '';
}

function DraggableCard({ card, entityType, statusFn, users, onOpen }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id });
  const badgeMap = entityType === 'tmp' ? TMP_BADGES : PERMIT_BADGES;
  const assignee = assigneeInitials(card, users);
  const pct = card.checklist_total ? Math.round((card.checklist_done / card.checklist_total) * 100) : 0;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(card)}
      className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3 cursor-grab active:cursor-grabbing select-none touch-none hover:shadow-md transition-all ${isDragging ? 'opacity-40 rotate-2 scale-95' : ''} ${card.lane === 'emergency' ? 'emg-lane-border' : ''}`}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-tight line-clamp-2">{card.title}</p>
        {card.risk_band && (
          <span className={`shrink-0 text-[9px] font-bold px-1 py-0.5 rounded ${card.risk_band === 'extreme' || card.risk_band === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : card.risk_band === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'}`}>
            {String(card.risk_band).toUpperCase()}
          </span>
        )}
      </div>
      <p className="text-[10px] font-mono text-gray-400 mt-0.5">{card.reference}</p>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 truncate">{card.site_name || card.authority_short || 'No site'}</p>
      {card.end_date && <p className="text-[10px] text-gray-400 mt-0.5">{card.end_date.slice(0, 10)}</p>}
      <div className="flex items-center gap-2 mt-2">
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${badgeFor(badgeMap, card.status)}`}>{statusFn(card.status)}</span>
        {card.checklist_total > 0 && (
          <span className={`text-[10px] font-medium ${pct === 100 ? 'text-green-600' : 'text-amber-600'}`}>{card.checklist_done}/{card.checklist_total}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {card.lane === 'emergency' && <span className="text-red-500 text-xs">⚡</span>}
          {assignee ? (
            <span title="Assigned" className="h-6 w-6 rounded-full bg-lux-500 text-gray-900 flex items-center justify-center text-[10px] font-bold">{assignee}</span>
          ) : (
            <span title="Unassigned" className="h-6 w-6 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-400 flex items-center justify-center text-[10px]">–</span>
          )}
        </div>
      </div>
    </div>
  );
}

function DroppableCell({ id, cards, column, entityType, statusFn, users, onOpen }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const overLimit = column.wip_limit && cards.length >= column.wip_limit;
  return (
    <div
      ref={setNodeRef}
      className={`min-h-40 p-2 rounded-lg transition-colors border ${isOver ? 'bg-lux-50 dark:bg-lux-900/20 border-lux-400' : 'bg-gray-100 dark:bg-gray-700/40 border-transparent'}`}
    >
      <div className="flex items-center justify-between px-1 mb-1">
        <span className={`text-[10px] font-semibold ${overLimit && column.enforce_wip ? 'text-[color:var(--system-emergency)]' : overLimit ? 'text-[color:var(--system-wip-warn)]' : 'text-gray-400'}`}>
          {cards.length}{column.wip_limit ? ` / ${column.wip_limit}` : ''}
        </span>
        {overLimit && <span className="text-[9px] font-bold text-[color:var(--system-emergency)]">WIP</span>}
      </div>
      <div className="space-y-2">
        {cards.map(card => (
          <DraggableCard key={card.id} card={card} entityType={entityType} statusFn={statusFn} users={users} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

export default function BoardView({ board, entityType, onMove, onOpen, statusFn }) {
  const { status } = useAppText();
  const [activeId, setActiveId] = useState(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } })
  );

  const statusFor = statusFn || status;
  const columns = board.columns;
  const lanes = board.lanes && board.lanes.length ? board.lanes : [''];
  const gridCols = `170px repeat(${columns.length}, minmax(250px, 1fr))`;

  const byCell = {};
  for (const card of board.cards) {
    const key = card.lane + CELL_SEP + card.column_id;
    (byCell[key] ||= []).push(card);
  }
  for (const key of Object.keys(byCell)) byCell[key].sort((a, b) => a.sort_order - b.sort_order);

  const handleDragStart = (event) => setActiveId(event.active.id);
  const handleDragCancel = () => setActiveId(null);
  const handleDragEnd = async (event) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || !active) return;
    const card = board.cards.find(c => c.id === active.id);
    if (!card) return;
    const [lane, columnId] = String(over.id).split(CELL_SEP);
    if (!columnId) return;
    if (lane === card.lane && columnId === card.column_id) return;
    await onMove(card, { column_id: columnId, lane });
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
      <div className="overflow-x-auto pb-2">
        <div className="min-w-max">
          <div className="grid gap-2 mb-1" style={{ gridTemplateColumns: gridCols }}>
            <div className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-900 px-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Lane</div>
            {columns.map(c => (
              <div key={c.id} className={`px-3 py-2 rounded-t-lg ${c.colour || 'bg-gray-100 dark:bg-gray-700'} border border-b-0 ${wipClass(c)}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold truncate">{c.name}</p>
                  <span className={`text-[10px] font-semibold shrink-0 ${c.wip_limit && c.count >= c.wip_limit ? (c.enforce_wip ? 'text-[color:var(--system-emergency)]' : 'text-[color:var(--system-wip-warn)]') : 'text-gray-500'}`}>
                    {c.count}{c.wip_limit ? `/${c.wip_limit}` : ''}
                  </span>
                </div>
                {c.description && <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate mt-0.5">{c.description}</p>}
              </div>
            ))}
          </div>

          {lanes.map(lane => (
            <div key={lane || 'general'} className="grid gap-2 mb-3" style={{ gridTemplateColumns: gridCols }}>
              <div className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-900 px-2 py-3 rounded-lg">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${laneBadge(lane)}`}>{laneLabel(lane)}</span>
              </div>
              {columns.map(column => {
                const key = lane + CELL_SEP + column.id;
                return (
                  <DroppableCell
                    key={key}
                    id={key}
                    cards={byCell[key] || []}
                    column={column}
                    entityType={entityType}
                    statusFn={statusFor}
                    users={board.users}
                    onOpen={onOpen}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {activeId && <div className="fixed bottom-4 right-4 text-xs text-gray-500 bg-white dark:bg-gray-800 shadow rounded-lg px-3 py-2 border">Drop to move</div>}
    </DndContext>
  );
}