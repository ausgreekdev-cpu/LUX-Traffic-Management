import { useEffect, useState } from 'react';

export default function AdminOverride() {
  const [tenants, setTenants] = useState([]);
  const [selected, setSelected] = useState(null);
  const [ent, setEnt] = useState(null);
  const [featureKey, setFeatureKey] = useState('gis_generator');
  const [reason, setReason] = useState('');

  useEffect(() => {
    fetch('/api/admin/tenants', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json()).then(setTenants).catch(()=>{});
  }, []);

  const loadEnt = (id) => {
    setSelected(id);
    fetch(`/api/admin/tenants/${id}/entitlements`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json()).then(setEnt);
  };

  const grant = async () => {
    await fetch(`/api/admin/tenants/${selected}/override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify({ featureKey, reason, expiresAt: null }),
    });
    loadEnt(selected);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Developer Override — Delux TPM CRM</h1>
      <p className="text-sm text-gray-500 mb-6">Super-admin: bypass paywalls, grant features, extend trials, pause accounts. All actions are audited.</p>
      <div className="grid grid-cols-3 gap-6">
        <div className="border rounded p-4">
          <h2 className="font-semibold mb-2">Tenants</h2>
          {tenants.map(t => (
            <button key={t.id} onClick={() => loadEnt(t.id)} className={`block w-full text-left px-2 py-1 rounded ${selected===t.id?'bg-amber-100':''}`}>
              {t.name} — <span className="text-xs">{t.plan}</span> <span className={`text-xs ${t.status==='active'?'text-green-600':'text-red-600'}`}>{t.status}</span>
            </button>
          ))}
        </div>
        <div className="col-span-2 border rounded p-4">
          {!ent ? <p className="text-gray-500">Select a tenant</p> : (
            <>
              <h3 className="font-semibold">Entitlements: {ent.tenant?.name}</h3>
              <pre className="text-xs bg-gray-50 p-2 rounded mt-2 overflow-auto">{JSON.stringify(ent.features, null, 2)}</pre>
              <div className="mt-4 flex gap-2">
                <select value={featureKey} onChange={e=>setFeatureKey(e.target.value)} className="border rounded px-2 py-1">
                  <option value="gis_generator">gis_generator</option>
                  <option value="geojson_export">geojson_export</option>
                  <option value="wa_lga_packet">wa_lga_packet</option>
                  <option value="dispatch">dispatch</option>
                  <option value="mobile_offline">mobile_offline</option>
                  <option value="white_label">white_label</option>
                  <option value="api_access">api_access</option>
                  <option value="custom_domain">custom_domain</option>
                  <option value="sso_saml">sso_saml</option>
                  <option value="ai_autolayout">ai_autolayout</option>
                  <option value="active_projects">active_projects (limit)</option>
                  <option value="pdf_exports_per_month">pdf_exports_per_month (limit)</option>
                  <option value="storage_gb">storage_gb (limit)</option>
                  <option value="api_calls_per_day">api_calls_per_day (limit)</option>
                </select>
                <input placeholder="reason" value={reason} onChange={e=>setReason(e.target.value)} className="border rounded px-2 py-1 flex-1" />
                <button onClick={grant} className="bg-amber-500 text-white px-3 py-1 rounded">Grant</button>
              </div>
              <div className="mt-4">
                <h4 className="font-semibold text-sm">Overrides</h4>
                <ul className="text-xs">{ent.overrides?.map(o=> <li key={o.id}>{o.feature_key} = {o.limit_value} — {o.reason} (expires {o.expires_at||'never'})</li>)}</ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
