import { useState, useEffect } from 'react';
import api from '../api';
import { useAppText } from '../context/AppText';
import { useAuth, hasRole } from '../context/Auth';

export default function ClientList() {
  const { pageTitle, column } = useAppText();
  const { user } = useAuth();
  const canEdit = hasRole(user, 'staff');
  const canDelete = hasRole(user, 'manager');
  const [clients, setClients] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', company: '', email: '', phone: '', address: '', abn: '' });

  useEffect(() => { api.clients.list().then(setClients).catch(() => {}); }, []);

  const resetForm = () => { setForm({ name: '', company: '', email: '', phone: '', address: '', abn: '' }); setEditId(null); setShowForm(false); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editId) {
        await api.clients.update(editId, form);
      } else {
        const res = await api.clients.create(form);
        setClients([res, ...clients]);
      }
      resetForm();
      api.clients.list().then(setClients).catch(() => {});
    } catch (err) { alert(err.message); }
  };

  const handleEdit = (c) => {
    setEditId(c.id);
    setForm({ name: c.name, company: c.company || '', email: c.email || '', phone: c.phone || '', address: c.address || '', abn: c.abn || '' });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete client?')) return;
    try {
      await api.clients.delete(id);
      setClients(clients.filter(c => c.id !== id));
    } catch (err) { alert(err.message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="page-header">{pageTitle('clients', 'Clients')}</h1>
          <p className="page-sub">Companies and contacts you work with</p>
        </div>
        {canEdit && <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">+ New Client</button>}
      </div>
      {showForm && (
        <form onSubmit={handleSubmit} className="card p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input" required />
            <input placeholder="Company" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} className="input" />
            <input placeholder="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="input" />
            <input placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="input" />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">{editId ? 'Update' : 'Save'}</button>
            <button type="button" onClick={resetForm} className="btn btn-ghost">Cancel</button>
          </div>
        </form>
      )}
      {clients.length === 0 ? (
        <div className="empty-state">
          <span className="text-4xl mb-2">👥</span>
          <p className="text-gray-500 text-sm">No clients yet</p>
          <p className="text-gray-400 text-xs mt-1">Create your first client to link projects to.</p>
        </div>
      ) : (
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"><tr><th className="table-th">{column('clients', 'name', 'Name')}</th><th className="table-th">{column('clients', 'company', 'Company')}</th><th className="table-th">{column('clients', 'email', 'Email')}</th><th className="table-th">{column('clients', 'phone', 'Phone')}</th><th className="table-th"></th></tr></thead>
          <tbody className="divide-y dark:divide-gray-700">
            {clients.map(c => (
              <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="table-td font-medium">{c.name}</td><td className="table-td text-gray-500">{c.company || '-'}</td><td className="table-td text-gray-500">{c.email || '-'}</td><td className="table-td text-gray-500">{c.phone || '-'}</td>
                <td className="table-td text-right space-x-2">
                  {canEdit && <button onClick={() => handleEdit(c)} className="text-lux-600 dark:text-lux-400 hover:underline text-xs font-medium">Edit</button>}
                  {canDelete && <button onClick={() => handleDelete(c.id)} className="text-red-500 hover:text-red-700 text-xs font-medium">Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
