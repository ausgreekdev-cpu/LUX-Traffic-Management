import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api';
import WorkflowChecklist from '../components/WorkflowChecklist';
import { PERMIT_BADGES, FEE_BADGES, badgeFor } from '../utils/status';
import { useAppText } from '../context/AppText';

export default function PermitDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { nav, section, status, complexity } = useAppText();
  const [permit, setPermit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feeForm, setFeeForm] = useState({ fee_type: 'application_fee', amount: '', status: 'pending' });
  const [agentRuns, setAgentRuns] = useState([]);

  const loadPermit = () => Promise.all([
    api.permits.get(id),
    api.agents.runs({ entity_type: 'permit', entity_id: id }).then(r => r.data)
  ]).then(([p, runs]) => { setPermit(p); setAgentRuns(runs); });
  useEffect(() => { loadPermit().finally(() => setLoading(false)); }, [id]);

  const handleStatusChange = async (newStatus) => {
    try {
      await api.permits.update(id, { status: newStatus });
      await loadPermit();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleResolveTrigger = async (triggerId) => {
    await api.permits.resolveTrigger(id, triggerId);
    await loadPermit();
  };

  const handleDelete = async () => {
    if (!confirm('Delete this permit?')) return;
    await api.permits.delete(id);
    navigate('/permits');
  };

  const handleAddFee = async (e) => {
    e.preventDefault();
    try {
      await api.permits.createFee(id, { ...feeForm, amount: parseFloat(feeForm.amount) });
      setFeeForm({ fee_type: 'application_fee', amount: '', status: 'pending' });
      await loadPermit();
    } catch (err) { alert(err.message); }
  };

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!permit) return <p className="text-red-500">Permit not found</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link to="/permits" className="text-sm text-gray-500 hover:text-lux-600 dark:hover:text-lux-400">← Back to {nav('/permits', 'Permits')}</Link>
          <h1 className="page-header mt-1">{permit.authority_short || permit.authority_name} - {section('permit_details', 'Permit Details')}</h1>
          <p className="text-gray-500 text-sm">{permit.tmp_reference} • {complexity(permit.complexity)}</p>
        </div>
        <div className="flex gap-2">
          {permit.status !== 'approved' && permit.status !== 'cancelled' && permit.status !== 'completed' && (
            <select value={permit.status} onChange={e => handleStatusChange(e.target.value)} className="input">
              {['draft', 'submitted', 'under_review', 'approved', 'rejected', 'cancelled', 'completed'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          )}
          <Link to={`/permits/${id}/edit`} className="btn btn-primary">Edit</Link>
          <button onClick={handleDelete} className="btn btn-danger">Delete</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-4">
            <h2 className="font-semibold mb-2">{section('permit_details', 'Permit Details')}</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Status:</span> <span className={`badge ml-1 ${badgeFor(PERMIT_BADGES, permit.status)}`}>{status(permit.status)}</span></div>
              <div><span className="text-gray-500">Authority:</span> <span className="ml-1">{permit.authority_name} ({permit.authority_type?.toUpperCase()})</span></div>
              <div><span className="text-gray-500">Complexity:</span> <span className="ml-1">{complexity(permit.complexity)}</span></div>
              <div><span className="text-gray-500">Submitted:</span> <span className="ml-1">{permit.submission_date || 'Not submitted'}</span></div>
              <div><span className="text-gray-500">Approved:</span> <span className="ml-1">{permit.approval_date || 'Not approved'}</span></div>
              <div><span className="text-gray-500">Expiry:</span> <span className="ml-1">{permit.expiry_date || 'N/A'}</span></div>
              <div><span className="text-gray-500">Within 30m Signals:</span> <span className="ml-1 font-bold">{permit.is_within_30m_signals ? 'YES' : 'No'}</span></div>
              <div><span className="text-gray-500">MRWA Required:</span> <span className="ml-1 font-bold">{permit.requires_mrwa ? 'YES' : 'No'}</span></div>
            </div>
            {permit.rejection_reason && (
              <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-700 dark:text-red-400">
                <strong>Rejection Reason:</strong> {permit.rejection_reason}
              </div>
            )}
          </div>

          {permit.sla && (
            <div className="card p-4">
              <h2 className="font-semibold mb-2">{section('permit_sla', 'SLA Information')}</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500">Assessment:</span> <span className="ml-1">{permit.sla.assessment_days} days</span></div>
                <div><span className="text-gray-500">Public Notice:</span> <span className="ml-1">{permit.sla.public_notice_days} days</span></div>
                <div><span className="text-gray-500">Buffer:</span> <span className="ml-1">{permit.sla.buffer_days} days</span></div>
                <div><span className="text-gray-500">Total SLA:</span> <span className="ml-1 font-bold">{permit.sla.total_days} days</span></div>
                <div><span className="text-gray-500">Expected Decision:</span> <span className="ml-1">{permit.sla.expected_date}</span></div>
                <div><span className="text-gray-500">Notice Required:</span> <span className="ml-1">{permit.sla.requires_public_notice ? 'Yes' : 'No'}</span></div>
              </div>
            </div>
          )}

          <div className="card p-4">
            <h2 className="font-semibold mb-2">{section('permit_fees', 'Fees')} ({(permit.fees||[]).length})</h2>
            {(permit.fees||[]).length > 0 && (
              <div className="overflow-x-auto">
              <table className="w-full text-sm mb-3">
                <thead className="border-b border-gray-200 dark:border-gray-700"><tr><th className="table-th">Type</th><th className="table-th">Amount</th><th className="table-th">Status</th></tr></thead>
                <tbody className="divide-y dark:divide-gray-700">{permit.fees.map(f => (
                  <tr key={f.id}><td className="table-td">{f.fee_type.replace(/_/g, ' ')}</td><td className="table-td">${f.amount.toFixed(2)}</td><td className="table-td"><span className={`badge ${badgeFor(FEE_BADGES, f.status)}`}>{f.status}</span></td></tr>
                ))}</tbody>
              </table>
              </div>
            )}
            <form onSubmit={handleAddFee} className="flex items-end gap-2 border-t border-gray-200 dark:border-gray-700 pt-3 flex-wrap">
              <div>
                <label className="text-xs text-gray-500 block">Type</label>
                <select value={feeForm.fee_type} onChange={e => setFeeForm(f => ({...f, fee_type: e.target.value}))} className="input" required>
                  {['application_fee','assessment_fee','daily_occupancy_fee','lane_usage_fee','bond','other'].map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block">Amount ($)</label>
                <input type="number" step="0.01" min="0" value={feeForm.amount} onChange={e => setFeeForm(f => ({...f, amount: e.target.value}))} className="input w-28" required />
              </div>
              <div>
                <label className="text-xs text-gray-500 block">Status</label>
                <select value={feeForm.status} onChange={e => setFeeForm(f => ({...f, status: e.target.value}))} className="input">
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                  <option value="refunded">Refunded</option>
                  <option value="waived">Waived</option>
                </select>
              </div>
              <button type="submit" className="btn btn-primary">Add Fee</button>
            </form>
          </div>
          <WorkflowChecklist entityType="permit" entityId={id} />
        </div>

        <div className="space-y-4">
          {permit.triggers?.length > 0 && (
            <div className="card p-4">
              <h2 className="font-semibold mb-2">{section('permit_triggers', 'Workflow Triggers')}</h2>
              {permit.triggers.map(t => (
                <div key={t.id} className={`p-2 rounded-lg mb-2 text-sm ${t.is_resolved ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                  <p className={t.is_resolved ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>{t.description}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-gray-400">{t.created_at?.slice(0, 10)}</span>
                    {!t.is_resolved && <button onClick={() => handleResolveTrigger(t.id)} className="text-xs bg-green-500 text-white px-2 py-0.5 rounded">Resolve</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold mb-2">{section('permit_compliance', 'Compliance check')}</h2>
              <span className="text-xs text-gray-400">{(agentRuns || []).length} runs</span>
            </div>
            {(agentRuns || []).length === 0 ? (
              <p className="text-sm text-gray-500">No compliance checks yet. The Compliance Checker runs on submission (Automation → AI Agents).</p>
            ) : (
              <div className="space-y-3">
                {(agentRuns || []).map(run => {
                  let findings = [];
                  try { findings = run.findings_json ? JSON.parse(run.findings_json) : []; } catch {}
                  return (
                    <div key={run.id} className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`badge ${run.verdict === 'ok' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : run.verdict === 'warn' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>{run.verdict}</span>
                        <span className="text-xs text-gray-500">{run.score != null ? Math.round(run.score) + '/100' : ''} · {run.created_at?.slice(0, 16)}</span>
                      </div>
                      <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{run.summary}</p>
                      {run.applied && <span className="text-xs text-green-600">acknowledged</span>}
                      {findings.length > 0 && (
                        <details className="mt-1">
                          <summary className="text-xs text-gray-500 cursor-pointer">Findings ({findings.length})</summary>
                          <ul className="mt-1 space-y-1">
                            {findings.map((f, i) => (
                              <li key={i} className={`text-xs ${f.severity === 'fail' ? 'text-red-600' : f.severity === 'warn' ? 'text-yellow-600' : f.severity === 'ok' ? 'text-green-600' : 'text-gray-500'}`}>
                                <b>{f.label}:</b> {f.detail}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="card p-4">
            <h2 className="font-semibold mb-2">{section('permit_contact', 'Contact')}</h2>
            <p className="text-sm text-gray-600">{permit.authority_email || 'No email on file'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
