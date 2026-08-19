import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import { cacheGet, cacheSet } from '../../lib/fieldStore';

const STATUS = ['active', 'approved', 'draft', 'submitted', 'rejected', 'completed', 'cancelled'];
const STATUS_BADGE = {
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  active: 'bg-lux-100 text-lux-700 dark:bg-lux-900/40 dark:text-lux-300'
};

export default function FieldHome() {
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
        const res = await api.tmps.list({ page: 1, limit: 100 });
        if (!cancelled) {
          setRows(res.data || []);
          setError('');
          cacheSet('tmps', res.data || []).catch(() => {});
        }
      } catch (err) {
        const cached = await cacheGet('tmps');
        if (!cancelled) {
          if (cached) {
            setRows(cached);
            setError('Offline — showing cached plans.');
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
    if (status) list = list.filter((t) => t.status === status);
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter((t) => (t.title || '').toLowerCase().includes(s) || (t.reference || '').toLowerCase().includes(s) || (t.site_name || '').toLowerCase().includes(s));
    }
    return list;
  }, [rows, search, status]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-lg">Plans</h1>
        <span className="text-xs text-gray-500">{filtered.length} shown</span>
      </div>

      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search plan / site…" className="input w-full" />

      <div className="flex gap-1.5 flex-wrap">
        {['', ...STATUS].map((s) => (
          <button key={s || 'all'} onClick={() => setStatus(s)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border ${s === status ? 'bg-lux-500 text-white border-lux-500' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? <p className="text-sm text-gray-500 py-8 text-center">Loading…</p>
        : error && <p className="text-xs text-amber-600 dark:text-amber-400">{error}</p>}
      {!loading && !error && filtered.length === 0 && <p className="text-sm text-gray-500 py-8 text-center">No plans found.</p>}

      <div className="space-y-2">
        {filtered.map((t) => (
          <Link key={t.id} to={`/field/tmps/${t.id}`}
            className="block bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 shadow-sm active:scale-[0.99] transition">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{t.title}</p>
                <p className="text-xs text-gray-500 font-mono">{t.reference}</p>
              </div>
              <span className={`badge shrink-0 ${STATUS_BADGE[t.status] || STATUS_BADGE.draft}`}>{t.status}</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 flex-wrap">
              {t.site_name && <span>📍 {t.site_name}</span>}
              {t.complexity && <span className="badge bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">{t.complexity}</span>}
              {t.risk_band && <span className={`badge ${t.risk_band === 'high' || t.risk_band === 'extreme' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300'}`}>Risk {t.risk_band}</span>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}