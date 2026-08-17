import { useState } from 'react';
import api from '../../api';

export default function DomainManager({ domains, onChanged, onError }) {
  const [domain, setDomain] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!domain.trim()) return;
    setBusy(true);
    try {
      await api.branding.addDomain({ domain: domain.trim() });
      setDomain('');
      onChanged();
    } catch (err) {
      onError(err.message);
    }
    setBusy(false);
  };

  const remove = async (id) => {
    if (!confirm('Remove this domain mapping?')) return;
    try {
      await api.branding.deleteDomain(id);
      onChanged();
    } catch (err) {
      onError(err.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h3 className="font-semibold">Custom domains / CNAME</h3>
        <p className="text-xs text-gray-500 mt-1 mb-3">
          Record custom portal domains (e.g. <code>traffic.citycouncil.gov.au</code>). Netlify handles DNS/CNAME and HTTPS — add the mapping here so it is visible in the platform.
        </p>
        <div className="flex gap-2">
          <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="traffic.citycouncil.gov.au" className="input flex-1" />
          <button onClick={add} disabled={busy || !domain.trim()} className="btn btn-primary">Add domain</button>
        </div>
        {domains.length > 0 && (
          <ul className="mt-3 divide-y dark:divide-gray-700">
            {domains.map(d => (
              <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                <div>
                  <p className="text-sm font-medium font-mono">{d.domain}</p>
                  <p className="text-xs text-gray-500">
                    Status: <span className={d.status === 'active' ? 'text-green-600' : 'text-amber-600'}>{d.status}</span>
                    {d.is_primary ? ' · Primary' : ''}
                  </p>
                </div>
                <button onClick={() => remove(d.id)} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
