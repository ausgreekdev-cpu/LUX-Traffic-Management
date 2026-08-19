import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import { cacheGet, cacheSet } from '../../lib/fieldStore';

const STATUS = ['', 'approved', 'submitted', 'pending', 'rejected', 'expired', 'revoked'];

export default function FieldPermits() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await api.permits.list({ page: 1, limit: 100 });
        const list = res.data || (Array.isArray(res) ? res : []);
        if (!cancelled) {
          setRows(list);
          setError('');
          cacheSet('permits', list).catch(() => {});
        }
      } catch (err) {
        const cached = await cacheGet('permits');
        if (!cancelled) {
          if (cached) {
            setRows(cached);
            setError('Offline — showing cached permits.');
          } else {
            setError(err.message);
          }
        }
      }
      if (!cancelled) setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    let list = rows;
    if (status) list = list.filter((p) => p.status === status);
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter((p) => (p.tmp_title || '').toLowerCase().includes(s) || (p.tmp_reference || '').toLowerCase().includes(s) || (p.authority_name || '').toLowerCase().includes(s));
    }
    return list;
  }, [rows, search, status]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-lg">Permits</h1>
        <span className="text-xs text-gray-500">{filtered.length} shown</span>
      </div>

      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search permit / plan…" className="input w-full" />

      <div className="flex gap-1.5 flex-wrap">
        {STATUS.map((s) => (
          <button key={s || 'all'} onClick={() => setStatus(s)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border ${s === status ? 'bg-lux-500 text-white border-lux-500' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? <p className="text-sm text-gray-500 py-8 text-center">Loading…</p>
        : error && <p className="text-xs text-amber-600 dark:text-amber-400">{error}</p>}
      {!loading && !error && filtered.length === 0 && <p className="text-sm text-gray-500 py-8 text-center">No permits found.</p>}

      <div className="space-y-2">
        {filtered.map((p) => (
          <Link key={p.id} to={`/field/permits/${p.id}`}
            className="block bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 shadow-sm active:scale-[0.99] transition">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{p.authority_name || p.authority_short || 'Permit'}</p>
                <p className="text-xs text-gray-500 truncate">{p.tmp_reference || p.tmp_title}</p>
              </div>
              <span className="badge shrink-0 bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">{p.status}</span>
            </div>
            {(p.submission_date || p.expiry_date) && (
              <p className="mt-1.5 text-[11px] text-gray-500">
                {p.submission_date && <>Submitted {p.submission_date.slice(0, 10)}</>}
                {p.expiry_date && <> · Expires {p.expiry_date.slice(0, 10)}</>}
              </p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}