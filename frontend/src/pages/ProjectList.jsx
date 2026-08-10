import { useState, useEffect } from 'react';
import api from '../api';
import { useAppText } from '../context/AppText';

export default function ProjectList() {
  const { pageTitle } = useAppText();
  const [projects, setProjects] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({ name: '', description: '', client_id: '', status: 'active', start_date: '', end_date: '' });

  useEffect(() => { api.projects.list().then(setProjects); api.clients.list().then(setClients); }, []);

  const resetForm = () => { setForm({ name: '', description: '', client_id: '', status: 'active', start_date: '', end_date: '' }); setEditId(null); setShowForm(false); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editId) {
      await api.projects.update(editId, form);
    } else {
      await api.projects.create(form);
    }
    resetForm();
    api.projects.list().then(setProjects);
  };

  const handleEdit = (p) => {
    setEditId(p.id);
    setForm({ name: p.name, description: p.description || '', client_id: p.client_id || '', status: p.status, start_date: p.start_date || '', end_date: p.end_date || '' });
    setShowForm(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="page-header">{pageTitle('projects', 'Projects')}</h1>
          <p className="page-sub">Group TMPs under client engagements</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">+ New Project</button>
      </div>
      {showForm && (
        <form onSubmit={handleSubmit} className="card p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input" required />
            <select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })} className="input">
              <option value="">No Client</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="input" />
            <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="input" />
          </div>
          <textarea placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input w-full" rows={2} />
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">{editId ? 'Update' : 'Save'}</button>
            <button type="button" onClick={resetForm} className="btn btn-ghost">Cancel</button>
          </div>
        </form>
      )}
      {projects.length === 0 ? (
        <div className="empty-state">
          <span className="text-4xl mb-2">📁</span>
          <p className="text-gray-500 text-sm">No projects yet</p>
          <p className="text-gray-400 text-xs mt-1">Create your first project to group TMPs.</p>
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {projects.map(p => (
          <div key={p.id} className="card p-4 relative">
            <h3 className="font-semibold">{p.name}</h3>
            <p className="text-sm text-gray-500 mt-1">{p.description || 'No description'}</p>
            <div className="flex gap-4 mt-2 text-xs text-gray-400">
              <span>Client: {p.client_name || 'None'}</span>
              <span>Plans: {p.plan_count || 0}</span>
              <span className={`badge ${p.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>{p.status}</span>
            </div>
            <button onClick={() => handleEdit(p)} className="absolute top-2 right-2 text-lux-600 dark:text-lux-400 hover:underline text-xs font-medium">Edit</button>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
