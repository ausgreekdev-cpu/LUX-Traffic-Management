import { useState, useEffect } from 'react';
import api from '../api';
import { useAppText } from '../context/AppText';

const CURRENCY = { AUD: '$', USD: '$', GBP: '£', EUR: '€', NZD: '$' };

export default function TimeTracking() {
  const { pageTitle, column, settings } = useAppText();
  const defaultRate = settings.default_rate || '150';
  const cur = () => CURRENCY[settings.default_currency] || `${settings.default_currency} `;
  const [entries, setEntries] = useState([]);
  const [costCodes, setCostCodes] = useState([]);
  const [tmps, setTmps] = useState([]);
  const [summary, setSummary] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [filterCode, setFilterCode] = useState('');
  const [form, setForm] = useState({ tmp_id: '', cost_code: '', description: '', duration_hours: '', rate_per_hour: '150', is_billable: true, date: new Date().toISOString().slice(0, 10) });

  useEffect(() => {
    if (form.rate_per_hour === '150' && defaultRate !== '150') {
      setForm(f => ({ ...f, rate_per_hour: defaultRate }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultRate]);

  useEffect(() => {
    api.timeEntries.costCodes().then(setCostCodes);
    api.tmps.list().then(r => setTmps(r.data));
    api.timeEntries.list().then(setEntries);
    api.timeEntries.summary({ period_days: 30 }).then(setSummary);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const res = await api.timeEntries.create({ ...form, duration_hours: parseFloat(form.duration_hours), rate_per_hour: parseFloat(form.rate_per_hour) });
    setEntries([{ ...form, id: res.id, total_cost: form.duration_hours * form.rate_per_hour }, ...entries]);
    setShowForm(false);
    setForm({ tmp_id: '', cost_code: '', description: '', duration_hours: '', rate_per_hour: defaultRate, is_billable: true, date: new Date().toISOString().slice(0, 10) });
    api.timeEntries.summary({ period_days: 30 }).then(setSummary);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete entry?')) return;
    await api.timeEntries.delete(id);
    setEntries(entries.filter(e => e.id !== id));
    api.timeEntries.summary({ period_days: 30 }).then(setSummary);
  };

  const filtered = filterCode ? entries.filter(e => e.cost_code === filterCode) : entries;
  const totalHours = filtered.reduce((sum, e) => sum + (e.duration_hours || 0), 0);
  const totalBillable = filtered.filter(e => e.is_billable).reduce((sum, e) => sum + (e.total_cost || e.duration_hours * (e.rate_per_hour || defaultRate)), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="page-header">{pageTitle('time-tracking', 'Time Tracking')}</h1>
          <p className="page-sub">Log hours and costs against TMPs and cost codes</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">+ Log Time</button>
      </div>

      {summary?.totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="card p-3 text-center">
            <div className="text-2xl font-bold text-blue-500">{summary.totals.total_entries || 0}</div>
            <div className="text-xs text-gray-500">Entries (30d)</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-2xl font-bold text-green-500">{(summary.totals.total_hours || 0).toFixed(1)}</div>
            <div className="text-xs text-gray-500">Total Hours</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-2xl font-bold text-lux-500">{cur()}{(summary.totals.billable_cost || 0).toFixed(0)}</div>
            <div className="text-xs text-gray-500">Billable Cost</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-2xl font-bold text-gray-500">{(summary.totals.non_billable_hours || 0).toFixed(1)}h</div>
            <div className="text-xs text-gray-500">Non-Billable</div>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <select value={form.tmp_id} onChange={e => setForm({ ...form, tmp_id: e.target.value })} className="input" required>
              <option value="">Select TMP</option>{tmps.map(t => <option key={t.id} value={t.id}>{t.reference} - {t.title}</option>)}
            </select>
            <select value={form.cost_code} onChange={e => setForm({ ...form, cost_code: e.target.value })} className="input" required>
              <option value="">Cost Code</option>{costCodes.map(c => <option key={c.code} value={c.code}>{c.code} - {c.name}</option>)}
            </select>
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="input" required />
          </div>
          <div className="grid grid-cols-4 gap-3">
            <input type="number" step="0.25" placeholder="Hours" value={form.duration_hours} onChange={e => setForm({ ...form, duration_hours: e.target.value })} className="input" required />
            <input type="number" placeholder="Rate/hr" value={form.rate_per_hour} onChange={e => setForm({ ...form, rate_per_hour: e.target.value })} className="input" />
            <input placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input" />
            <label className="flex items-center gap-2 text-sm px-3">
              <input type="checkbox" checked={form.is_billable} onChange={e => setForm({ ...form, is_billable: e.target.checked })} className="rounded" /> Billable
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">Save</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn btn-ghost">Cancel</button>
          </div>
        </form>
      )}

      <div className="flex gap-2">
        <select value={filterCode} onChange={e => setFilterCode(e.target.value)} className="input">
          <option value="">All Cost Codes</option>{costCodes.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
        </select>
        <span className="text-sm text-gray-500 self-center">{filtered.length} entries • {totalHours.toFixed(1)}h • {cur()}{totalBillable.toFixed(0)}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <span className="text-4xl mb-2">⏱️</span>
          <p className="text-gray-500 text-sm">No time entries yet</p>
          <p className="text-gray-400 text-xs mt-1">Log your first entry to start tracking billable hours.</p>
        </div>
      ) : (
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <tr><th className="table-th">{column('time', 'date', 'Date')}</th><th className="table-th">{column('time', 'tmp', 'TMP')}</th><th className="table-th">{column('time', 'cost_code', 'Cost Code')}</th><th className="table-th">{column('time', 'description', 'Description')}</th><th className="table-th">{column('time', 'hours', 'Hours')}</th><th className="table-th">{column('time', 'rate', 'Rate')}</th><th className="table-th">{column('time', 'cost', 'Cost')}</th><th className="table-th">{column('time', 'billable', 'Billable')}</th><th className="table-th"></th></tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-700">
            {filtered.map(e => (
              <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="table-td text-xs">{e.date}</td>
                <td className="table-td text-xs">{e.tmp_reference || '-'}</td>
                <td className="table-td text-xs font-mono">{e.cost_code}</td>
                <td className="table-td text-xs">{e.description || '-'}</td>
                <td className="table-td text-xs">{e.duration_hours}h</td>
                <td className="table-td text-xs">{cur()}{e.rate_per_hour || defaultRate}/h</td>
                <td className="table-td text-xs font-medium">{cur()}{(e.total_cost || e.duration_hours * (e.rate_per_hour || defaultRate)).toFixed(0)}</td>
                <td className="table-td">{e.is_billable ? <span className="text-green-500 text-xs">Yes</span> : <span className="text-gray-400 text-xs">No</span>}</td>
                <td className="table-td"><button onClick={() => handleDelete(e.id)} className="text-red-500 hover:underline text-xs font-medium">Del</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
      )}
    </div>
  );
}
