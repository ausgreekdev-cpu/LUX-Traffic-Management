import { useState, useEffect, useMemo, useRef } from 'react';
import api from '../api';
import { useAppText } from '../context/AppText';

const EMPTY_FORM = {
  name: '', short_name: '', type: 'lga', email: '', phone: '', website: '', contact_person: '',
  council_type: 'shire', band: '', abn: '', suburb: '', postcode: '',
  mayor: '', deputy: '', ceo: '', executive_team: '', meeting_schedule: '', map_coordinates: '', zone: ''
};

const STAT_LABELS = {
  population: 'Population', electors: 'Electors', area_sqkm: 'Area (sq km)',
  dwellings: 'Dwellings', distance_km: 'Distance from Perth (km)',
  sealed_roads_km: 'Sealed roads (km)', unsealed_roads_km: 'Unsealed roads (km)',
  rates_levied: 'Rates levied ($)', revenue: 'Revenue ($)', employees: 'Employees'
};

const fmt = (n) => (n == null ? '-' : Number(n).toLocaleString('en-AU'));

export default function AuthorityList() {
  const { pageTitle } = useAppText();
  const [authorities, setAuthorities] = useState([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [user, setUser] = useState(null);
  const [importing, setImporting] = useState(false);
  const [slaForm, setSlaForm] = useState({ complexity: 'simple', assessment_days: 14, public_notice_days: 0, buffer_days: 0, requires_public_notice: false });
  const detailsCache = useRef({});

  useEffect(() => { api.authorities.list().then(setAuthorities); api.auth.me().then(setUser).catch(() => {}); }, []);

  const loadDetail = async (id) => {
    if (detailsCache.current[id]) {
      setSelected(detailsCache.current[id]);
      return;
    }
    const detail = await api.authorities.get(id);
    detailsCache.current[id] = detail;
    setSelected(detail);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const payload = { ...form, band: form.band === '' ? null : parseInt(form.band, 10) };
    const res = await api.authorities.create(payload);
    setAuthorities([...authorities, res]);
    setShowForm(false);
    setForm(EMPTY_FORM);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete authority and all its SLA rules?')) return;
    try { await api.authorities.delete(id); setAuthorities(authorities.filter(a => a.id !== id)); delete detailsCache.current[id]; if (selected?.id === id) setSelected(null); } catch (err) { alert(err.message); }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    try {
      const res = await api.authorities.importDirectory(file);
      alert(`Directory imported: ${res.inserted} new, ${res.updated} updated (${res.total} local governments)`);
      detailsCache.current = {};
      const list = await api.authorities.list();
      setAuthorities(list);
      if (selected) loadDetail(selected.id);
    } catch (err) {
      alert(err.message);
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const handleAddSLA = async (e) => {
    e.preventDefault();
    await api.authorities.createSLA(selected.id, { ...slaForm, authority_id: selected.id });
    delete detailsCache.current[selected.id];
    await loadDetail(selected.id);
  };

  const handleDeleteSLA = async (ruleId) => {
    await api.authorities.deleteSLA(selected.id, ruleId);
    delete detailsCache.current[selected.id];
    await loadDetail(selected.id);
  };

  const filtered = useMemo(() => authorities.filter(a => {
    const q = search.toLowerCase();
    return !q || a.name.toLowerCase().includes(q) || (a.short_name || '').toLowerCase().includes(q) || (a.zone || '').toLowerCase().includes(q);
  }), [authorities, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="page-header">{pageTitle('authorities', 'WA Authorities')}</h1>
          <p className="page-sub">Local governments, directories, SLAs and signalised intersections</p>
        </div>
        <div className="flex items-center gap-2">
          {user?.role === 'admin' && (
            <label className="btn bg-blue-600 hover:bg-blue-700 text-white cursor-pointer">
              {importing ? 'Importing...' : 'Import Directory PDF'}
              <input type="file" accept="application/pdf" className="hidden" onChange={handleImport} disabled={importing} />
            </label>
          )}
          <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">+ New Authority</button>
        </div>
      </div>
      <input
        placeholder="Search by name, short name or zone..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="input w-full"
      />
      {showForm && (
        <form onSubmit={handleCreate} className="card p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <input placeholder="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input" required />
            <input placeholder="Short Name" value={form.short_name} onChange={e => setForm({ ...form, short_name: e.target.value })} className="input" />
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="input">
              <option value="lga">LGA</option><option value="mrwa">MRWA</option><option value="pta">PTA</option><option value="hvs">HVS</option><option value="other">Other</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <input placeholder="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="input" />
            <input placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="input" />
            <input placeholder="Contact Person" value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })} className="input" />
          </div>
          <div className="grid grid-cols-4 gap-3">
            <select value={form.council_type} onChange={e => setForm({ ...form, council_type: e.target.value })} className="input">
              <option value="shire">Shire</option><option value="town">Town</option><option value="city">City</option>
            </select>
            <input placeholder="Band (1-4)" value={form.band} onChange={e => setForm({ ...form, band: e.target.value })} className="input" />
            <input placeholder="ABN" value={form.abn} onChange={e => setForm({ ...form, abn: e.target.value })} className="input" />
            <input placeholder="Zone" value={form.zone} onChange={e => setForm({ ...form, zone: e.target.value })} className="input" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <input placeholder="Mayor / President" value={form.mayor} onChange={e => setForm({ ...form, mayor: e.target.value })} className="input" />
            <input placeholder="Deputy" value={form.deputy} onChange={e => setForm({ ...form, deputy: e.target.value })} className="input" />
            <input placeholder="CEO" value={form.ceo} onChange={e => setForm({ ...form, ceo: e.target.value })} className="input" />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">Save</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn btn-ghost">Cancel</button>
          </div>
        </form>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-2">
          {filtered.map(a => (
            <div key={a.id} onClick={() => loadDetail(a.id)} className={`card p-3 cursor-pointer transition ${selected?.id === a.id ? 'ring-2 ring-lux-500' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{a.short_name || a.name}</span>
                  <span className="badge bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">{a.type?.toUpperCase()}</span>
                  {a.band && <span className="badge bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-200">Band {a.band}</span>}
                </div>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(a.id); }} className="text-red-500 hover:text-red-700 text-xs font-medium">Del</button>
              </div>
              <p className="text-xs text-gray-500 mt-1">{a.name}</p>
              {a.zone && <p className="text-xs text-gray-400 mt-0.5">{a.zone}</p>}
            </div>
          ))}
          {!filtered.length && (
            <div className="empty-state !py-8">
              <span className="text-3xl mb-2">🏛️</span>
              <p className="text-gray-500 text-sm">No authorities match</p>
            </div>
          )}
        </div>
        <div className="lg:col-span-2">
          {selected ? (
            <div className="space-y-4">
              <div className="card p-4">
                <h2 className="font-semibold text-lg">{selected.name}</h2>
                {selected.zone && <p className="text-xs text-gray-500">{selected.zone}{selected.band ? ` · Band ${selected.band}` : ''}</p>}
                <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                  <div><span className="text-gray-500">Type:</span> {selected.type?.toUpperCase()}</div>
                  <div><span className="text-gray-500">Email:</span> {selected.email || '-'}</div>
                  <div><span className="text-gray-500">Phone:</span> {selected.phone || '-'}</div>
                  <div><span className="text-gray-500">Contact:</span> {selected.contact_person || '-'}</div>
                  <div><span className="text-gray-500">Address:</span> {selected.address ? `${selected.address}${selected.suburb ? ', ' + selected.suburb : ''}${selected.postcode ? ' ' + selected.postcode : ''}` : '-'}</div>
                  <div><span className="text-gray-500">ABN:</span> {selected.abn || '-'}</div>
                </div>
              </div>
              {selected.zone && (
                <div className="card p-4">
                  <h3 className="font-semibold mb-2">Directory</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-gray-500">Mayor / President:</span> {selected.mayor || '-'}</div>
                    <div><span className="text-gray-500">Deputy:</span> {selected.deputy || '-'}</div>
                    <div><span className="text-gray-500">CEO:</span> {selected.ceo || '-'}</div>
                    <div><span className="text-gray-500">Meetings:</span> {selected.meeting_schedule || '-'}</div>
                    <div><span className="text-gray-500">Map:</span> {selected.map_coordinates || '-'}</div>
                    <div><span className="text-gray-500">Source:</span> {selected.directory_source || '-'}</div>
                  </div>
                  {selected.councillors?.length > 0 && (
                    <>
                      <h4 className="font-medium text-sm mt-3 mb-1">Councillors</h4>
                      <table className="w-full text-sm">
                        <thead><tr className="border-b text-left"><th className="py-1">Name</th><th>Ward</th><th>Term</th></tr></thead>
                        <tbody>{selected.councillors.map((c, i) => (
                          <tr key={i} className="border-b"><td className="py-1">{c.name}</td><td>{c.ward || '-'}</td><td>{c.term || '-'}</td></tr>
                        ))}</tbody>
                      </table>
                    </>
                  )}
                  {selected.executive_team && (
                    <>
                      <h4 className="font-medium text-sm mt-3 mb-1">Executive Team</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-300">{selected.executive_team}</p>
                    </>
                  )}
                  {selected.suburbs?.length > 0 && (
                    <>
                      <h4 className="font-medium text-sm mt-3 mb-1">Suburbs and Localities ({selected.suburbs.length})</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-300">{selected.suburbs.map(s => s.postcode ? `${s.name} ${s.postcode}` : s.name).join('; ')}</p>
                    </>
                  )}
                  {selected.statistics && (
                    <>
                      <h4 className="font-medium text-sm mt-3 mb-1">Council Statistics (2024-25)</h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                        {Object.entries(selected.statistics).map(([k, v]) => (
                          <div key={k}><span className="text-gray-500">{STAT_LABELS[k] || k}:</span> {fmt(v)}</div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
              <div className="card p-4">
                <h3 className="font-semibold mb-2">SLA Rules</h3>
                {selected.sla_rules?.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-gray-200 dark:border-gray-700"><th className="table-th">Complexity</th><th className="table-th">Assessment</th><th className="table-th">Notice</th><th className="table-th">Buffer</th><th className="table-th"></th></tr></thead>
                    <tbody className="divide-y dark:divide-gray-700">{selected.sla_rules.map(r => (
                      <tr key={r.id}><td className="table-td font-medium">{r.complexity}</td><td className="table-td">{r.assessment_days}d</td><td className="table-td">{r.public_notice_days}d</td><td className="table-td">{r.buffer_days}d</td><td className="table-td"><button onClick={() => handleDeleteSLA(r.id)} className="text-red-500 text-xs font-medium">Del</button></td></tr>
                    ))}</tbody>
                  </table>
                ) : <p className="text-sm text-gray-500">No SLA rules</p>}
                <form onSubmit={handleAddSLA} className="mt-3 flex gap-2 items-end">
                  <select value={slaForm.complexity} onChange={e => setSlaForm({ ...slaForm, complexity: e.target.value })} className="input !py-1">
                    <option value="simple">Simple</option><option value="standard">Standard</option><option value="complex">Complex</option><option value="complex_with_notice">Complex+Notice</option>
                  </select>
                  <input type="number" placeholder="Days" value={slaForm.assessment_days} onChange={e => setSlaForm({ ...slaForm, assessment_days: parseInt(e.target.value) || 0 })} className="input !py-1 w-20" />
                  <button type="submit" className="btn btn-primary btn-sm">Add</button>
                </form>
              </div>
              {selected.signalised_intersections?.length > 0 && (
                <div className="card p-4">
                  <h3 className="font-semibold mb-2">Signalised Intersections (30m Rule)</h3>
                  {selected.signalised_intersections.map(i => (
                    <div key={i.id} className="text-sm p-2 bg-gray-50 dark:bg-gray-700 rounded-lg mb-1">
                      {i.intersection_name} - {i.road_name || 'Unknown road'}, {i.suburb || 'Unknown suburb'} ({i.distance_meters}m)
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="empty-state">
              <span className="text-4xl mb-2">🏛️</span>
              <p className="text-gray-500 text-sm">Select an authority to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
