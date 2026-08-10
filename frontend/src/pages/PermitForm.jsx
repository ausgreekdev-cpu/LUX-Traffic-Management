import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api';

export default function PermitForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const [form, setForm] = useState({ tmp_id: '', authority_id: '', status: 'draft', complexity: 'standard', submission_date: '', approval_date: '', expiry_date: '', rejection_reason: '', is_within_30m_signals: false, requires_mrwa: false });
  const [tmps, setTmps] = useState([]);
  const [authorities, setAuthorities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [missingStages, setMissingStages] = useState([]);

  useEffect(() => {
    Promise.all([api.tmps.list(), api.authorities.list()]).then(([t, a]) => { setTmps(t.data); setAuthorities(a); });
    if (isEdit) {
      api.permits.get(id).then(p => setForm({
        tmp_id: p.tmp_id || '', authority_id: p.authority_id || '', status: p.status || 'draft', complexity: p.complexity || 'standard',
        submission_date: p.submission_date || '', approval_date: p.approval_date || '', expiry_date: p.expiry_date || '',
        rejection_reason: p.rejection_reason || '', is_within_30m_signals: !!p.is_within_30m_signals, requires_mrwa: !!p.requires_mrwa
      }))
        .then(() => api.workflows.checklist('permit', id))
        .then(cl => setMissingStages(cl.data.filter(s => !s.is_optional && !s.is_done).map(s => s.name)))
        .catch(() => {})
        .finally(() => setLoading(false));
    } else setLoading(false);
  }, [id, isEdit]);

  const statusBlocks = (['approved', 'completed'].includes(form.status)) && missingStages.length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (statusBlocks) { alert('Complete the required workflow stages first: ' + missingStages.join(', ')); return; }
    setSaving(true);
    try {
      if (isEdit) { await api.permits.update(id, form); navigate(`/permits/${id}`); }
      else { const res = await api.permits.create(form); navigate(`/permits/${res.id}`); }
    } catch (err) { alert(err.message); } finally { setSaving(false); }
  };

  return (
    <div className="max-w-2xl">
      <Link to="/permits" className="text-sm text-gray-500 hover:text-amber-600">← Back</Link>
      <h1 className="text-2xl font-bold mt-2 mb-4">{isEdit ? 'Edit Permit' : 'New Permit'}</h1>
      {loading ? <p className="text-gray-500">Loading...</p> : (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">TMP *</label>
            <select value={form.tmp_id} onChange={e => {
              const tmp = tmps.find(t => t.id === e.target.value);
              setForm(f => ({ ...f, tmp_id: e.target.value, complexity: (!isEdit && tmp) ? (tmp.complexity || 'standard') : f.complexity }));
            }} className="w-full px-3 py-2 border rounded-lg" required>
              <option value="">Select TMP</option>{tmps.map(t => <option key={t.id} value={t.id}>{t.reference} - {t.title}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Authority *</label>
            <select value={form.authority_id} onChange={e => setForm({ ...form, authority_id: e.target.value })} className="w-full px-3 py-2 border rounded-lg" required>
              <option value="">Select Authority</option>{authorities.map(a => <option key={a.id} value={a.id}>{a.short_name || a.name} ({a.type?.toUpperCase()})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
                {['draft', 'submitted', 'under_review', 'approved', 'rejected', 'expired', 'cancelled', 'completed'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Complexity</label>
              <select value={form.complexity} onChange={e => setForm({ ...form, complexity: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
                <option value="simple">Simple</option><option value="standard">Standard</option><option value="complex">Complex</option><option value="complex_with_notice">Complex + Notice</option>
              </select>
            </div>
          </div>
          {statusBlocks && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded text-sm text-amber-800 dark:text-amber-300">
              Cannot mark as <b>{form.status}</b> — required workflow stages still incomplete: <b>{missingStages.join(', ')}</b>. Tick them off on the permit's workflow checklist first.
            </div>
          )}
          <div className="grid grid-cols-3 gap-4">
            <div><label className="block text-sm font-medium mb-1">Submission Date</label><input type="date" value={form.submission_date} onChange={e => setForm({ ...form, submission_date: e.target.value })} className="w-full px-3 py-2 border rounded-lg" /></div>
            <div><label className="block text-sm font-medium mb-1">Approval Date</label><input type="date" value={form.approval_date} onChange={e => setForm({ ...form, approval_date: e.target.value })} className="w-full px-3 py-2 border rounded-lg" /></div>
            <div><label className="block text-sm font-medium mb-1">Expiry Date</label><input type="date" value={form.expiry_date} onChange={e => setForm({ ...form, expiry_date: e.target.value })} className="w-full px-3 py-2 border rounded-lg" /></div>
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_within_30m_signals} onChange={e => setForm({ ...form, is_within_30m_signals: e.target.checked })} className="rounded" />
              Within 30m of Signalised Intersection
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.requires_mrwa} onChange={e => setForm({ ...form, requires_mrwa: e.target.checked })} className="rounded" />
              Requires MRWA Referral
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Rejection Reason</label>
            <textarea value={form.rejection_reason} onChange={e => setForm({ ...form, rejection_reason: e.target.value })} className="w-full px-3 py-2 border rounded-lg" rows={2} />
          </div>
          <button type="submit" disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
        </form>
      )}
    </div>
  );
}
