import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../api';
import { cacheGet, cacheSet } from '../../lib/fieldStore';

export default function FieldPermitDetail() {
  const { id } = useParams();
  const [permit, setPermit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const detail = await api.permits.get(id);
        if (!cancelled) {
          setPermit(detail);
          setError('');
          cacheSet(`permits:${id}`, detail).catch(() => {});
        }
      } catch (err) {
        const cached = await cacheGet(`permits:${id}`);
        if (!cancelled) {
          if (cached) {
            setPermit(cached);
            setError('Offline — showing cached details.');
          } else {
            setError(err.message);
          }
        }
      }
      if (!cancelled) setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) return <p className="text-sm text-gray-500 py-8 text-center">Loading…</p>;
  if (!permit) return <p className="text-sm text-red-500 py-8 text-center">Permit not found</p>;

  const rows = [
    ['Authority', permit.authority_name || permit.authority_short],
    ['Status', permit.status],
    ['Complexity', permit.complexity],
    ['Submitted', permit.submission_date?.slice(0, 10)],
    ['Approved', permit.approval_date?.slice(0, 10)],
    ['Expires', permit.expiry_date?.slice(0, 10)],
    ['Plan', permit.tmp_reference ? `${permit.tmp_reference}${permit.tmp_title ? ' · ' + permit.tmp_title : ''}` : null]
  ].filter(([, v]) => v != null && v !== '');

  return (
    <div className="space-y-3">
      <div>
        <Link to="/field/permits" className="text-xs text-gray-500 hover:text-lux-600 dark:hover:text-lux-400">← Back to permits</Link>
        <h1 className="font-bold text-lg mt-0.5">{permit.authority_name || permit.authority_short || 'Permit'}</h1>
      </div>

      {error && <p className="text-xs text-amber-600 dark:text-amber-400">{error}</p>}

      {permit.tmp_id && (
        <Link to={`/field/tmps/${permit.tmp_id}`} className="block bg-lux-50 dark:bg-lux-900/20 border border-lux-200 dark:border-lux-800 rounded-xl p-3 text-sm text-lux-700 dark:text-lux-300 font-medium">
          View associated plan {permit.tmp_reference ? `(${permit.tmp_reference})` : ''} →
        </Link>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Details</h2>
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-1.5 text-sm">
              <span className="text-gray-500">{k}</span>
              <span className="font-medium text-right">{v}</span>
            </div>
          ))}
        </div>
      </div>

      {permit.rejection_reason && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-300 mb-1">Rejection reason</h2>
          <p className="text-sm text-red-700 dark:text-red-300">{permit.rejection_reason}</p>
        </div>
      )}

      {permit.fees && permit.fees.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Fees</h2>
          <div className="space-y-1">
            {permit.fees.map((f) => (
              <div key={f.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-300">{f.fee_type}</span>
                <span className="font-medium">${Number(f.amount || 0).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}