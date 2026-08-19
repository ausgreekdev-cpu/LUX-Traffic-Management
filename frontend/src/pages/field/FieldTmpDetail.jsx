import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../api';
import { useAuth, hasRole } from '../../context/Auth';
import { cacheGet, cacheSet } from '../../lib/fieldStore';
import PhotoCaptureModal from '../../components/field/PhotoCaptureModal';

export default function FieldTmpDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const canCapture = hasRole(user, 'staff');
  const [tmp, setTmp] = useState(null);
  const [crew, setCrew] = useState([]);
  const [checklist, setChecklist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCapture, setShowCapture] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const detail = await api.tmps.get(id);
        if (!cancelled) {
          setTmp(detail);
          setError('');
          cacheSet(`tmps:${id}`, detail).catch(() => {});
        }
        const [boardRes, checklistRes] = await Promise.all([
          api.kanban.board('tmp').catch(() => null),
          api.workflows.checklist('tmp', id).catch(() => null)
        ]);
        if (!cancelled) {
          if (boardRes) {
            const card = boardRes.cards.find((c) => c.entity_id === id);
            if (card && card.assigned_user_id) {
              const u = boardRes.users.find((x) => x.id === card.assigned_user_id);
              setCrew(u ? [u] : []);
            }
          }
          if (checklistRes) setChecklist(checklistRes.data || []);
        }
      } catch (err) {
        const cached = await cacheGet(`tmps:${id}`);
        if (!cancelled) {
          if (cached) {
            setTmp(cached);
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
  if (!tmp) return <p className="text-sm text-red-500 py-8 text-center">Plan not found</p>;

  return (
    <div className="space-y-3">
      <div>
        <Link to="/field" className="text-xs text-gray-500 hover:text-lux-600 dark:hover:text-lux-400">← Back to plans</Link>
        <h1 className="font-bold text-lg leading-tight mt-0.5">{tmp.title}</h1>
        <p className="text-xs text-gray-500 font-mono">{tmp.reference}</p>
      </div>

      {error && <p className="text-xs text-amber-600 dark:text-amber-400">{error}</p>}

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className={`badge ${tmp.status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>{tmp.status}</span>
          <span className="text-xs text-gray-500">{tmp.plan_type}</span>
        </div>
        {(tmp.start_date || tmp.end_date) && (
          <p className="text-xs text-gray-600 dark:text-gray-300">
            {tmp.start_date && <>From {tmp.start_date.slice(0, 10)}</>}
            {tmp.end_date && <> to {tmp.end_date.slice(0, 10)}</>}
          </p>
        )}
        {tmp.risk_band && (
          <p className="text-xs">
            <span className="text-gray-500">Risk: </span>
            <span className={`badge ${tmp.risk_band === 'extreme' || tmp.risk_band === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : tmp.risk_band === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'}`}>{tmp.risk_band.toUpperCase()}{tmp.risk_score > 0 ? ` · score ${tmp.risk_score}` : ''}</span>
          </p>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Site & speed zones</h2>
        {tmp.site_name ? (
          <div className="space-y-1 text-sm">
            <p className="font-medium">{tmp.site_name}</p>
            {tmp.road_name && <p className="text-xs text-gray-600 dark:text-gray-300">Road: {tmp.road_name}</p>}
            <p className="text-xs text-gray-600 dark:text-gray-300">{[tmp.suburb, tmp.state, tmp.postcode].filter(Boolean).join(', ') || '-'}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {tmp.speed_limit != null && <span className="badge bg-lux-100 text-lux-700 dark:bg-lux-900/40 dark:text-lux-300">Speed {tmp.speed_limit} km/h</span>}
              {tmp.road_class && <span className="badge bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">{tmp.road_class}</span>}
              {tmp.aadt != null && <span className="badge bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">AADT {tmp.aadt.toLocaleString()}</span>}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No site assigned.</p>
        )}
      </div>

      {crew.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Assigned crew</h2>
          <div className="flex flex-wrap gap-2">
            {crew.map((u) => (
              <span key={u.id} className="badge bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">{u.name} ({u.role})</span>
            ))}
          </div>
        </div>
      )}

      {tmp.permits && tmp.permits.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Permits ({tmp.permits.length})</h2>
          <div className="space-y-1.5">
            {tmp.permits.map((p) => (
              <Link key={p.id} to={`/field/permits/${p.id}`} className="flex items-center justify-between text-sm p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <span className="truncate">{p.authority_short || p.authority_name}</span>
                <span className="badge bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 shrink-0">{p.status}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {checklist && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Safety checklist (read-only)</h2>
          <div className="space-y-1.5">
            {checklist.map((c) => (
              <div key={c.id} className="flex items-center gap-2 text-sm">
                <span className={`h-4 w-4 rounded-full border flex items-center justify-center text-[10px] shrink-0 ${c.is_done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 dark:border-gray-600'}`}>
                  {c.is_done ? '✓' : ''}
                </span>
                <span className={c.is_done ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-200'}>{c.stage_name || c.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Site photos ({(tmp.photos || []).length})</h2>
          {canCapture && (
            <button onClick={() => setShowCapture(true)} className="btn btn-primary btn-sm">📷 Capture</button>
          )}
        </div>
        {(tmp.photos || []).length === 0 ? (
          <p className="text-sm text-gray-500">No photos captured yet.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {(tmp.photos || []).map((p) => (
              <div key={p.id} className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
                <img src={api.photos.url(p.id)} alt={p.caption || 'Site photo'} loading="lazy" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        )}
      </div>

      {tmp.description && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Description</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">{tmp.description}</p>
        </div>
      )}

      {showCapture && (
        <PhotoCaptureModal tmp={tmp} onClose={() => setShowCapture(false)} onUploaded={async () => {
          try { const d = await api.tmps.get(id); setTmp(d); cacheSet(`tmps:${id}`, d).catch(() => {}); } catch {}
        }} />
      )}
    </div>
  );
}