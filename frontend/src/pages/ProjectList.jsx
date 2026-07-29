import React, { useState, useEffect } from 'react';
import api from '../api';

export default function ProjectList() {
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
        <button onClick={() => setShowForm(!showForm)} className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm">+ New Project</button>
      </div>
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="px-3 py-2 border rounded-lg" required />
            <select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })} className="px-3 py-2 border rounded-lg">
              <option value="">No Client</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="px-3 py-2 border rounded-lg" />
            <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="px-3 py-2 border rounded-lg" />
          </div>
          <textarea placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 border rounded-lg" rows={2} />
          <div className="flex gap-2">
            <button type="submit" className="bg-green-500 text-white px-3 py-2 rounded text-sm">{editId ? 'Update' : 'Save'}</button>
            <button type="button" onClick={resetForm} className="bg-gray-300 px-3 py-2 rounded text-sm">Cancel</button>
          </div>
        </form>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {projects.map(p => (
          <div key={p.id} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 relative">
            <h3 className="font-semibold">{p.name}</h3>
            <p className="text-sm text-gray-500 mt-1">{p.description || 'No description'}</p>
            <div className="flex gap-4 mt-2 text-xs text-gray-400">
              <span>Client: {p.client_name || 'None'}</span>
              <span>Plans: {p.plan_count || 0}</span>
              <span className={`px-2 py-0.5 rounded ${p.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{p.status}</span>
            </div>
            <button onClick={() => handleEdit(p)} className="absolute top-2 right-2 text-amber-600 hover:underline text-xs">Edit</button>
          </div>
        ))}
      </div>
    </div>
  );
}
