import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import { cacheGet, cacheSet } from '../../lib/fieldStore';

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';
}

export default function FieldBoard() {
  const [entityType, setEntityType] = useState('tmp');
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const b = await api.kanban.board(entityType);
        if (!cancelled) {
          setBoard(b);
          setError('');
          cacheSet(`board:${entityType}`, b).catch(() => {});
        }
      } catch (err) {
        const cached = await cacheGet(`board:${entityType}`);
        if (!cancelled) {
          if (cached) {
            setBoard(cached);
            setError('Offline — showing cached board.');
          } else {
            setError(err.message);
          }
        }
      }
      if (!cancelled) setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [entityType]);

  const assigneeName = (id) => {
    if (!id || !board) return null;
    const u = board.users.find((x) => x.id === id);
    return u ? u.name : null;
  };

  const laneGroups = board ? ['emergency', '', ...(board.lanes || []).filter((l) => l !== 'emergency')] : [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-lg">Board</h1>
        <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
          {['tmp', 'permit'].map((t) => (
            <button key={t} onClick={() => setEntityType(t)}
              className={`px-3 py-1.5 text-xs font-medium ${entityType === t ? 'bg-lux-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
              {t === 'tmp' ? 'Plans' : 'Permits'}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-amber-600 dark:text-amber-400">{error}</p>}
      {loading && <p className="text-sm text-gray-500 py-8 text-center">Loading…</p>}
      {!loading && !board && <p className="text-sm text-gray-500 py-8 text-center">No board data.</p>}

      {board && (
        <div className="space-y-4">
          {laneGroups.map((lane) => {
            const laneName = lane === 'emergency' ? 'Emergency' : lane === '' ? 'General' : lane;
            const columns = board.columns
              .map((c) => ({ ...c, cards: board.cards.filter((card) => card.lane === lane && card.column_id === c.id) }))
              .filter((c) => c.cards.length > 0 || c.wip_limit != null);
            if (lane !== 'emergency' && columns.every((c) => c.cards.length === 0)) return null;
            return (
              <section key={lane || 'general'} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                  {lane === 'emergency' ? '🚨 ' : ''}{laneName}
                </h2>
                <div className="space-y-2">
                  {columns.map((col) => (
                    <div key={col.id}>
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                        <span className="font-medium">{col.name}</span>
                        <span>{col.cards.length}{col.wip_limit ? `/${col.wip_limit}` : ''}</span>
                      </div>
                      <div className="space-y-1.5">
                        {col.cards.length === 0 && <p className="text-xs text-gray-400 italic">—</p>}
                        {col.cards.map((card) => {
                          const href = entityType === 'tmp' ? `/field/tmps/${card.entity_id}` : `/field/permits/${card.entity_id}`;
                          const assignee = assigneeName(card.assigned_user_id);
                          return (
                            <Link key={card.id} to={href}
                              className="block p-2.5 bg-gray-50 dark:bg-gray-700 rounded-lg border-l-4 border-lux-500 shadow-sm active:scale-[0.99] transition">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{card.title}</p>
                                  <p className="text-[10px] font-mono text-gray-500 truncate">{card.reference}</p>
                                </div>
                                {card.stale_days > 0 && (
                                  <span className={`badge shrink-0 ${card.stale_days >= 5 ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}`}>
                                    {card.stale_days}d
                                  </span>
                                )}
                              </div>
                              {(card.checklist_total > 0 || assignee) && (
                                <div className="mt-1.5 flex items-center gap-2">
                                  {card.checklist_total > 0 && (
                                    <span className="text-[10px] text-gray-500">✓ {card.checklist_done}/{card.checklist_total}</span>
                                  )}
                                  {assignee && (
                                    <span className="flex items-center gap-1 text-[10px] text-gray-500">
                                      <span className="h-4 w-4 rounded-full bg-lux-500 text-white flex items-center justify-center text-[8px] font-bold">{initials(assignee)}</span>
                                      {assignee}
                                    </span>
                                  )}
                                </div>
                              )}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}