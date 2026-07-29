import React, { useState, useEffect } from 'react';
import api from '../api';

export default function UsersList() {
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
      <h1 className="text-2xl font-bold">User Management</h1>
      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-gray-500 block">Name</label>
          <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} className="border rounded px-2 py-1.5 text-sm w-40" required />
        </div>
        {!editId && (
          <div>
            <label className="text-xs text-gray-500 block">Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} className="border rounded px-2 py-1.5 text-sm w-44" required />
          </div>
        )}
        {!editId && (
          <div>
            <label className="text-xs text-gray-500 block">Password</label>
            <input type="password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} className="border rounded px-2 py-1.5 text-sm w-36" required />
          </div>
        )}
        <div>
          <label className="text-xs text-gray-500 block">Role</label>
          <select value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))} className="border rounded px-2 py-1.5 text-sm">
            <option value="admin">Admin</option>
            <option value="planner">Planner</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
        <button type="submit" className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded text-sm">{editId ? 'Update' : 'Add User'}</button>
        {editId && <button type="button" onClick={handleCancel} className="text-gray-500 text-sm px-2 py-1.5">Cancel</button>}
      </form>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <table className="w-full text-sm">
          <thead><tr className="border-b"><th className="text-left p-3">Name</th><th className="text-left p-3">Email</th><th className="text-left p-3">Role</th><th className="text-left p-3">Created</th><th className="text-right p-3">Actions</th></tr></thead>
          <tbody>{users.map(u => (
            <tr key={u.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-700">
              <td className="p-3">{u.name}</td>
              <td className="p-3 text-gray-500">{u.email}</td>
              <td className="p-3"><span className={`text-xs px-2 py-0.5 rounded ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : u.role === 'planner' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{u.role}</span></td>
              <td className="p-3 text-gray-400">{u.created_at?.slice(0, 10)}</td>
              <td className="p-3 text-right space-x-2">
                <button onClick={() => handleEdit(u)} className="text-amber-600 hover:underline text-xs">Edit</button>
                <button onClick={() => handleDelete(u.id)} className="text-red-500 hover:underline text-xs">Delete</button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}