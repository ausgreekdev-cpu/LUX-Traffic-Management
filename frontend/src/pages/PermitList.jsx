import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { PERMIT_BADGES, badgeFor } from '../utils/status';
import { useAppText } from '../context/AppText';

const statuses = ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'expired', 'completed', 'cancelled'];

export default function PermitList() {
  const { pageTitle, column, status, complexity } = useAppText();
  const [data, setData] = useState({ data: [], total: 0, page: 1, pages: 1 });
  const [filter, setFilter] = useState('');
  const [authFilter, setAuthFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [authorities, setAuthorities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [bulkStatus, setBulkStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.authorities.list().then(setAuthorities); }, []);

  useEffect(() => {
    setLoading(true);
    setSelected(new Set());
    const params = { page, limit: 20 };
    if (filter) params.status = filter;
    if (authFilter) params.authority_id = authFilter;
    if (search) params.search = search;
    api.permits.list(params).then(setData).finally(() => setLoading(false));
  }, [filter, authFilter, page, search]);

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleAll = () => {
    const pageIds = data.data.map(p => p.id);
    const allSelected = pageIds.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) pageIds.forEach(id => next.delete(id));
      else pageIds.forEach(id => next.add(id));
      return next;
    });
  };

  const reload = async () => {
    const params = { page, limit: 20 };
    if (filter) params.status = filter;
    if (authFilter) params.authority_id = authFilter;
    if (search) params.search = search;
    const fresh = await api.permits.list(params);
    setData(fresh);
  };

  const applyBulk = async () => {
    if (!selected.size) return;
    if (!bulkStatus) return alert('Choose a status first');
    if (!confirm(`Change status of ${selected.size} permit(s) to "${bulkStatus}"?`)) return;
    setBusy(true);
    try {
      await api.permits.bulk([...selected], 'status', bulkStatus);
      setSelected(new Set());
      await reload();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  const bulkDelete = async () => {
    if (!selected.size) return;
    if (!confirm(`Delete ${selected.size} permit(s)? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api.permits.bulk([...selected], 'delete');
      setSelected(new Set());
      await reload();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="page-header">{pageTitle('permits', 'Permits')}</h1>
          <p className="page-sub">Track authority permits, SLAs and expiry dates</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => api.export.downloadCSV(`/export/permits-csv${filter ? '?status=' + filter : ''}`, 'permits.csv')} className="btn btn-secondary">CSV</button>
          <Link to="/permits/new" className="btn btn-primary">+ New Permit</Link>
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        <select value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }} className="input">
          <option value="">All Statuses</option>
          {statuses.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <select value={authFilter} onChange={e => { setAuthFilter(e.target.value); setPage(1); }} className="input">
          <option value="">All Authorities</option>
          {authorities.map(a => <option key={a.id} value={a.id}>{a.short_name || a.name}</option>)}
        </select>
        <input placeholder="Search..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="input ml-auto w-48" />
      </div>
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-4 py-2">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)} className="input !py-1">
            <option value="">Set status…</option>
            {statuses.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
          <button onClick={applyBulk} disabled={busy} className="btn btn-primary btn-sm">Apply</button>
          <button onClick={bulkDelete} disabled={busy} className="btn btn-danger btn-sm">Delete</button>
          <button onClick={() => setSelected(new Set())} className="text-sm text-gray-500 hover:underline">Clear</button>
        </div>
      )}
      {loading ? <p className="text-gray-500">Loading...</p> : data.data.length === 0 ? (
        <div className="empty-state">
          <span className="text-4xl mb-2">📄</span>
          <p className="text-gray-500 text-sm">No permits found</p>
          <p className="text-gray-400 text-xs mt-1">Try a different filter or search, or create a new permit.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="table-th w-8">
                  <input type="checkbox" checked={data.data.length > 0 && data.data.every(p => selected.has(p.id))} onChange={toggleAll} />
                </th>
                <th className="table-th">{column('permits', 'tmp', 'TMP')}</th>
                <th className="table-th">{column('permits', 'authority', 'Authority')}</th>
                <th className="table-th">{column('permits', 'status', 'Status')}</th>
                <th className="table-th">{column('permits', 'complexity', 'Complexity')}</th>
                <th className="table-th">{column('permits', 'submitted', 'Submitted')}</th>
                <th className="table-th">{column('permits', 'expiry', 'Expiry')}</th>
                <th className="table-th">{column('permits', 'signal', '30m Signal')}</th>
                <th className="table-th">{column('permits', 'mrwa', 'MRWA')}</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {data.data.map(p => (
                <tr key={p.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${selected.has(p.id) ? 'bg-amber-50 dark:bg-amber-900/20' : ''}`}>
                  <td className="table-td"><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} /></td>
                  <td className="table-td"><Link to={`/permits/${p.id}`} className="text-lux-600 dark:text-lux-400 hover:underline font-medium">{p.tmp_reference || '-'}</Link></td>
                  <td className="table-td"><span className="font-medium">{p.authority_short}</span> <span className="text-xs text-gray-400">({p.authority_type?.toUpperCase()})</span></td>
                  <td className="table-td"><span className={`badge ${badgeFor(PERMIT_BADGES, p.status)}`}>{status(p.status)}</span></td>
                  <td className="table-td text-gray-500">{complexity(p.complexity)}</td>
                  <td className="table-td text-gray-400 text-xs">{p.submission_date || '-'}</td>
                  <td className="table-td text-gray-400 text-xs">{p.expiry_date || '-'}</td>
                  <td className="table-td">{p.is_within_30m_signals ? <span className="text-red-500 text-xs font-bold">YES</span> : <span className="text-gray-300">-</span>}</td>
                  <td className="table-td">{p.requires_mrwa ? <span className="text-lux-500 text-xs font-bold">YES</span> : <span className="text-gray-300">-</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-500">
            <span>{data.total} total</span>
            <div className="flex items-center gap-2">
              <button disabled={data.page <= 1} onClick={() => setPage(p => p - 1)} className="btn btn-ghost btn-sm">Prev</button>
              <span className="px-2 py-1 text-xs">Page {data.page} of {data.pages}</span>
              <button disabled={data.page >= data.pages} onClick={() => setPage(p => p + 1)} className="btn btn-ghost btn-sm">Next</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
