import { useState, useEffect, useCallback } from 'react';
import ImpactMap from './ImpactMap';
import api from '../api';

const CHANNEL_OPTIONS = [
  { value: 'letter', label: 'Letter only' },
  { value: 'email', label: 'Email only' },
  { value: 'both', label: 'Letter + Email' }
];

export default function NotificationPanel({ tmpId, tmp: _tmp, canEdit }) {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [activeNotice, setActiveNotice] = useState(null);
  const [form, setForm] = useState({
    subject: '',
    body: '',
    html_body: '',
    radius_m: 200,
    address_filter: { suburbs: [], postcodes: [], max_distance_m: 200 },
    recipients: [],
    template_id: null
  });
  const [templates, setTemplates] = useState([]);
  const [siteCoords, setSiteCoords] = useState(null);
  const [error, setError] = useState(null);

  const haversine = (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lat2) return 0;
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(a)));
  };

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.residentNotices.list(tmpId),
      api.email.templates(),
      api.residentNotices.suggestRecipients(tmpId)
    ]).then(([noticesRes, templatesRes, suggestRes]) => {
      setNotices(noticesRes);
      setTemplates(templatesRes);
      if (suggestRes.site) {
        setSiteCoords({ lat: suggestRes.site.lat, lon: suggestRes.site.lon, name: suggestRes.site.name });
        if (!form.recipients.length && suggestRes.suggestions?.length) {
          setForm(f => ({ ...f, recipients: suggestRes.suggestions }));
        }
      }
    }).catch(err => setError(err.message)).finally(() => setLoading(false));
  }, [tmpId]);

  useEffect(() => { load(); }, [load]);

  const handleFieldChange = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const addRecipient = () => setForm(f => ({ ...f, recipients: [...f.recipients, { name: '', address: '', email: '', phone: '', channel: 'letter', lat: null, lon: null }] }));
  const removeRecipient = (idx) => setForm(f => ({ ...f, recipients: f.recipients.filter((_, i) => i !== idx) }));
  const updateRecipient = (idx, field, value) => setForm(f => ({
    ...f, recipients: f.recipients.map((r, i) => i === idx ? { ...r, [field]: value } : r)
  }));

  const handleCreate = async () => {
    if (!form.subject.trim() || !form.body.trim()) { setError('Subject and body required'); return; }
    if (!form.recipients.length) { setError('At least one recipient required'); return; }
    setCreating(true); setError(null);
    try {
      const res = await api.residentNotices.create({
        tmp_id: tmpId,
        ...form,
        recipients: form.recipients.map(r => ({ name: r.name, address: r.address, email: r.email, phone: r.phone, channel: r.channel }))
      });
      setNotices([res, ...notices]);
      setActiveNotice(res);
      setForm({ subject: '', body: '', html_body: '', radius_m: 200, address_filter: { suburbs: [], postcodes: [], max_distance_m: 200 }, recipients: [], template_id: null });
    } catch (err) { setError(err.message); }
    setCreating(false);
  };

  const handleQueue = async (id) => {
    try { await api.residentNotices.queue(id); await load(); } catch (err) { setError(err.message); }
  };
  const handleSend = async (id) => {
    try { await api.residentNotices.send(id); await load(); } catch (err) { setError(err.message); }
  };
  const handleDelete = async (id) => {
    if (!confirm('Delete this draft notice?')) return;
    try { await api.residentNotices.delete(id); setNotices(notices.filter(n => n.id !== id)); } catch (err) { setError(err.message); }
  };

  if (loading) return <div className="card p-4 text-sm text-gray-500">Loading notifications…</div>;

  return (
    <div className="card p-4 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Resident & Stakeholder Notifications</h2>
        {canEdit && (
          <button onClick={() => { setActiveNotice(null); setForm({ subject: '', body: '', html_body: '', radius_m: 200, address_filter: { suburbs: [], postcodes: [], max_distance_m: 200 }, recipients: [], template_id: null }); }} className="btn btn-primary btn-sm">+ New Notice</button>
        )}
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">{error}<button onClick={() => setError(null)} className="ml-2 text-red-600 hover:text-red-800">✕</button></div>}

      {/* Notice list */}
      {!activeNotice && (
        <div className="space-y-2">
          {notices.length === 0 ? (
            <p className="text-sm text-gray-500">No notices yet. Create one to notify residents and stakeholders.</p>
          ) : (
            notices.map(n => (
              <div key={n.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{n.subject}</span>
                    <span className={`badge ${n.status === 'sent' ? 'bg-green-100 text-green-700' : n.status === 'partial' ? 'bg-yellow-100 text-yellow-700' : n.status === 'failed' ? 'bg-red-100 text-red-700' : n.status === 'queued' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>{n.status}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{n.recipients?.length || 0} recipients · {new Date(n.created_at).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-1 ml-3 shrink-0">
                  {canEdit && n.status === 'draft' && (
                    <>
                      <button onClick={() => setActiveNotice(n)} className="btn btn-secondary btn-sm px-2">Edit</button>
                      <button onClick={() => handleQueue(n.id)} className="btn btn-primary btn-sm px-2">Queue</button>
                      <button onClick={() => handleDelete(n.id)} className="btn btn-danger btn-sm px-2">Delete</button>
                    </>
                  )}
                  {canEdit && ['draft', 'queued'].includes(n.status) && (
                    <button onClick={() => handleSend(n.id)} className="btn btn-primary btn-sm px-2">Send</button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Active notice editor / detail */}
      {activeNotice && (
        <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{activeNotice.id === 'new' ? 'New Notice' : `Editing: ${activeNotice.subject}`}</h3>
            <button onClick={() => setActiveNotice(null)} className="text-gray-500 hover:text-gray-800">✕ Close</button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="label">Subject</label>
                <input value={form.subject} onChange={e => handleFieldChange('subject', e.target.value)} className="input w-full" />
              </div>
              <div>
                <label className="label">Template (optional)</label>
                <select value={form.template_id || ''} onChange={e => handleFieldChange('template_id', e.target.value)} className="input w-full">
                  <option value="">None</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Impact Radius (m)</label>
                <input type="number" min="50" max="5000" value={form.radius_m} onChange={e => handleFieldChange('radius_m', Number(e.target.value))} className="input w-32" />
              </div>
              <div>
                <label className="label">Body (plain text)</label>
                <textarea value={form.body} onChange={e => handleFieldChange('body', e.target.value)} className="input w-full" rows={6} placeholder="Use {{name}} and {{address}} placeholders" />
              </div>
              <div>
                <label className="label">HTML Body (optional)</label>
                <textarea value={form.html_body} onChange={e => handleFieldChange('html_body', e.target.value)} className="input w-full" rows={4} />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label">Address Filter (optional)</label>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <input placeholder="Suburbs (comma)" value={form.address_filter?.suburbs?.join(', ') || ''} onChange={e => handleFieldChange('address_filter', { ...form.address_filter, suburbs: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} className="input" />
                  <input placeholder="Postcodes (comma)" value={form.address_filter?.postcodes?.join(', ') || ''} onChange={e => handleFieldChange('address_filter', { ...form.address_filter, postcodes: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} className="input" />
                  <input type="number" placeholder="Max distance (m)" value={form.address_filter?.max_distance_m || 200} onChange={e => handleFieldChange('address_filter', { ...form.address_filter, max_distance_m: Number(e.target.value) })} className="input" />
                </div>
              </div>

              {/* Impact Map */}
              {siteCoords && (
                <ImpactMap
                  site={siteCoords}
                  recipients={form.recipients}
                  radiusM={form.radius_m}
                  onRecipientsChange={r => handleFieldChange('recipients', r)}
                  readOnly={!canEdit}
                />
              )}

              {/* Recipients list */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="font-medium">Recipients ({form.recipients.length})</label>
                  {canEdit && <button onClick={addRecipient} className="btn btn-secondary btn-sm">+ Add</button>}
                </div>
                {form.recipients.length === 0 ? (
                  <p className="text-sm text-gray-500">No recipients. Click map to add, or use + Add.</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-auto">
                    {form.recipients.map((r, i) => (
                      <div key={i} className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                        <input placeholder="Name" value={r.name} onChange={e => updateRecipient(i, 'name', e.target.value)} className="input" />
                        <input placeholder="Address" value={r.address} onChange={e => updateRecipient(i, 'address', e.target.value)} className="input sm:col-span-2" />
                        <input type="email" placeholder="Email" value={r.email || ''} onChange={e => updateRecipient(i, 'email', e.target.value)} className="input" />
                        <input placeholder="Phone" value={r.phone || ''} onChange={e => updateRecipient(i, 'phone', e.target.value)} className="input" />
                        <select value={r.channel || 'letter'} onChange={e => updateRecipient(i, 'channel', e.target.value)} className="input">
                          {CHANNEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        {r.lat && r.lon && <span className="text-xs text-gray-500 self-center">📍 {Math.round(r.distance_m || haversine(siteCoords?.lat, siteCoords?.lon, r.lat, r.lon))} m</span>}
                        {canEdit && <button onClick={() => removeRecipient(i)} className="text-red-500 hover:text-red-700 text-xs self-center">Remove</button>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {canEdit && (
                <div className="flex gap-2">
                  <button onClick={handleCreate} disabled={creating} className="btn btn-primary">{creating ? 'Creating…' : (activeNotice.id === 'new' ? 'Create' : 'Save Changes')}</button>
                  <button onClick={() => setActiveNotice(null)} className="btn btn-secondary">Cancel</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

      