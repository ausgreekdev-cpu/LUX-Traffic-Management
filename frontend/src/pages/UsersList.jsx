import { useState, useEffect } from 'react';
import api from '../api';
import { useAppText } from '../context/AppText';

export default function UsersList() {
  const { pageTitle, column } = useAppText();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ email: '', password: '', name: '', role: 'planner' });
  const [editId, setEditId] = useState(null);

  const loadUsers = () => api.users.list().then(setUsers);
  useEffect(() => { loadUsers().finally(() => setLoading(false)); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editId) {
        await api.users.update(editId, { name: form.name, role: form.role });
      } else {
        await api.users.create(form);
      }
      setForm({ email: '', password: '', name: '', role: 'planner' });
      setEditId(null);
      await loadUsers();
    } catch (err) { alert(err.message); }
  };

  const handleEdit = (u) => {
    setEditId(u.id);
    setForm({ email: u.email, password: '', name: u.name, role: u.role });
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this user?')) return;
    try { await api.users.delete(id); await loadUsers(); } catch (err) { alert(err.message); }
  };

  const handleCancel = () => {
    setEditId(null);
    setForm({ email: '', password: '', name: '', role: 'planner' });
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
            <option value="admin">Admin</option>
            <option value="planner">Planner</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
        <button type="submit" className="btn btn-primary">{editId ? 'Update' : 'Add User'}</button>
        {editId && <button type="button" onClick={handleCancel} className="text-gray-500 text-sm px-2 py-1.5">Cancel</button>}
      </form>
      {users.length === 0 ? (
        <div className="empty-state">
          <span className="text-4xl mb-2">🔐</span>
          <p className="text-gray-500 text-sm">No users yet</p>
          <p className="text-gray-400 text-xs mt-1">Add your first team member above.</p>
        </div>
      ) : (
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"><tr><th className="table-th">{column('users', 'name', 'Name')}</th><th className="table-th">{column('users', 'email', 'Email')}</th><th className="table-th">{column('users', 'role', 'Role')}</th><th className="table-th">{column('users', 'created', 'Created')}</th><th className="table-th text-right">Actions</th></tr></thead>
          <tbody className="divide-y dark:divide-gray-700">{users.map(u => (
            <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
              <td className="table-td font-medium">{u.name}</td>
              <td className="table-td text-gray-500">{u.email}</td>
              <td className="table-td"><span className={`badge ${u.role === 'admin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' : u.role === 'planner' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>{u.role}</span></td>
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