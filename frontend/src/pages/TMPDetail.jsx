import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api';

export default function TMPDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tmp, setTmp] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.tmps.get(id).then(setTmp).finally(() => setLoading(false)); }, [id]);

  const handleDelete = async () => {
    if (confirm('Delete this TMP?')) { await api.tmps.delete(id); navigate('/tmps'); }
  };

  const handleExportPDF = async () => {
    const res = await api.export.tmpPDF(id);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${tmp.reference || 'TMP'}.pdf`; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!tmp) return <p className="text-red-500">TMP not found</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/tmps" className="text-sm text-gray-500 hover:text-amber-600">← Back to TMPs</Link>
          <h1 className="text-2xl font-bold mt-1">{tmp.title}</h1>
          <p className="text-gray-500">{tmp.reference}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportPDF} className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-2 rounded text-sm">Export PDF</button>
          <Link to={`/tmps/${id}/edit`} className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded text-sm">Edit</Link>
          <button onClick={handleDelete} className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded text-sm">Delete</button>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h2 className="font-semibold mb-2">Details</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Status:</span> <span className={`ml-1 px-2 py-0.5 rounded text-xs ${tmp.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{tmp.status}</span></div>
              <div><span className="text-gray-500">Type:</span> <span className="ml-1">{tmp.plan_type}</span></div>
              <div><span className="text-gray-500">Site:</span> <span className="ml-1">{tmp.site_name || '-'}</span></div>
              <div><span className="text-gray-500">Project:</span> <span className="ml-1">{tmp.project_name || '-'}</span></div>
              {tmp.start_date && <div><span className="text-gray-500">Start:</span> <span className="ml-1">{tmp.start_date}</span></div>}
              {tmp.end_date && <div><span className="text-gray-500">End:</span> <span className="ml-1">{tmp.end_date}</span></div>}
            </div>
            {tmp.description && <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">{tmp.description}</p>}
          </div>
          {tmp.permits && tmp.permits.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <h2 className="font-semibold mb-2">Permits ({tmp.permits.length})</h2>
              <div className="space-y-2">
                {tmp.permits.map(p => (
                  <Link key={p.id} to={`/permits/${p.id}`} className="block p-2 bg-gray-50 dark:bg-gray-700 rounded hover:bg-gray-100 text-sm">
                    <span className="font-medium">{p.authority_short || p.authority_name}</span>
                    <span className="ml-2 text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-600">{p.status}</span>
                    <span className="ml-2 text-xs text-gray-500">{p.complexity}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
          {tmp.documents && tmp.documents.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <h2 className="font-semibold mb-2">Documents ({tmp.documents.length})</h2>
              <div className="space-y-1">
                {tmp.documents.map(d => (
                  <div key={d.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm">
                    <span>{d.original_name}</span>
                    <span className="text-xs text-gray-400">{(d.size / 1024).toFixed(1)} KB</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h2 className="font-semibold mb-2">Activity</h2>
            {tmp.activities && tmp.activities.length > 0 ? (
              <div className="space-y-2">
                {tmp.activities.map(a => (
                  <div key={a.id} className="text-sm border-l-2 border-amber-400 pl-2">
                    <span className="font-medium">{a.user_name || 'System'}</span>
                    <span className="text-gray-500 ml-1">{a.action}</span>
                    <p className="text-xs text-gray-400">{a.created_at}</p>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-gray-500">No activity</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
