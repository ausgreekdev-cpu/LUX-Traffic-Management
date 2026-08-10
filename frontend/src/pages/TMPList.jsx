import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { TMP_BADGES, badgeFor } from '../utils/status';
import { useAppText } from '../context/AppText';

const statuses = ['draft', 'submitted', 'approved', 'rejected', 'completed'];

export default function TMPList() {
  const { pageTitle, column, status } = useAppText();
  const [data, setData] = useState({ data: [], total: 0, page: 1, pages: 1 });
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [bulkStatus, setBulkStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLoading(true);
    setSelected(new Set());
    const params = { page, limit: 20 };
    if (filter) params.status = filter;
    if (search) params.search = search;
    api.tmps.list(params).then(setData).finally(() => setLoading(false));
  }, [filter, page, search]);

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleAll = () => {
    const pageIds = data.data.map(t => t.id);
    const allSelected = pageIds.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) pageIds.forEach(id => next.delete(id));
      else pageIds.forEach(id => next.add(id));
      return next;
    });
  };

  const applyBulk = async () => {
    if (!selected.size) return;
    if (!bulkStatus) return alert('Choose a status first');
    if (!confirm(`Change status of ${selected.size} TMP(s) to "${bulkStatus}"?`)) return;
    setBusy(true);
    try {
      await api.tmps.bulk([...selected], 'status', bulkStatus);
      setSelected(new Set());
      const params = { page, limit: 20 };
      if (filter) params.status = filter;
      if (search) params.search = search;
      const fresh = await api.tmps.list(params);
      setData(fresh);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  const bulkDelete = async () => {
    if (!selected.size) return;
    if (!confirm(`Delete ${selected.size} TMP(s)? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api.tmps.bulk([...selected], 'delete');
      setSelected(new Set());
      const params = { page, limit: 20 };
      if (filter) params.status = filter;
      if (search) params.search = search;
      const fresh = await api.tmps.list(params);
      setData(fresh);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  const csvPath = (() => {
    const params = new URLSearchParams();
    if (filter) params.set('status', filter);
    if (search) params.set('search', search);
    const q = params.toString();
    return `/export/tmps-csv${q ? '?' + q : ''}`;
  })();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="page-header">{pageTitle('tmps', 'Traffic Management Plans')}</h1>
          <p className="page-sub">Track, filter and manage your TMPs</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => api.export.downloadCSV(csvPath, 'tmps.csv')} className="btn btn-secondary">CSV</button>
          <button onClick={() => api.export.downloadCSV('/export/audit-report', 'audit-report.pdf')} className="btn btn-secondary">Audit PDF</button>
          <Link to="/tmps/new" className="btn btn-primary">+ New TMP</Link>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex gap-2 flex-wrap">
          {['', ...statuses].map(s => (
            <button key={s} onClick={() => { setFilter(s); setPage(1); }} className={`chip ${filter === s ? 'chip-active' : 'chip-inactive'}`}>{s || 'All'}</button>
          ))}
        </div>
        <input placeholder="Search..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="input ml-auto w-48" />
      </div>
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-4 py-2">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)} className="input !py-1">
            <option value="">Set status…</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={applyBulk} disabled={busy} className="btn btn-primary btn-sm">Apply</button>
          <button onClick={bulkDelete} disabled={busy} className="btn btn-danger btn-sm">Delete</button>
          <button onClick={() => setSelected(new Set())} className="text-sm text-gray-500 hover:underline">Clear</button>
        </div>
      )}
      {loading ? <p className="text-gray-500">Loading...</p> : data.data.length === 0 ? (
        <div className="empty-state">
          <span className="text-4xl mb-2">📋</span>
          <p className="text-gray-500 text-sm">No TMPs found</p>
          <p className="text-gray-400 text-xs mt-1">Try a different filter or search, or create a new TMP.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="table-th w-8">
                  <input type="checkbox" checked={data.data.length > 0 && data.data.every(t => selected.has(t.id))} onChange={toggleAll} />
                </th>
                <th className="table-th">{column('tmps', 'reference', 'Reference')}</th>
                <th className="table-th">{column('tmps', 'title', 'Title')}</th>
                <th className="table-th">{column('tmps', 'site', 'Site')}</th>
                <th className="table-th">{column('tmps', 'status', 'Status')}</th>
                <th className="table-th">{column('tmps', 'type', 'Type')}</th>
                <th className="table-th">{column('tmps', 'ends', 'Ends')}</th>
                <th className="table-th">{column('tmps', 'created', 'Created')}</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {data.data.map(tmp => (
                <tr key={tmp.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${selected.has(tmp.id) ? 'bg-amber-50 dark:bg-amber-900/20' : ''}`}>
                  <td className="table-td"><input type="checkbox" checked={selected.has(tmp.id)} onChange={() => toggle(tmp.id)} /></td>
                  <td className="table-td font-medium">{tmp.reference}</td>
                  <td className="table-td"><Link to={`/tmps/${tmp.id}`} className="text-lux-600 dark:text-lux-400 hover:underline font-medium">{tmp.title}</Link></td>
                  <td className="table-td text-gray-500">{tmp.site_name || '-'}</td>
                  <td className="table-td"><span className={`badge ${badgeFor(TMP_BADGES, tmp.status)}`}>{status(tmp.status)}</span></td>
                  <td className="table-td text-gray-500">{tmp.plan_type}</td>
                  <td className="table-td text-gray-500 text-xs">{tmp.end_date || '-'}</td>
                  <td className="table-td text-gray-400 text-xs">{tmp.created_at?.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
