import React, { useState, useEffect } from 'react';
import api from '../api';

export default function Analytics() {
  const [tab, setTab] = useState('overview');
  const [period, setPeriod] = useState(90);
  const [approval, setApproval] = useState(null);
  const [financial, setFinancial] = useState(null);
  const [rejection, setRejection] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async (tab) => {
    setLoading(true);
    const params = { period_days: period };
    const promises = [];
    if (tab === 'overview' || tab === 'approval') promises.push(api.analytics.approvalTimes(params).then(setApproval));
    if (tab === 'overview' || tab === 'financial') promises.push(api.analytics.financialSummary(params).then(setFinancial));
    if (tab === 'overview' || tab === 'rejection') promises.push(api.analytics.rejectionAnalysis({ period_days: 180 }).then(setRejection));
    await Promise.all(promises);
    setLoading(false);
  };

  useEffect(() => { load(tab); }, [tab, period]);

  const tabs = ['overview', 'approval', 'financial', 'rejection'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <select value={period} onChange={e => setPeriod(parseInt(e.target.value))} className="px-3 py-1 border rounded text-sm">
          <option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={180}>Last 180 days</option><option value={365}>Last year</option>
        </select>
      </div>
      <div className="flex gap-2">
        {tabs.map(t => <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded text-sm capitalize ${tab === t ? 'bg-amber-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>{t}</button>)}
      </div>

      {loading ? <p className="text-gray-500">Loading...</p> : (
        <div className="space-y-6">
          {(tab === 'overview' || tab === 'approval') && approval && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <h2 className="font-semibold mb-3">Approval Times by Authority</h2>
              {approval.metrics?.length > 0 ? (
                <table className="w-full text-sm">
                  <thead><tr className="border-b"><th className="text-left py-2">Authority</th><th className="text-left py-2">Type</th><th className="text-left py-2">Avg Days</th><th className="text-left py-2">Min</th><th className="text-left py-2">Max</th><th className="text-left py-2">Sample</th></tr></thead>
                  <tbody>{approval.metrics.map(m => (
                    <tr key={m.authority_id} className="border-b"><td className="py-2 font-medium">{m.authority_name}</td><td className="text-gray-500">{m.authority_type?.toUpperCase()}</td><td className={m.avg_approval_days < 14 ? 'text-green-600' : m.avg_approval_days < 20 ? 'text-amber-600' : 'text-red-600'}>{m.avg_approval_days}d</td><td>{m.min_approval_days}d</td><td>{m.max_approval_days}d</td><td>{m.sample_count}</td></tr>
                  ))}</tbody>
                </table>
              ) : <p className="text-gray-500 text-sm">No data yet</p>}
            </div>
          )}

          {(tab === 'overview' || tab === 'financial') && financial && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <h2 className="font-semibold mb-3">Financial Summary</h2>
              <div className="grid grid-cols-4 gap-3 text-center">
                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded"><div className="text-xl font-bold text-green-500">${financial.fees?.total_paid?.toFixed(0) || 0}</div><div className="text-xs text-gray-500">Paid</div></div>
                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded"><div className="text-xl font-bold text-amber-500">${financial.fees?.total_pending?.toFixed(0) || 0}</div><div className="text-xs text-gray-500">Pending</div></div>
                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded"><div className="text-xl font-bold text-blue-500">${financial.time?.billable_cost?.toFixed(0) || 0}</div><div className="text-xs text-gray-500">Billable Labor</div></div>
                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded"><div className="text-xl font-bold text-purple-500">${financial.fees?.bonds_held?.toFixed(0) || 0}</div><div className="text-xs text-gray-500">Bonds Held</div></div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                <div>Billable Hours: <strong>{financial.time?.billable_hours?.toFixed(1) || 0}h</strong></div>
                <div>Non-Billable: <strong>{financial.time?.non_billable_hours?.toFixed(1) || 0}h</strong></div>
                <div>Application Fees: <strong>${financial.fees?.application_fees?.toFixed(0) || 0}</strong></div>
              </div>
            </div>
          )}

          {(tab === 'overview' || tab === 'rejection') && rejection && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <h2 className="font-semibold mb-3">Rejection Analysis ({rejection.total_rejections} total)</h2>
              {rejection.rejection_reasons?.length > 0 ? (
                <div className="space-y-2">{rejection.rejection_reasons.map((r, i) => (
                  <div key={i} className="p-2 bg-red-50 dark:bg-red-900/20 rounded text-sm">
                    <span className="font-medium">{r.reason}</span>
                    <span className="ml-2 text-gray-500">({r.count}x)</span>
                    <span className="ml-2 text-xs text-gray-400">Authorities: {r.authorities.join(', ')}</span>
                  </div>
                ))}</div>
              ) : <p className="text-gray-500 text-sm">No rejections in this period</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
