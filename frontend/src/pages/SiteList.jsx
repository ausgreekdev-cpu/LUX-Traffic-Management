import { useState, useEffect } from 'react';
import api from '../api';
import { useAppText } from '../context/AppText';

export default function SiteList() {
  const { pageTitle, column } = useAppText();
  const [sites, setSites] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', road_name: '', suburb: '', state: 'WA', postcode: '', description: '', road_class: '', speed_limit: '', aadt: '', pedestrian_activity: '', cyclist_activity: '', rail_corridor: false, school_zone: false });

  useEffect(() => { api.sites.list().then(setSites); }, []);

  const resetForm = () => { setForm({ name: '', road_name: '', suburb: '', state: 'WA', postcode: '', description: '', road_class: '', speed_limit: '', aadt: '', pedestrian_activity: '', cyclist_activity: '', rail_corridor: false, school_zone: false }); setEditId(null); setShowForm(false); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = { ...form, speed_limit: form.speed_limit === '' ? undefined : Number(form.speed_limit), aadt: form.aadt === '' ? undefined : Number(form.aadt), rail_corridor: !!form.rail_corridor, school_zone: !!form.school_zone };
    if (editId) {
      await api.sites.update(editId, payload);
    } else {
      const res = await api.sites.create(payload);
      setSites([res, ...sites]);
    }
    resetForm();
    api.sites.list().then(setSites);
  };

  const handleEdit = (s) => {
    setEditId(s.id);
    setForm({ name: s.name, road_name: s.road_name || '', suburb: s.suburb || '', state: s.state || 'WA', postcode: s.postcode || '', description: s.description || '', road_class: s.road_class || '', speed_limit: s.speed_limit ?? '', aadt: s.aadt ?? '', pedestrian_activity: s.pedestrian_activity || '', cyclist_activity: s.cyclist_activity || '', rail_corridor: !!s.rail_corridor, school_zone: !!s.school_zone });
    setShowForm(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="page-header">{pageTitle('sites', 'Sites')}</h1>
          <p className="page-sub">Road locations and characteristics used in risk assessments</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">+ New Site</button>
      </div>
      {showForm && (
        <form onSubmit={handleSubmit} className="card p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <input placeholder="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input" required />
            <input placeholder="Road Name" value={form.road_name} onChange={e => setForm({ ...form, road_name: e.target.value })} className="input" />
            <input placeholder="Suburb" value={form.suburb} onChange={e => setForm({ ...form, suburb: e.target.value })} className="input" />
          </div>
          <div className="grid grid-cols-4 gap-3">
            <select value={form.road_class} onChange={e => setForm({ ...form, road_class: e.target.value })} className="input">
              <option value="">Road class</option>
              {['local', 'distributor', 'collector', 'arterial', 'highway', 'freeway'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="number" placeholder="Speed limit (km/h)" value={form.speed_limit} onChange={e => setForm({ ...form, speed_limit: e.target.value })} className="input" />
            <input type="number" placeholder="AADT (veh/day)" value={form.aadt} onChange={e => setForm({ ...form, aadt: e.target.value })} className="input" />
            <select value={form.pedestrian_activity} onChange={e => setForm({ ...form, pedestrian_activity: e.target.value })} className="input">
              <option value="">Pedestrian activity</option>
              {['low', 'medium', 'high'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={form.cyclist_activity} onChange={e => setForm({ ...form, cyclist_activity: e.target.value })} className="input">
              <option value="">Cyclist activity</option>
              {['low', 'medium', 'high'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm px-3">
              <input type="checkbox" checked={form.rail_corridor} onChange={e => setForm({ ...form, rail_corridor: e.target.checked })} className="rounded" /> Rail corridor
            </label>
            <label className="flex items-center gap-2 text-sm px-3">
              <input type="checkbox" checked={form.school_zone} onChange={e => setForm({ ...form, school_zone: e.target.checked })} className="rounded" /> School zone
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">{editId ? 'Update' : 'Save'}</button>
            <button type="button" onClick={resetForm} className="btn btn-ghost">Cancel</button>
          </div>
        </form>
      )}
      {sites.length === 0 ? (
        <div className="empty-state">
          <span className="text-4xl mb-2">📍</span>
          <p className="text-gray-500 text-sm">No sites yet</p>
          <p className="text-gray-400 text-xs mt-1">Create your first site to start building TMPs.</p>
        </div>
      ) : (
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"><tr><th className="table-th">{column('sites', 'name', 'Name')}</th><th className="table-th">{column('sites', 'road', 'Road')}</th><th className="table-th">{column('sites', 'class', 'Class')}</th><th className="table-th">{column('sites', 'speed', 'Speed')}</th><th className="table-th">{column('sites', 'aadt', 'AADT')}</th><th className="table-th">{column('sites', 'suburb', 'Suburb')}</th><th className="table-th"></th></tr></thead>
          <tbody className="divide-y dark:divide-gray-700">
            {sites.map(s => (<tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
              <td className="table-td font-medium">{s.name}</td>
              <td className="table-td text-gray-500">{s.road_name || '-'}</td>
              <td className="table-td text-gray-500">{s.road_class || '-'}{s.rail_corridor ? ' 🚆' : ''}{s.school_zone ? ' 🏫' : ''}</td>
              <td className="table-td text-gray-500">{s.speed_limit ? `${s.speed_limit} km/h` : '-'}</td>
              <td className="table-td text-gray-500">{s.aadt ?? '-'}</td>
              <td className="table-td text-gray-500">{s.suburb || '-'}</td>
              <td className="table-td text-right space-x-2"><button onClick={() => handleEdit(s)} className="text-lux-600 dark:text-lux-400 hover:underline text-xs font-medium">Edit</button></td>
            </tr>))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
