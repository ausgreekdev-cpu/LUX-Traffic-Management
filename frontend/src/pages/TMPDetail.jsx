import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api';
import WorkflowChecklist from '../components/WorkflowChecklist';
import { useAppText } from '../context/AppText';

const previewable = (name) => /\.(pdf|png|jpe?g|gif|webp)$/i.test(name);

export default function TMPDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { nav, section, status, complexity } = useAppText();
  const [tmp, setTmp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [agentRuns, setAgentRuns] = useState([]);
  const fileRef = useRef();

  const loadTmp = () => Promise.all([
    api.tmps.get(id),
    api.agents.runs({ entity_type: 'tmp', entity_id: id }).then(r => r.data)
  ]).then(([t, runs]) => { setTmp(t); setAgentRuns(runs); });
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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link to="/tmps" className="text-sm text-gray-500 hover:text-lux-600 dark:hover:text-lux-400">← Back to {nav('/tmps', 'TMPs')}</Link>
          <h1 className="page-header mt-1">{tmp.title}</h1>
          <p className="text-gray-500 text-sm">{tmp.reference}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportPDF} className="btn btn-secondary">Export PDF</button>
          <Link to={`/tmps/${id}/edit`} className="btn btn-primary">Edit</Link>
          <button onClick={handleDelete} className="btn btn-danger">Delete</button>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-4">
            <h2 className="font-semibold mb-2">{section('tmp_details', 'Details')}</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Status:</span> <span className={`badge ml-1 ${tmp.status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>{status(tmp.status)}</span></div>
              <div><span className="text-gray-500">Type:</span> <span className="ml-1">{tmp.plan_type}</span></div>
              <div><span className="text-gray-500">Complexity:</span> <span className="badge ml-1 bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">{complexity(tmp.complexity || 'standard')}</span></div>
              <div><span className="text-gray-500">Site:</span> <span className="ml-1">{tmp.site_name || '-'}</span></div>
              <div><span className="text-gray-500">Project:</span> <span className="ml-1">{tmp.project_name || '-'}</span></div>
              {tmp.risk_band && (
                <div><span className="text-gray-500">Risk:</span> <span className={`badge ml-1 ${tmp.risk_band === 'extreme' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : tmp.risk_band === 'high' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' : tmp.risk_band === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'}`}>{tmp.risk_band.toUpperCase()}</span></div>
              )}
              {tmp.risk_score > 0 && (
                <div><span className="text-gray-500">Risk score:</span> <span className="ml-1">C {tmp.risk_consequence} × L {tmp.risk_likelihood} = <b>{tmp.risk_score}</b></span></div>
              )}
              {tmp.start_date && <div><span className="text-gray-500">Start:</span> <span className="ml-1">{tmp.start_date}</span></div>}
              {tmp.end_date && <div><span className="text-gray-500">End:</span> <span className="ml-1">{tmp.end_date}</span></div>}
            </div>
            {tmp.description && <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">{tmp.description}</p>}
            {tmp.risk_mitigations && tmp.risk_mitigations.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(typeof tmp.risk_mitigations === 'string' ? JSON.parse(tmp.risk_mitigations) : tmp.risk_mitigations).map((m, i) => (
                  <span key={i} className="badge bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700">{m}</span>
                ))}
              </div>
            )}
          </div>
          {tmp.permits && tmp.permits.length > 0 && (
            <div className="card p-4">
              <h2 className="font-semibold mb-2">{section('tmp_permits', 'Permits')} ({tmp.permits.length})</h2>
              <div className="space-y-2">
                {tmp.permits.map(p => (
                  <Link key={p.id} to={`/permits/${p.id}`} className="block p-2 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 text-sm transition">
                    <span className="font-medium">{p.authority_short || p.authority_name}</span>
                    <span className={`badge ml-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200`}>{status(p.status)}</span>
                    <span className="ml-2 text-xs text-gray-500">{complexity(p.complexity)}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
          <div className="card p-4">
            <h2 className="font-semibold mb-2">{section('tmp_documents', 'Documents')} ({(tmp.documents||[]).length})</h2>
            <div className="space-y-1 mb-3">
              {(tmp.documents||[]).map((d, i) => (
                <div key={d.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="badge bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 shrink-0">v{(tmp.documents||[]).length - i}</span>
                    <a href={api.documents.download(d.id)} className="text-lux-600 dark:text-lux-400 hover:underline truncate">{d.original_name}</a>
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
          <WorkflowChecklist entityType="tmp" entityId={id} />
        </div>
        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="font-semibold mb-2">{section('tmp_activity', 'Activity')}</h2>
            {tmp.activities && tmp.activities.length > 0 ? (
              <div className="space-y-2">
                {tmp.activities.map(a => (
                  <div key={a.id} className="text-sm border-l-2 border-lux-500 pl-2 rounded-r">
                    <span className="font-medium">{a.user_name || 'System'}</span>
                    <span className="text-gray-500 ml-1">{a.action}</span>
                    <p className="text-xs text-gray-400">{a.created_at}</p>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-gray-500">No activity</p>}
          </div>
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold mb-2">{section('tmp_agents', 'AI agent checks')}</h2>
              <span className="text-xs text-gray-400">{(agentRuns || []).length} runs</span>
            </div>
            {(agentRuns || []).length === 0 ? (
              <p className="text-sm text-gray-500">No agent runs yet. Agents run automatically on create/upload, or from Automation → AI Agents.</p>
            ) : (
              <div className="space-y-3">
                {(agentRuns || []).map(run => {
                  let findings = [];
                  try { findings = run.findings_json ? JSON.parse(run.findings_json) : []; } catch {}
                  return (
                    <div key={run.id} className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`badge ${run.verdict === 'ok' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : run.verdict === 'warn' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>{run.verdict}</span>
                        <span className="text-xs text-gray-500">{run.agent_id} · {run.score != null ? Math.round(run.score) + '/100' : ''}</span>
                      </div>
                      <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{run.summary}</p>
                      {run.applied && <span className="text-xs text-green-600">recommendation applied</span>}
                      {findings.length > 0 && (
                        <details className="mt-1">
                          <summary className="text-xs text-gray-500 cursor-pointer">Findings ({findings.length})</summary>
                          <ul className="mt-1 space-y-1">
                            {findings.map((f, i) => (
                              <li key={i} className={`text-xs ${f.severity === 'fail' ? 'text-red-600' : f.severity === 'warn' ? 'text-yellow-600' : f.severity === 'ok' ? 'text-green-600' : 'text-gray-500'}`}>
                                <b>{f.label}:</b> {f.detail}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      {preview && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
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
