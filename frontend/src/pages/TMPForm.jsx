import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api';

export default function TMPForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const [form, setForm] = useState({ title: '', plan_type: 'temporary', status: 'draft', description: '', project_id: '', site_id: '', start_date: '', end_date: '' });
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.projects.list(), api.sites.list()]).then(([p, s]) => { setProjects(p); setSites(s); });
    if (isEdit) { api.tmps.get(id).then(tmp => setForm({ title: tmp.title || '', plan_type: tmp.plan_type || 'temporary', status: tmp.status || 'draft', description: tmp.description || '', project_id: tmp.project_id || '', site_id: tmp.site_id || '', start_date: tmp.start_date || '', end_date: tmp.end_date || '' })).finally(() => setLoading(false)); }
    else setLoading(false);
  }, [id, isEdit]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) { await api.tmps.update(id, form); navigate(`/tmps/${id}`); }
      else { const res = await api.tmps.create(form); navigate(`/tmps/${res.id}`); }
    } catch (err) { alert(err.message); } finally { setSaving(false); }
  };

  return (
    <div className="max-w-2xl">
      <Link to="/tmps" className="text-sm text-gray-500 hover:text-amber-600">← Back</Link>
      <h1 className="text-2xl font-bold mt-2 mb-4">{isEdit ? 'Edit TMP' : 'New TMP'}</h1>
      {loading ? <p className="text-gray-500">Loading...</p> : (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title *</label>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <select value={form.plan_type} onChange={e => setForm({ ...form, plan_type: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
                <option value="temporary">Temporary</option><option value="permanent">Permanent</option><option value="event">Event</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
                <option value="draft">Draft</option><option value="submitted">Submitted</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 border rounded-lg" rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Project</label>
              <select value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
                <option value="">None</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Site</label>
              <select value={form.site_id} onChange={e => setForm({ ...form, site_id: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
                <option value="">None</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">Start Date</label><input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="w-full px-3 py-2 border rounded-lg" /></div>
            <div><label className="block text-sm font-medium mb-1">End Date</label><input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="w-full px-3 py-2 border rounded-lg" /></div>
          </div>
          <button type="submit" disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
        </form>
      )}
    </div>
  );
}
