import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

export default function PermitList() {
  const [data, setData] = useState({ data: [], total: 0, page: 1, pages: 1 });
  const [filter, setFilter] = useState('');
  const [authFilter, setAuthFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [authorities, setAuthorities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.authorities.list().then(setAuthorities); }, []);

  useEffect(() => {
    setLoading(true);
    const params = { page, limit: 20 };
    if (filter) params.status = filter;
    if (authFilter) params.authority_id = authFilter;
    if (search) params.search = search;
    api.permits.list(params).then(setData).finally(() => setLoading(false));
  }, [filter, authFilter, page, search]);

  const statusColor = (s) => {
    const map = { draft: 'bg-gray-100 text-gray-600', submitted: 'bg-blue-100 text-blue-700', under_review: 'bg-purple-100 text-purple-700', approved: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700', expired: 'bg-orange-100 text-orange-700', completed: 'bg-green-50 text-green-600', cancelled: 'bg-gray-100 text-gray-500' };
    return map[s] || 'bg-gray-100 text-gray-600';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Permits</h1>
        <div className="flex gap-2">
          <button onClick={() => api.export.downloadCSV('/export/permits-csv', 'permits.csv')} className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-2 rounded text-sm">CSV</button>
          <Link to="/permits/new" className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium">+ New Permit</Link>
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        <select value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }} className="px-3 py-1 border rounded text-sm">
          <option value="">All Statuses</option>
          {['draft', 'submitted', 'under_review', 'approved', 'rejected', 'expired', 'completed', 'cancelled'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <select value={authFilter} onChange={e => { setAuthFilter(e.target.value); setPage(1); }} className="px-3 py-1 border rounded text-sm">
          <option value="">All Authorities</option>
          {authorities.map(a => <option key={a.id} value={a.id}>{a.short_name || a.name}</option>)}
        </select>
        <input placeholder="Search..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="border rounded px-3 py-1 text-sm ml-auto w-48" />
      </div>
      {loading ? <p className="text-gray-500">Loading...</p> : data.data.length === 0 ? <p className="text-gray-500">No permits found</p> : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 dark:bg-gray-700">
              <tr>
                <th className="text-left px-4 py-3">TMP</th>
                <th className="text-left px-4 py-3">Authority</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Complexity</th>
                <th className="text-left px-4 py-3">Submitted</th>
                <th className="text-left px-4 py-3">30m Signal</th>
                <th className="text-left px-4 py-3">MRWA</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {data.data.map(p => (
                <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-4 py-3"><Link to={`/permits/${p.id}`} className="text-amber-600 hover:underline font-medium">{p.tmp_reference || '-'}</Link></td>
                  <td className="px-4 py-3"><span className="font-medium">{p.authority_short}</span> <span className="text-xs text-gray-400">({p.authority_type?.toUpperCase()})</span></td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded ${statusColor(p.status)}`}>{p.status?.replace('_', ' ')}</span></td>
                  <td className="px-4 py-3 text-gray-500">{p.complexity}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{p.submission_date || '-'}</td>
                  <td className="px-4 py-3">{p.is_within_30m_signals ? <span className="text-red-500 text-xs font-bold">YES</span> : <span className="text-gray-300">-</span>}</td>
                  <td className="px-4 py-3">{p.requires_mrwa ? <span className="text-amber-500 text-xs font-bold">YES</span> : <span className="text-gray-300">-</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-gray-500">
            <span>{data.total} total</span>
            <div className="flex gap-1">
              <button disabled={data.page <= 1} onClick={() => setPage(p => p - 1)} className="px-2 py-1 rounded bg-gray-100 disabled:opacity-30">Prev</button>
              <span className="px-2 py-1">Page {data.page} of {data.pages}</span>
              <button disabled={data.page >= data.pages} onClick={() => setPage(p => p + 1)} className="px-2 py-1 rounded bg-gray-100 disabled:opacity-30">Next</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
