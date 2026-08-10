import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { TMP_BADGES, badgeFor } from '../utils/status';
import { useAppText } from '../context/AppText';

export default function Dashboard() {
  const { pageTitle, status } = useAppText();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.dashboard().then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-8 text-gray-500">Loading...</div>;
  if (!data) return <div className="text-center py-8 text-red-500">Failed to load dashboard</div>;

  const { stats, recentTmps, recentActivity, workflowAttention } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-header">{pageTitle('dashboard', 'Dashboard')}</h1>
        <p className="page-sub">Live overview of TMPs, permits and activity</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total TMPs', value: stats.totalTmps, color: 'bg-blue-500' },
          { label: 'Active TMPs', value: stats.activeTmps, color: 'bg-green-500' },
          { label: 'Clients', value: stats.totalClients, color: 'bg-purple-500' },
          { label: 'Pending Permits', value: stats.pendingPermits, color: 'bg-lux-500' }
        ].map(card => (
          <div key={card.label} className="card p-4">
            <div className={`${card.color} text-white text-xl font-bold rounded-lg w-11 h-11 flex items-center justify-center shadow-sm mb-3`}>{card.value}</div>
            <p className="text-sm text-gray-600 dark:text-gray-400">{card.label}</p>
          </div>
        ))}
      </div>
      {workflowAttention.length > 0 && (
        <div className="card p-4">
          <h2 className="text-lg font-semibold mb-3">⚠️ Needs attention — incomplete required stages</h2>
          <div className="space-y-2">
            {workflowAttention.map(item => (
              <Link key={`${item.type}-${item.id}`} to={item.type === 'tmp' ? `/tmps/${item.id}` : `/permits/${item.id}`}
                className="block p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/40 transition">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-sm truncate">{item.label}</span>
                  <span className="text-xs text-amber-700 dark:text-amber-400 shrink-0">{item.missing.join(', ')}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-4">
          <h2 className="text-lg font-semibold mb-3">Recent TMPs</h2>
          {recentTmps.length === 0 ? <p className="text-gray-500 text-sm">No TMPs yet</p> : (
            <div className="space-y-2">
              {recentTmps.map(tmp => (
                <Link key={tmp.id} to={`/tmps/${tmp.id}`} className="block p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-sm">{tmp.title}</span>
                    <span className={`badge ${badgeFor(TMP_BADGES, tmp.status)}`}>{status(tmp.status)}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{tmp.reference} {tmp.site_name ? '• ' + tmp.site_name : ''}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="card p-4">
          <h2 className="text-lg font-semibold mb-3">Recent Activity</h2>
          {recentActivity.length === 0 ? <p className="text-gray-500 text-sm">No activity yet</p> : (
            <div className="space-y-2">
              {recentActivity.map(a => (
                <div key={a.id} className="p-2 text-sm border-l-2 border-lux-500 rounded-r">
                  <span className="font-medium">{a.user_name || 'System'}</span>
                  <span className="text-gray-500 ml-1">{a.action}</span>
                  {a.tmp_title && <span className="text-gray-400 ml-1">• {a.tmp_title}</span>}
                  <p className="text-xs text-gray-400 mt-0.5">{a.created_at}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
