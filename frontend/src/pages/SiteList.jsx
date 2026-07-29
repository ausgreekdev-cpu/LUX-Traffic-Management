import React, { useState, useEffect } from 'react';
import api from '../api';

export default function SiteList() {
  const [sites, setSites] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', road_name: '', suburb: '', state: 'WA', postcode: '', description: '' });

  useEffect(() => { api.sites.list().then(setSites); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const res = await api.sites.create(form);
    setSites([res, ...sites]);
    setForm({ name: '', road_name: '', suburb: '', state: 'WA', postcode: '', description: '' });
    setShowForm(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sites</h1>
        <button onClick={() => setShowForm(!showForm)} className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm">+ New Site</button>
      </div>
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <input placeholder="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="px-3 py-2 border rounded-lg" required />
            <input placeholder="Road Name" value={form.road_name} onChange={e => setForm({ ...form, road_name: e.target.value })} className="px-3 py-2 border rounded-lg" />
            <input placeholder="Suburb" value={form.suburb} onChange={e => setForm({ ...form, suburb: e.target.value })} className="px-3 py-2 border rounded-lg" />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="bg-green-500 text-white px-3 py-2 rounded text-sm">Save</button>
            <button type="button" onClick={() => setShowForm(false)} className="bg-gray-300 px-3 py-2 rounded text-sm">Cancel</button>
          </div>
        </form>
      )}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 dark:bg-gray-700"><tr><th className="text-left px-4 py-3">Name</th><th className="text-left px-4 py-3">Road</th><th className="text-left px-4 py-3">Suburb</th><th className="text-left px-4 py-3">State</th></tr></thead>
          <tbody className="divide-y dark:divide-gray-700">
            {sites.map(s => (<tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700"><td className="px-4 py-3 font-medium">{s.name}</td><td className="px-4 py-3 text-gray-500">{s.road_name || '-'}</td><td className="px-4 py-3 text-gray-500">{s.suburb || '-'}</td><td className="px-4 py-3 text-gray-500">{s.state}</td></tr>))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
