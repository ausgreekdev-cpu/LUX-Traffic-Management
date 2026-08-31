import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { TMP_BADGES, badgeFor } from '../utils/status';
import { useAppText } from '../context/AppText';
import { useEntitlements } from '../hooks/useEntitlement';

function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function SkeletonCard() {
  return <div className="card p-4 animate-pulse"><div className="h-11 w-11 bg-gray-200 dark:bg-gray-700 rounded-lg mb-3" /><div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" /></div>;
}
function SkeletonList() {
  return <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />)}</div>;
}

export default function Dashboard() {
  const { pageTitle, status, section } = useAppText();
  const { can } = useEntitlements();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [kanban, setKanban] = useState(null);

  const fetchData = useCallback(async (signal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.dashboard(signal ? { signal } : undefined);
      setData(res);
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchData(ctrl.signal);
    // Kanban preview (reuse BoardView data, read-only)
    api.kanban.board('tmp').then(setKanban).catch(()=>{});
    const id = setInterval(() => { if (!document.hidden) fetchData(); }, 60000);
    const onVis = () => { if (!document.hidden) fetchData(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { ctrl.abort(); clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div><h1 className="page-header">{pageTitle('dashboard', 'Dashboard')}</h1><p className="page-sub">{section('dashboard_sub', 'Live overview of TMPs, permits and activity')}</p></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[1,2,3,4].map(i => <SkeletonCard key={i} />)}</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><div className="card p-4"><SkeletonList /></div><div className="card p-4"><SkeletonList /></div></div>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="text-center py-8" role="alert">
        <p className="text-red-500 mb-3">{error}</p>
        <button onClick={() => fetchData()} className="px-4 py-2 bg-lux-500 text-white rounded-lg hover:bg-lux-600">Retry</button>
      </div>
    );
  }

  const { stats, recentTmps, recentActivity, workflowAttention, urgentPermits = [], generated_at } = data || {};

  const cards = [
    { label: 'Total TMPs', value: stats.totalTmps, to: '/tmps', color: 'bg-blue-500', icon: '📄' },
    { label: 'Active TMPs', value: stats.activeTmps, to: '/tmps?status=active', color: 'bg-green-500', icon: '🟢' },
    { label: 'Pending Permits', value: stats.pendingPermits, to: '/permits?status=submitted', color: 'bg-lux-500', icon: '📋' },
    { label: 'Fees Owed', value: `$${Number(stats.totalFeesOwed || 0).toLocaleString()}`, to: '/permits', color: 'bg-amber-500', icon: '💰', gate: 'api_access' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="page-header">{pageTitle('dashboard', 'Dashboard')}</h1>
          <p className="page-sub">{section('dashboard_sub', 'Live overview of TMPs, permits and activity')}</p>
          {generated_at && <p className="text-xs text-gray-400 mt-1">Updated {timeAgo(generated_at)} • <button onClick={() => fetchData()} className="underline">Refresh</button></p>}
        </div>
        <Link to="/tmps/new" className="hidden md:inline-flex px-4 py-2 bg-lux-500 text-white rounded-lg hover:bg-lux-600">+ New TMP</Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map(card => {
          if (card.gate && !can(card.gate)) return null;
          return (
            <Link key={card.label} to={card.to} className="card p-4 hover:shadow-md hover:-translate-y-0.5 transition cursor-pointer" aria-label={`${card.label}: ${card.value}`}>
              <div className={`${card.color} text-white text-lg rounded-lg w-11 h-11 flex items-center justify-center shadow-sm mb-3`}>{card.icon}</div>
              <p className="text-2xl font-bold">{card.value}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">{card.label}</p>
            </Link>
          );
        })}
      </div>

      {/* Urgency lane */}
      {urgentPermits.length > 0 && (
        <div className="card p-4 border-amber-200">
          <h2 className="text-lg font-semibold mb-3">⏰ Expiring Soon</h2>
          <div className="space-y-2">
            {urgentPermits.map(p => {
              const days = Math.ceil((new Date(p.expiry_date) - new Date()) / 86400000);
              const color = days <= 7 ? 'text-red-600 bg-red-50' : days <= 14 ? 'text-amber-700 bg-amber-50' : 'text-green-700 bg-green-50';
              return (
                <Link key={p.id} to={`/permits/${p.id}`} className={`flex justify-between items-center p-2 rounded ${color}`}>
                  <span className="text-sm font-medium">{p.short_name || 'Permit'} • {p.status}</span>
                  <span className="text-xs">{days}d • {new Date(p.expiry_date).toLocaleDateString()}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Workflow attention */}
      <div className="card p-4">
        {workflowAttention.length === 0 ? (
          <div className="text-center py-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700">
            <p className="text-green-700 dark:text-green-400 font-medium">✓ All required stages complete — {stats.activeTmps} active TMPs tracked</p>
            <p className="text-xs text-green-600 dark:text-green-500 mt-1">No blockers. Great work!</p>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-semibold mb-3">⚠️ Needs attention — incomplete required stages</h2>
            <div className="space-y-2">
              {workflowAttention.map(item => (
                <Link key={`${item.type}-${item.id}`} to={item.type === 'tmp' ? `/tmps/${item.id}` : `/permits/${item.id}`}
                  className="block p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/40 transition"
                  aria-label={`Missing: ${item.missing.join(', ')}`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-sm truncate">{item.label}</span>
                    <span className="text-xs text-amber-700 dark:text-amber-400 shrink-0">{item.missing.join(', ')}</span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold">Recent TMPs</h2>
            <Link to="/tmps" className="text-xs text-lux-600 hover:underline">View all →</Link>
          </div>
          {recentTmps.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm mb-3">No TMPs yet</p>
              <Link to="/tmps/new" className="inline-block px-4 py-2 bg-lux-500 text-white rounded-lg text-sm">Create TMP</Link>
            </div>
          ) : (
            <div className="space-y-2">
              {recentTmps.map(tmp => (
                <Link key={tmp.id} to={`/tmps/${tmp.id}`} className="block p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-sm truncate">{tmp.title}</span>
                    <span className={`badge ${badgeFor(TMP_BADGES, tmp.status)}`}>{status(tmp.status)}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 truncate">{tmp.reference} {tmp.site_name ? '• ' + tmp.site_name : ''} • {timeAgo(tmp.created_at)}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="card p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold">Recent Activity</h2>
            <Link to="/analytics" className="text-xs text-lux-600 hover:underline">View all →</Link>
          </div>
          {recentActivity.length === 0 ? <p className="text-gray-500 text-sm">No activity yet</p> : (
            <div className="space-y-2 max-h-[320px] overflow-auto pr-1">
              {recentActivity.map(a => (
                <div key={a.id} className="p-2 text-sm border-l-2 border-lux-500 rounded-r hover:bg-gray-50 dark:hover:bg-gray-700">
                  <span className="font-medium">{a.user_name || 'System'}</span>
                  <span className="text-gray-500 ml-1">{a.action}</span>
                  {a.tmp_title && <span className="text-gray-400 ml-1">• {a.tmp_title}</span>}
                  <p className="text-xs text-gray-400 mt-0.5">{timeAgo(a.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Finance mini */}
      <div className="card p-4">
        <h2 className="text-lg font-semibold mb-3">Finance</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
          <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"><p className="text-xs text-gray-500">Fees Owed</p><p className="font-bold">${Number(stats.totalFeesOwed || 0).toLocaleString()}</p></div>
          <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"><p className="text-xs text-gray-500">Bonds Held</p><p className="font-bold">${Number(stats.totalBondHeld || 0).toLocaleString()}</p></div>
          <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"><p className="text-xs text-gray-500">Active TMPs</p><p className="font-bold">{stats.activeTmps}</p></div>
          <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"><p className="text-xs text-gray-500">Pending Permits</p><p className="font-bold">{stats.pendingPermits}</p></div>
        </div>
      </div>

      {/* Kanban health */}
      {kanban && (
        <div className="card p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold">Board Health</h2>
            <Link to="/kanban" className="text-xs text-lux-600 hover:underline">Open board →</Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(kanban.columns || []).slice(0,4).map(col => (
              <div key={col.id} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-center border-t-4" style={{borderColor: col.colour || '#e5e7eb'}}>
                <p className="text-xs text-gray-500 truncate">{col.name}</p>
                <p className="text-xl font-bold">{col.count ?? (col.cards?.length || 0)}</p>
                {col.wip_limit && <p className="text-xs text-gray-400">WIP {col.wip_limit}</p>}
              </div>
            ))}
          </div>
          {!kanban.columns && <p className="text-xs text-gray-500">Board data unavailable</p>}
        </div>
      )}
    </div>
  );
}
