import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api';

export default function TMPForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const [form, setForm] = useState({ title: '', plan_type: 'temporary', complexity: 'standard', status: 'draft', description: '', project_id: '', site_id: '', start_date: '', end_date: '', work_type: 'general', authority_id: '' });
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [authorities, setAuthorities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [missingStages, setMissingStages] = useState([]);
  const [complianceViolations, setComplianceViolations] = useState([]);
  const [complexityTouched, setComplexityTouched] = useState(false);
  const [riskPreview, setRiskPreview] = useState(null);
  const [riskLoading, setRiskLoading] = useState(false);

  const suggestComplexity = (type, start, end) => {
    if (type === 'event') return 'complex';
    if (type === 'permanent') return 'standard';
    if (!start || !end) return 'standard';
    const days = Math.round((new Date(end) - new Date(start)) / 86400000);
    if (days <= 3) return 'simple';
    if (days >= 14) return 'complex';
    return 'standard';
  };

  const loadRiskPreview = (plan_type, start_date, end_date, site_id) => {
    const params = { plan_type, site_id: site_id || '' };
    if (start_date) params.start_date = start_date;
    if (end_date) params.end_date = end_date;
    setRiskLoading(true);
    api.tmps.riskPreview(params).then(setRiskPreview).catch(() => {}).finally(() => setRiskLoading(false));
  };

  const handleFieldChange = (key, value) => {
    const next = { ...form, [key]: value };
    if (!complexityTouched && (key === 'plan_type' || key === 'start_date' || key === 'end_date' || key === 'site_id')) {
      next.complexity = suggestComplexity(next.plan_type, next.start_date, next.end_date);
    }
    setForm(next);
    if (key === 'plan_type' || key === 'start_date' || key === 'end_date' || key === 'site_id') {
      loadRiskPreview(next.plan_type, next.start_date, next.end_date, next.site_id);
    }
  };

  useEffect(() => {
    Promise.all([api.projects.list(), api.sites.list(), api.authorities.list()]).then(([p, s, a]) => { setProjects(p); setSites(s); setAuthorities(a.data || a || []); });
    if (isEdit) {
      api.tmps.get(id).then(tmp => {
        setForm({ title: tmp.title || '', plan_type: tmp.plan_type || 'temporary', complexity: tmp.complexity || 'standard', status: tmp.status || 'draft', description: tmp.description || '', project_id: tmp.project_id || '', site_id: tmp.site_id || '', start_date: tmp.start_date || '', end_date: tmp.end_date || '', work_type: tmp.work_type || 'general', authority_id: tmp.authority_id || '' });
        loadRiskPreview(tmp.plan_type || 'temporary', tmp.start_date || '', tmp.end_date || '', tmp.site_id || '');
        return tmp;
      })
        .then(() => api.workflows.checklist('tmp', id))
        .then(cl => setMissingStages(cl.data.filter(s => !s.is_optional && !s.is_done).map(s => s.name)))
        .then(() => api.compliance.violations(id).then(r => setComplianceViolations(r.violations)).catch(() => {}))
        .catch(() => {})
        .finally(() => setLoading(false));
    } else setLoading(false);
  }, [id, isEdit]);

  const statusBlocks = (['approved', 'completed'].includes(form.status)) && missingStages.length > 0;
  const submitBlocks = form.status === 'submitted' && complianceViolations.length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (statusBlocks) { alert('Complete the required workflow stages first: ' + missingStages.join(', ')); return; }
    if (submitBlocks) { alert('Compliance violations must be resolved before submission: ' + complianceViolations.join('; ')); return; }
    setSaving(true);
    const payload = { ...form, complexity_source: complexityTouched ? 'manual' : 'auto' };
    try {
      if (isEdit) { await api.tmps.update(id, payload); navigate(`/tmps/${id}`); }
      else { const res = await api.tmps.create(payload); navigate(`/tmps/${res.id}`); }
    } catch (err) { alert(err.message); } finally { setSaving(false); }
  };

  return (
    <div className="max-w-2xl">
      <Link to="/tmps" className="text-sm text-gray-500 hover:text-lux-600 dark:hover:text-lux-400">← Back</Link>
      <h1 className="page-header mt-2 mb-4">{isEdit ? 'Edit TMP' : 'New TMP'}</h1>
      {loading ? <p className="text-gray-500">Loading...</p> : (
        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div>
            <label className="label">Title *</label>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="input w-full" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Work type</label>
              <select value={form.work_type} onChange={e => setForm({ ...form, work_type: e.target.value })} className="input w-full">
                <option value="general">General works</option>
                <option value="maintenance">Maintenance</option>
                <option value="event">Event</option>
                <option value="footpath_utility">Footpath / utility</option>
                <option value="skip_bin_hoarding">Skip bin / hoarding</option>
              </select>
            </div>
            <div>
              <label className="label">Authority / council</label>
              <select value={form.authority_id} onChange={e => setForm({ ...form, authority_id: e.target.value })} className="input w-full">
                <option value="">None (state rules only)</option>
                {authorities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Type</label>
              <select value={form.plan_type} onChange={e => handleFieldChange('plan_type', e.target.value)} className="input w-full">
                <option value="temporary">Temporary</option><option value="permanent">Permanent</option><option value="event">Event</option>
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="input w-full">
                <option value="draft">Draft</option><option value="submitted">Submitted</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <div className="p-4 border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Complexity triage</label>
              {!complexityTouched && (
                <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Auto-suggested</span>
              )}
            </div>
            <p className="text-xs text-gray-500">Complexity selects the workflow stage set and SLA variant for this TMP. Auto-suggested from site data, type and duration; you can override it manually — overrides are logged on the TMP.</p>
            <select value={form.complexity} onChange={e => { setComplexityTouched(true); setForm({ ...form, complexity: e.target.value }); }} className="input w-full">
              <option value="simple">Simple</option>
              <option value="standard">Standard</option>
              <option value="complex">Complex</option>
              <option value="complex_with_notice">Complex + public notice</option>
            </select>
          </div>

          <div className="p-4 border border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Risk assessment</label>
              {riskLoading && <span className="text-xs text-gray-500">computing…</span>}
            </div>
            {riskPreview ? (
              <>
                <p className="text-xs text-gray-500">Consequence × Likelihood (1-5 each) from site data, plan type and duration. Band gates mitigation requirements.</p>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-gray-600 dark:text-gray-300">C <b>{riskPreview.risk.consequence}</b> × L <b>{riskPreview.risk.likelihood}</b> = <b className="text-lg">{riskPreview.risk.score}</b></span>
                  <span className={`badge font-medium ${riskPreview.risk.band === 'extreme' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : riskPreview.risk.band === 'high' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' : riskPreview.risk.band === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'}`}>
                    {riskPreview.risk.band.toUpperCase()}
                  </span>
                  {riskPreview.complexity_suggestion !== form.complexity && (
                    <span className="text-xs text-gray-500">triage suggests <b>{riskPreview.complexity_suggestion}</b></span>
                  )}
                </div>
                {riskPreview.risk.mitigations.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {riskPreview.risk.mitigations.map((m, i) => (
                      <span key={i} className="badge bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-700">{m}</span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-gray-500">Pick a site and dates to compute the risk score.</p>
            )}
          </div>
          {statusBlocks && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl text-sm text-amber-800 dark:text-amber-300">
              Cannot mark as <b>{form.status}</b> — required workflow stages still incomplete: <b>{missingStages.join(', ')}</b>. Tick them off on the TMP's workflow checklist first.
            </div>
          )}
          {submitBlocks && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-800 dark:text-red-300">
              Cannot mark as <b>submitted</b> — compliance violations must be resolved first:
              <ul className="list-disc pl-5 mt-1"><li>{complianceViolations.join('</li><li>')}</li></ul>
              Resolve them on the TMP's Traffic Guidance Scheme & Compliance panel.
            </div>
          )}
          <div>
            <label className="label">Description</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input w-full" rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Project</label>
              <select value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })} className="input w-full">
                <option value="">None</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Site</label>
              <select value={form.site_id} onChange={e => handleFieldChange('site_id', e.target.value)} className="input w-full">
                <option value="">None</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Start Date</label><input type="date" value={form.start_date} onChange={e => handleFieldChange('start_date', e.target.value)} className="input w-full" /></div>
            <div><label className="label">End Date</label><input type="date" value={form.end_date} onChange={e => handleFieldChange('end_date', e.target.value)} className="input w-full" /></div>
          </div>
          <button type="submit" disabled={saving} className="btn btn-primary">{saving ? 'Saving...' : 'Save'}</button>
        </form>
      )}
    </div>
  );
}
