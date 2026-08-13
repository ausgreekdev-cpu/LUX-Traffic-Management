import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../api';
import { useAppText } from '../context/AppText';

const REVIEW_BADGES = {
  new: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  reviewed: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  applied: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  dismissed: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
};
const STATUS_BADGES = {
  approved: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  requested_information: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  under_review: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  received: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
};
export default function Correspondence() {
  const { pageTitle, column, status } = useAppText();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(params.get('review_status') || '');
  const [saved, setSaved] = useState('');
  const [selected, setSelected] = useState(null);

  const load = () => api.correspondence.list(filter ? { review_status: filter } : {}).then(r => setRows(r.data)).catch(() => setRows([])).finally(() => setLoading(false));

  useEffect(() => { setLoading(true); load(); /* eslint-disable-next-line */ }, [filter]);

  const handleReview = async (row, status) => {
    try {
      const result = await api.correspondence.review(row.id, status);
      setSaved(result.applied ? `Applied: permit ${result.applied.status}` : status === 'applied' ? 'Applied (no status to change)' : 'Saved');
      setTimeout(() => setSaved(''), 3000);
      await load();
      if (selected?.id === row.id) setSelected(result);
    } catch (err) { alert(err.message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-header">{pageTitle('correspondence', 'Correspondence')}</h1>
          <p className="page-sub">Inbound emails and webhook payloads matched to TMPs. Review extracted outcomes and apply them to permits.</p>
        </div>
        <div className="flex gap-2">
          {[['', 'All'], ['new', 'New'], ['reviewed', 'Reviewed'], ['applied', 'Applied'], ['dismissed', 'Dismissed']].map(([v, label]) => (
            <button key={v} onClick={() => { setFilter(v); setParams(v ? { review_status: v } : {}); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === v ? 'bg-lux-500 text-white' : 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {saved && <p className="text-sm text-green-600 dark:text-green-400">{saved}</p>}

      {loading && rows.length === 0 ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="card empty-state p-12">
          <span className="text-3xl mb-2">📨</span>
          <p className="text-sm text-gray-500">No correspondence yet.</p>
          <p className="text-xs text-gray-400 mt-1">Point your email/webhook provider at the inbound endpoint in Settings → Webhooks.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/60">
              <tr>
                <th className="table-th">{column('correspondence', 'received', 'Received')}</th>
                <th className="table-th">{column('correspondence', 'from', 'From')}</th>
                <th className="table-th">{column('correspondence', 'subject', 'Subject')}</th>
                <th className="table-th">{column('correspondence', 'tmp', 'TMP')}</th>
                <th className="table-th">{column('correspondence', 'extracted', 'Extracted')}</th>
                <th className="table-th">{column('correspondence', 'review', 'Review')}</th>
                <th className="table-th"></th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="table-td text-xs text-gray-500 whitespace-nowrap">{r.created_at?.slice(0, 16)}</td>
                  <td className="table-td text-xs max-w-[160px] truncate">{r.sender || '—'}</td>
                  <td className="table-td text-xs max-w-[220px]">
                    <p className="truncate font-medium">{r.subject || '—'}</p>
                    {r.matched_tmp_id && (
                      <Link to={`/tmps/${r.matched_tmp_id}`} className="text-amber-600 hover:underline text-xs">{r.tmp_reference}</Link>
                    )}
                  </td>
                  <td className="table-td text-xs">{r.tmp_reference || '—'}</td>
                  <td className="table-td">
                    {r.extracted_status ? (
                      <span className={`badge ${STATUS_BADGES[r.extracted_status] || 'bg-gray-100 text-gray-600'}`}>{status(r.extracted_status)}</span>
                    ) : <span className="text-xs text-gray-400">—</span>}
                    {r.extracted_reason && <p className="text-xs text-gray-500 mt-0.5 max-w-[200px] truncate">{r.extracted_reason}</p>}
                  </td>
                  <td className="table-td">
                    <span className={`badge ${REVIEW_BADGES[r.review_status] || 'bg-gray-100 text-gray-600'}`}>{r.review_status}</span>
                  </td>
                  <td className="table-td text-right">
                    <button onClick={() => setSelected(r)} className="text-amber-600 hover:underline text-xs">View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setSelected(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-xl max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b dark:border-gray-700">
              <p className="text-sm font-medium truncate">{selected.subject || 'Correspondence'}</p>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`badge ${REVIEW_BADGES[selected.review_status] || 'bg-gray-100 text-gray-600'}`}>{selected.review_status}</span>
                <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 px-1">✕</button>
              </div>
            </div>
            <div className="px-4 py-3 border-b dark:border-gray-700 text-xs text-gray-500 space-y-1">
              <p>From: {selected.sender || '—'} · {selected.provider}{selected.created_at ? ` · ${selected.created_at.slice(0, 16)}` : ''}</p>
              {selected.tmp_reference && <p>Matched: <Link to={`/tmps/${selected.matched_tmp_id}`} className="text-amber-600 hover:underline">{selected.tmp_reference}</Link>{selected.matched_permit_id ? ' · has permit' : ' · no permit'}</p>}
              {selected.extracted_status && <p>Extracted: <b>{status(selected.extracted_status)}</b>{selected.extracted_reason ? ` — ${selected.extracted_reason}` : ''}</p>}
            </div>
            <div className="px-4 py-3 overflow-y-auto text-sm whitespace-pre-wrap flex-1 min-h-0">{selected.raw_text || 'No body captured.'}</div>
            <div className="flex items-center gap-2 px-4 py-3 border-t dark:border-gray-700">
              {selected.review_status !== 'applied' && (
                <button onClick={() => handleReview(selected, 'applied')} className="btn btn-primary btn-sm">Apply to permit</button>
              )}
              {selected.review_status !== 'dismissed' && (
                <button onClick={() => handleReview(selected, 'dismissed')} className="btn btn-ghost btn-sm">Dismiss</button>
              )}
              {selected.review_status === 'new' && (
                <button onClick={() => handleReview(selected, 'reviewed')} className="btn btn-ghost btn-sm">Mark reviewed</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
