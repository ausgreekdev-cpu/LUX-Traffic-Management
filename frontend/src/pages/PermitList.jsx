import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

export default function PermitList() {
  const [permits, setPermits] = useState([]);
  const [filter, setFilter] = useState('');
  const [authFilter, setAuthFilter] = useState('');
  const [authorities, setAuthorities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.authorities.list().then(setAuthorities); }, []);

  useEffect(() => {
    const params = {};
    if (filter) params.status = filter;
    if (authFilter) params.authority_id = authFilter;
    api.permits.list(params).then(setPermits).finally(() => setLoading(false));
  }, [filter, authFilter]);

  const statusColor = (s) => {
    const map = { draft: 'bg-gray-100 text-gray-600', submitted: 'bg-blue-100 text-blue-700', under_review: 'bg-purple-100 text-purple-700', approved: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700', expired: 'bg-orange-100 text-orange-700', completed: 'bg-green-50 text-green-600', cancelled: 'bg-gray-100 text-gray-500' };
    return map[s] || 'bg-gray-100 text-gray-600';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Permits</h1>
        <Link to="/permits/new" className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium">+ New Permit</Link>
      </div>
      <div className="flex gap-2 flex-wrap">
        <select value={filter} onChange={e => setFilter(e.target.value)} className="px-3 py-1 border rounded text-sm">
          <option value="">All Statuses</option>
          {['draft', 'submitted', 'under_review', 'approved', 'rejected', 'expired', 'completed', 'cancelled'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <select value={authFilter} onChange={e => setAuthFilter(e.target.value)} className="px-3 py-1 border rounded text-sm">
          <option value="">All Authorities</option>
          {authorities.map(a => <option key={a.id} value={a.id}>{a.short_name || a.name}</option>)}
        </select>
      </div>
      {loading ? <p className="text-gray-500">Loading...</p> : permits.length === 0 ? <p className="text-gray-500">No permits found</p> : (
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
              {permits.map(p => (
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
        </div>
      )}
    </div>
  );
}
