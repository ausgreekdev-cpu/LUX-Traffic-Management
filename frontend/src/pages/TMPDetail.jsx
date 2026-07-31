import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api';

const previewable = (name) => /\.(pdf|png|jpe?g|gif|webp)$/i.test(name);

export default function TMPDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tmp, setTmp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const fileRef = useRef();

  const loadTmp = () => api.tmps.get(id).then(setTmp);
  useEffect(() => { loadTmp().finally(() => setLoading(false)); }, [id]);

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

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      await api.documents.upload(id, file);
      await loadTmp();
    } catch (err) { alert(err.message); }
    setUploading(false);
    fileRef.current.value = '';
  };

  const handleDeleteDoc = async (docId) => {
    if (!confirm('Delete this document?')) return;
    try {
      await api.documents.delete(docId);
      await loadTmp();
    } catch (err) { alert(err.message); }
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
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h2 className="font-semibold mb-2">Documents ({(tmp.documents||[]).length})</h2>
            <div className="space-y-1 mb-3">
              {(tmp.documents||[]).map((d, i) => (
                <div key={d.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 shrink-0">v{(tmp.documents||[]).length - i}</span>
                    <a href={api.documents.download(d.id)} className="text-amber-600 hover:underline truncate">{d.original_name}</a>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-400">{(d.size / 1024).toFixed(1)} KB</span>
                    <span className="text-xs text-gray-400">{d.created_at?.slice(0, 10)}</span>
                    {previewable(d.original_name) && (
                      <button onClick={() => setPreview(d)} className="text-blue-600 hover:text-blue-800 text-xs">Preview</button>
                    )}
                    <button onClick={() => handleDeleteDoc(d.id)} className="text-red-500 hover:text-red-700 text-xs">Delete</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" onChange={handleUpload} className="text-sm" disabled={uploading} />
              {uploading && <span className="text-xs text-gray-500">Uploading...</span>}
            </div>
          </div>
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
      {preview && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2 border-b dark:border-gray-700">
              <p className="text-sm font-medium truncate">{preview.original_name}</p>
              <button onClick={() => setPreview(null)} className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 px-2">✕</button>
            </div>
            <iframe src={api.documents.preview(preview.id)} title={preview.original_name} className="w-full flex-1 min-h-0" style={{ height: '75vh' }} />
          </div>
        </div>
      )}
    </div>
  );
}
