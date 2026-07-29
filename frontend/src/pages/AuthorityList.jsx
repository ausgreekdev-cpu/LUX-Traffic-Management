import React, { useState, useEffect } from 'react';
import api from '../api';

export default function AuthorityList() {
  const [authorities, setAuthorities] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', short_name: '', type: 'lga', email: '', phone: '', website: '', contact_person: '' });
  const [slaForm, setSlaForm] = useState({ complexity: 'simple', assessment_days: 14, public_notice_days: 0, buffer_days: 0, requires_public_notice: false });

  useEffect(() => { api.authorities.list().then(setAuthorities); }, []);

  const loadDetail = async (id) => {
    const detail = await api.authorities.get(id);
    setSelected(detail);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const res = await api.authorities.create(form);
    setAuthorities([...authorities, res]);
    setShowForm(false);
    setForm({ name: '', short_name: '', type: 'lga', email: '', phone: '', website: '', contact_person: '' });
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete authority and all its SLA rules?')) return;
    await api.authorities.delete(id);
    setAuthorities(authorities.filter(a => a.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  const handleAddSLA = async (e) => {
    e.preventDefault();
    await api.authorities.createSLA(selected.id, { ...slaForm, authority_id: selected.id });
    await loadDetail(selected.id);
  };

  const handleDeleteSLA = async (ruleId) => {
    await api.authorities.deleteSLA(selected.id, ruleId);
    await loadDetail(selected.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">WA Authorities</h1>
        <button onClick={() => setShowForm(!showForm)} className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm">+ New Authority</button>
      </div>
      {showForm && (
        <form onSubmit={handleCreate} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <input placeholder="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="px-3 py-2 border rounded-lg" required />
            <input placeholder="Short Name" value={form.short_name} onChange={e => setForm({ ...form, short_name: e.target.value })} className="px-3 py-2 border rounded-lg" />
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="px-3 py-2 border rounded-lg">
              <option value="lga">LGA</option><option value="mrwa">MRWA</option><option value="pta">PTA</option><option value="hvs">HVS</option><option value="other">Other</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <input placeholder="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="px-3 py-2 border rounded-lg" />
            <input placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="px-3 py-2 border rounded-lg" />
            <input placeholder="Contact Person" value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })} className="px-3 py-2 border rounded-lg" />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="bg-green-500 text-white px-3 py-2 rounded text-sm">Save</button>
            <button type="button" onClick={() => setShowForm(false)} className="bg-gray-300 px-3 py-2 rounded text-sm">Cancel</button>
          </div>
        </form>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-2">
          {authorities.map(a => (
            <div key={a.id} onClick={() => loadDetail(a.id)} className={`bg-white dark:bg-gray-800 rounded-lg shadow p-3 cursor-pointer transition ${selected?.id === a.id ? 'ring-2 ring-amber-500' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold">{a.short_name || a.name}</span>
                  <span className="ml-2 text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">{a.type?.toUpperCase()}</span>
                </div>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(a.id); }} className="text-red-500 hover:text-red-700 text-xs">Del</button>
              </div>
              <p className="text-xs text-gray-500 mt-1">{a.name}</p>
            </div>
          ))}
        </div>
        <div className="lg:col-span-2">
          {selected ? (
            <div className="space-y-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <h2 className="font-semibold text-lg">{selected.name}</h2>
                <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                  <div><span className="text-gray-500">Type:</span> {selected.type?.toUpperCase()}</div>
                  <div><span className="text-gray-500">Email:</span> {selected.email || '-'}</div>
                  <div><span className="text-gray-500">Phone:</span> {selected.phone || '-'}</div>
                  <div><span className="text-gray-500">Contact:</span> {selected.contact_person || '-'}</div>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <h3 className="font-semibold mb-2">SLA Rules</h3>
                {selected.sla_rules?.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead><tr className="border-b"><th className="text-left py-2">Complexity</th><th className="text-left py-2">Assessment</th><th className="text-left py-2">Notice</th><th className="text-left py-2">Buffer</th><th className="py-2"></th></tr></thead>
                    <tbody>{selected.sla_rules.map(r => (
                      <tr key={r.id} className="border-b"><td className="py-2 font-medium">{r.complexity}</td><td>{r.assessment_days}d</td><td>{r.public_notice_days}d</td><td>{r.buffer_days}d</td><td><button onClick={() => handleDeleteSLA(r.id)} className="text-red-500 text-xs">Del</button></td></tr>
                    ))}</tbody>
                  </table>
                ) : <p className="text-sm text-gray-500">No SLA rules</p>}
                <form onSubmit={handleAddSLA} className="mt-3 flex gap-2 items-end">
                  <select value={slaForm.complexity} onChange={e => setSlaForm({ ...slaForm, complexity: e.target.value })} className="px-2 py-1 border rounded text-sm">
                    <option value="simple">Simple</option><option value="standard">Standard</option><option value="complex">Complex</option><option value="complex_with_notice">Complex+Notice</option>
                  </select>
                  <input type="number" placeholder="Days" value={slaForm.assessment_days} onChange={e => setSlaForm({ ...slaForm, assessment_days: parseInt(e.target.value) || 0 })} className="w-20 px-2 py-1 border rounded text-sm" />
                  <button type="submit" className="bg-green-500 text-white px-2 py-1 rounded text-sm">Add</button>
                </form>
              </div>
              {selected.signalised_intersections?.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                  <h3 className="font-semibold mb-2">Signalised Intersections (30m Rule)</h3>
                  {selected.signalised_intersections.map(i => (
                    <div key={i.id} className="text-sm p-2 bg-gray-50 dark:bg-gray-700 rounded mb-1">
                      {i.intersection_name} - {i.road_name || 'Unknown road'}, {i.suburb || 'Unknown suburb'} ({i.distance_meters}m)
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : <p className="text-gray-500 text-center py-8">Select an authority to view details</p>}
        </div>
      </div>
    </div>
  );
}
