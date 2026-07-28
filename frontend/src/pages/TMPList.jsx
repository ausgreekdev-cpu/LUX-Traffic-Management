import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

export default function TMPList() {
  const [tmps, setTmps] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = filter ? { status: filter } : {};
    api.tmps.list(params).then(setTmps).finally(() => setLoading(false));
  }, [filter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Traffic Management Plans</h1>
        <Link to="/tmps/new" className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium">+ New TMP</Link>
      </div>
      <div className="flex gap-2">
        {['', 'draft', 'submitted', 'approved', 'rejected', 'completed'].map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1 rounded text-sm ${filter === s ? 'bg-amber-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>{s || 'All'}</button>
        ))}
      </div>
      {loading ? <p className="text-gray-500">Loading...</p> : tmps.length === 0 ? <p className="text-gray-500">No TMPs found</p> : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 dark:bg-gray-700">
              <tr><th className="text-left px-4 py-3">Reference</th><th className="text-left px-4 py-3">Title</th><th className="text-left px-4 py-3">Site</th><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Type</th><th className="text-left px-4 py-3">Created</th></tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {tmps.map(tmp => (
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
        </div>
      )}
    </div>
  );
}
