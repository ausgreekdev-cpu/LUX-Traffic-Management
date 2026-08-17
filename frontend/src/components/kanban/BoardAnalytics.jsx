import { useEffect, useState } from 'react';
import api from '../../api';
import CfdChart from './CfdChart';

function Stat({ label, value, sub }) {
  return (
    <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
      <div className="text-xl font-bold text-lux-600 dark:text-lux-400">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
      {sub && <div className="text-[10px] text-gray-400">{sub}</div>}
    </div>
  );
}

export default function BoardAnalytics({ entityType }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    api.kanban.analytics(entityType, days)
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [entityType, days]);

  if (loading) return <p className="text-gray-500">Loading analytics…</p>;
  if (error) return <p className="text-red-500 text-sm">{error}</p>;
  if (!data) return null;

  const lt = data.lead_time;
  const ct = data.cycle_time;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-semibold">Board flow analytics — {entityType === 'tmp' ? 'Traffic Management Plans' : 'Permits'}</h2>
        <select value={days} onChange={e => setDays(parseInt(e.target.value))} className="input">
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Avg lead time" value={`${lt.avg_days}d`} sub={`${lt.sample_count} completed`} />
        <Stat label="Median lead time" value={`${lt.median_days}d`} sub="created → done" />
        <Stat label="Avg cycle time" value={`${ct.avg_days}d`} sub={`${ct.sample_count} sampled`} />
        <Stat label="Median cycle time" value={`${ct.median_days}d`} sub="first col → done" />
      </div>

      <div className="card p-4">
        <h3 className="font-semibold mb-3">Cumulative Flow Diagram</h3>
        <CfdChart cfd={data.cfd} columns={data.columns} />
        <p className="text-xs text-gray-500 mt-2">Cards in each column per day. A stable, parallel-looking chart means smooth flow.</p>
      </div>

      <div className="card p-4">
        <h3 className="font-semibold mb-3">Time in column (avg days)</h3>
        {data.time_in_column.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 dark:border-gray-700">
                <tr><th className="table-th">Column</th><th className="table-th">Avg days</th><th className="table-th">Median</th><th className="table-th">Samples</th></tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {data.time_in_column.map(t => (
                  <tr key={t.column_id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="table-td font-medium">{t.column_name}</td>
                    <td className="table-td">{t.avg_days}d</td>
                    <td className="table-td">{t.median_days}d</td>
                    <td className="table-td">{t.sample_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-gray-500">No history yet.</p>}
      </div>
    </div>
  );
}