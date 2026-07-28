import React, { useState, useEffect } from 'react';
import api from '../api';

export default function ClientList() {
  const [clients, setClients] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', company: '', email: '', phone: '', address: '', abn: '' });

  useEffect(() => { api.clients.list().then(setClients); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const res = await api.clients.create(form);
    setClients([res, ...clients]);
    setForm({ name: '', company: '', email: '', phone: '', address: '', abn: '' });
    setShowForm(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete client?')) return;
    await api.clients.delete(id);
    setClients(clients.filter(c => c.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clients</h1>
        <button onClick={() => setShowForm(!showForm)} className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm">+ New Client</button>
      </div>
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="px-3 py-2 border rounded-lg" required />
            <input placeholder="Company" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} className="px-3 py-2 border rounded-lg" />
            <input placeholder="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="px-3 py-2 border rounded-lg" />
            <input placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="px-3 py-2 border rounded-lg" />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="bg-green-500 text-white px-3 py-2 rounded text-sm">Save</button>
            <button type="button" onClick={() => setShowForm(false)} className="bg-gray-300 px-3 py-2 rounded text-sm">Cancel</button>
          </div>
        </form>
      )}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 dark:bg-gray-700"><tr><th className="text-left px-4 py-3">Name</th><th className="text-left px-4 py-3">Company</th><th className="text-left px-4 py-3">Email</th><th className="text-left px-4 py-3">Phone</th><th className="px-4 py-3"></th></tr></thead>
          <tbody className="divide-y dark:divide-gray-700">
            {clients.map(c => (
              <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="px-4 py-3 font-medium">{c.name}</td><td className="px-4 py-3 text-gray-500">{c.company || '-'}</td><td className="px-4 py-3 text-gray-500">{c.email || '-'}</td><td className="px-4 py-3 text-gray-500">{c.phone || '-'}</td>
                <td className="px-4 py-3"><button onClick={() => handleDelete(c.id)} className="text-red-500 hover:text-red-700 text-xs">Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
