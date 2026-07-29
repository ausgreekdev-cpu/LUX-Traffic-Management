import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

export default function TMPList() {
  const [data, setData] = useState({ data: [], total: 0, page: 1, pages: 1 });
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = { page, limit: 20 };
    if (filter) params.status = filter;
    if (search) params.search = search;
    api.tmps.list(params).then(setData).finally(() => setLoading(false));
  }, [filter, page, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Traffic Management Plans</h1>
        <div className="flex gap-2">
          <button onClick={() => api.export.downloadCSV('/export/tmps-csv', 'tmps.csv')} className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-2 rounded text-sm">CSV</button>
          <Link to="/tmps/new" className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium">+ New TMP</Link>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex gap-2">
          {['', 'draft', 'submitted', 'approved', 'rejected', 'completed'].map(s => (
            <button key={s} onClick={() => { setFilter(s); setPage(1); }} className={`px-3 py-1 rounded text-sm ${filter === s ? 'bg-amber-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>{s || 'All'}</button>
          ))}
        </div>
        <input placeholder="Search..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="border rounded px-3 py-1 text-sm ml-auto w-48" />
      </div>
      {loading ? <p className="text-gray-500">Loading...</p> : data.data.length === 0 ? <p className="text-gray-500">No TMPs found</p> : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 dark:bg-gray-700">
              <tr><th className="text-left px-4 py-3">Reference</th><th className="text-left px-4 py-3">Title</th><th className="text-left px-4 py-3">Site</th><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Type</th><th className="text-left px-4 py-3">Created</th></tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {data.data.map(tmp => (
                <tr key={tmp.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-4 py-3 font-medium">{tmp.reference}</td>
                  <td className="px-4 py-3"><Link to={`/tmps/${tmp.id}`} className="text-amber-600 hover:underline">{tmp.title}</Link></td>
                  <td className="px-4 py-3 text-gray-500">{tmp.site_name || '-'}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded ${tmp.status === 'approved' ? 'bg-green-100 text-green-700' : tmp.status === 'draft' ? 'bg-gray-100 text-gray-600' : tmp.status === 'submitted' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{tmp.status}</span></td>
                  <td className="px-4 py-3 text-gray-500">{tmp.plan_type}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{tmp.created_at?.slice(0, 10)}</td>
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
