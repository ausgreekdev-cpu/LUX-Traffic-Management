import { useCallback, useEffect, useState } from 'react';
import api from '../api';
import { useAuth, hasRole } from '../context/Auth';
import { useAppText } from '../context/AppText';
import { useFeature } from '../hooks/useEntitlement';
import { Upsell } from '../components/EntitlementGate';
import BoardView from '../components/kanban/BoardView';
import CardModal from '../components/kanban/CardModal';
import ColumnEditor from '../components/kanban/ColumnEditor';
import BoardAnalytics from '../components/kanban/BoardAnalytics';

export default function Kanban() {
  const { user } = useAuth();
  const { pageTitle } = useAppText();
  const { allowed: canDispatch } = useFeature('dispatch');
  const [entityType, setEntityType] = useState('tmp');
  const [tab, setTab] = useState('board');
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openCard, setOpenCard] = useState(null);
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const canAdmin = hasRole(user, 'manager');

  const load = useCallback(async (type) => {
    setLoading(true);
    try {
      const b = await api.kanban.board(type);
      setBoard(b);
    } catch (err) {
      setToast(err.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(entityType); }, [entityType, load]);

  const notify = (msg) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 5000);
  };

  const handleMove = async (card, payload) => {
    if (payload?.lane === 'dispatch' && !canDispatch) {
      notify('Dispatch lanes require Agency plan. Upgrade at /billing.');
      return;
    }
    try {
      await api.kanban.move(entityType, card.entity_id, payload);
      await load(entityType);
    } catch (err) {
      // Surface 402 upgrade_required cleanly
      const msg = err.message || '';
      if (msg.includes('upgrade_required') || msg.toLowerCase().includes('dispatch')) notify(msg);
      else notify(err.message);
      await load(entityType);
    }
  };

  const filteredCards = board && search.trim()
    ? board.cards.filter(c => (c.title || '').toLowerCase().includes(search.toLowerCase()) || (c.reference || '').toLowerCase().includes(search.toLowerCase()))
    : board?.cards;

  const openCardView = board ? { ...openCard, assignee: openCard?.assigned_user_id } : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="page-header">{pageTitle('kanban', 'Kanban Board')}</h1>
          <p className="page-sub">Drag cards across the workflow. WIP limits, swimlanes and Definition of Done are enforced server-side.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search cards…" className="input w-48" />
          <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
            {['tmp', 'permit'].map(t => (
              <button key={t} onClick={() => setEntityType(t)}
                className={`px-3 py-1.5 text-sm font-medium ${entityType === t ? 'bg-lux-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
                {t === 'tmp' ? 'TMPs' : 'Permits'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {['board', 'analytics', ...(canAdmin ? ['columns'] : [])].map(t => (
          <button key={t} onClick={() => setTab(t)} className={`tab capitalize ${tab === t ? 'tab-active' : 'tab-inactive'}`}>{t}</button>
        ))}
      </div>

      {!canDispatch && board?.lanes?.includes('dispatch') && (
        <Upsell feature="dispatch" />
      )}
      {tab === 'board' && (
        loading ? <p className="text-gray-500">Loading board…</p>
          : !board ? <p className="text-gray-500">No data.</p>
          : (
            <BoardView
              board={{ ...board, cards: filteredCards }}
              entityType={entityType}
              onMove={handleMove}
              onOpen={(card) => setOpenCard(card)}
            />
          )
      )}

      {tab === 'analytics' && <BoardAnalytics entityType={entityType} />}

      {tab === 'columns' && <ColumnEditor entityType={entityType} onError={notify} onChanged={() => load(entityType)} />}

      {openCard && board && (
        <CardModal
          card={openCardView}
          columns={board.columns}
          users={board.users}
          lanes={board.lanes}
          entityType={entityType}
          canAssign={hasRole(user, 'staff')}
          canDeletePhoto={hasRole(user, 'manager')}
          onClose={() => setOpenCard(null)}
          onChanged={async () => { await load(entityType); }}
          onError={notify}
        />
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 max-w-sm bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm rounded-lg shadow-lg px-4 py-3 z-50">
          {toast}
        </div>
      )}
    </div>
  );
}