import { useState, useEffect } from 'react';
import api from '../api';
import { useAppText } from '../context/AppText';

const roleBadge = {
  developer: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  manager: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  staff: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  client: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
};

export default function UsersList() {
  const { pageTitle, column } = useAppText();
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ email: '', password: '', name: '', role: 'staff', client_id: '' });
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('staff');
  const [editId, setEditId] = useState(null);

  const loadUsers = () => api.users.list().then(setUsers).catch(() => setUsers([]));
  const loadClients = () => api.clients.list().then(setClients).catch(() => setClients([]));
  const loadInvites = () => fetch('/api/users/invitations', { headers:{Authorization:`Bearer ${localStorage.getItem('token')}`}}).then(r=>r.json()).then(setInvites).catch(()=>setInvites([]));
  useEffect(() => {
    Promise.all([loadUsers(), loadClients(), loadInvites()]).finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form, client_id: form.role === 'client' ? form.client_id || null : undefined };
      if (editId) {
        await api.users.update(editId, payload);
      } else {
        await api.users.create(payload);
      }
      setForm({ email: '', password: '', name: '', role: 'staff', client_id: '' });
      setEditId(null);
      await loadUsers();
    } catch (err) { alert(err.message); }
  };

  const handleEdit = (u) => {
    setEditId(u.id);
    setForm({ email: u.email, password: '', name: u.name, role: u.role, client_id: u.client_id || '' });
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this user?')) return;
    try { await api.users.delete(id); await loadUsers(); } catch (err) { alert(err.message); }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/users/invite', { method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem('token')}`}, body: JSON.stringify({ email: inviteEmail, role: inviteRole })});
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invite failed');
      alert(`Invitation created for ${data.email}. Share link: ${window.location.origin}/accept?token=${data.token}`);
      setInviteEmail('');
      await loadInvites();
    } catch (err) { alert(err.message); }
  };

  const handleCancel = () => {
    setEditId(null);
    setForm({ email: '', password: '', name: '', role: 'staff', client_id: '' });
  };

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-header">{pageTitle('users', 'User Management')}</h1>
        <p className="page-sub">Create and manage accounts and roles</p>
      </div>
      <form onSubmit={handleSubmit} className="card p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label !mb-1 text-xs text-gray-500">Name</label>
          <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} className="input w-40" required />
        </div>
        {!editId && (
          <div>
            <label className="label !mb-1 text-xs text-gray-500">Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} className="input w-44" required />
          </div>
        )}
        {!editId && (
          <div>
            <label className="label !mb-1 text-xs text-gray-500">Password</label>
            <input type="password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} className="input w-36" required />
          </div>
        )}
        <div>
          <label className="label !mb-1 text-xs text-gray-500">Role</label>
          <select value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))} className="input">
            <option value="developer">Developer</option>
            <option value="manager">Manager</option>
            <option value="staff">Staff</option>
            <option value="client">Client</option>
          </select>
        </div>
        {form.role === 'client' && (
          <div>
            <label className="label !mb-1 text-xs text-gray-500">Company</label>
            <select value={form.client_id} onChange={e => setForm(f => ({...f, client_id: e.target.value}))} className="input w-48">
              <option value="">Select company…</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
            </select>
          </div>
        )}
        <button type="submit" className="btn btn-primary">{editId ? 'Update' : 'Add User'}</button>
        {editId && <button type="button" onClick={handleCancel} className="text-gray-500 text-sm px-2 py-1.5">Cancel</button>}
      </form>
      <div className="card p-4">
        <h3 className="font-semibold text-sm">Invite by Email — Same Company Sandbox (Domain)</h3>
        <p className="text-xs text-gray-500 mt-1">Invite teammates with same email domain and they’ll join your company sandbox automatically. Personal emails (gmail) get private workspace.</p>
        <form onSubmit={handleInvite} className="flex gap-2 mt-3">
          <input type="email" placeholder="teammate@acme.com.au" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} className="input flex-1" required />
          <select value={inviteRole} onChange={e=>setInviteRole(e.target.value)} className="input w-32">
            <option value="staff">Staff</option>
            <option value="manager">Manager</option>
            <option value="client">Client</option>
          </select>
          <button type="submit" className="btn btn-secondary">Invite</button>
        </form>
        {invites.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium">Pending invites</p>
            <ul className="text-xs mt-1 space-y-1">
              {invites.map(inv => <li key={inv.id} className="flex justify-between bg-gray-50 dark:bg-gray-700 px-2 py-1 rounded"><span>{inv.email} • {inv.role} • {inv.status}</span><span className="text-gray-400">{new Date(inv.expires_at).toLocaleDateString()}</span></li>)}
            </ul>
          </div>
        )}
      </div>
      {users.length === 0 ? (
        <div className="empty-state">
          <span className="text-4xl mb-2">🔐</span>
          <p className="text-gray-500 text-sm">No users yet</p>
          <p className="text-gray-400 text-xs mt-1">Add your first team member above.</p>
        </div>
      ) : (
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"><tr><th className="table-th">{column('users', 'name', 'Name')}</th><th className="table-th">{column('users', 'email', 'Email')}</th><th className="table-th">{column('users', 'role', 'Role')}</th><th className="table-th">{column('users', 'company', 'Company')}</th><th className="table-th">{column('users', 'created', 'Created')}</th><th className="table-th text-right">Actions</th></tr></thead>
          <tbody className="divide-y dark:divide-gray-700">{users.map(u => (
            <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
              <td className="table-td font-medium">{u.name}</td>
              <td className="table-td text-gray-500">{u.email}</td>
              <td className="table-td"><span className={`badge ${roleBadge[u.role] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>{u.role}</span></td>
              <td className="table-td text-gray-500">{u.client_id ? (clients.find(c => c.id === u.client_id)?.company || u.client_id) : '—'}</td>
              <td className="table-td text-gray-400">{u.created_at?.slice(0, 10)}</td>
              <td className="table-td text-right space-x-2">
                <button onClick={() => handleEdit(u)} className="text-lux-600 dark:text-lux-400 hover:underline text-xs font-medium">Edit</button>
                <button onClick={() => handleDelete(u.id)} className="text-red-500 hover:underline text-xs font-medium">Delete</button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      )}
    </div>
  );
}