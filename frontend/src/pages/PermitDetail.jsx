import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api';
import WorkflowChecklist from '../components/WorkflowChecklist';
import { PERMIT_BADGES, FEE_BADGES, badgeFor, statusLabel } from '../utils/status';

export default function PermitDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [permit, setPermit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feeForm, setFeeForm] = useState({ fee_type: 'application_fee', amount: '', status: 'pending' });

  const loadPermit = () => api.permits.get(id).then(setPermit);
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
      <div className="flex items-center justify-between">
        <div>
          <Link to="/permits" className="text-sm text-gray-500 hover:text-amber-600">← Back to Permits</Link>
          <h1 className="text-2xl font-bold mt-1">Permit - {permit.authority_short || permit.authority_name}</h1>
          <p className="text-gray-500 text-sm">{permit.tmp_reference} • {permit.complexity}</p>
        </div>
        <div className="flex gap-2">
          {permit.status !== 'approved' && permit.status !== 'cancelled' && permit.status !== 'completed' && (
            <select value={permit.status} onChange={e => handleStatusChange(e.target.value)} className="px-3 py-2 border rounded text-sm">
              {['draft', 'submitted', 'under_review', 'approved', 'rejected', 'cancelled', 'completed'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          )}
          <Link to={`/permits/${id}/edit`} className="bg-amber-500 text-white px-3 py-2 rounded text-sm">Edit</Link>
          <button onClick={handleDelete} className="bg-red-500 text-white px-3 py-2 rounded text-sm">Delete</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h2 className="font-semibold mb-2">Permit Details</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Status:</span> <span className={`ml-1 px-2 py-0.5 rounded text-xs ${badgeFor(PERMIT_BADGES, permit.status)}`}>{statusLabel(permit.status)}</span></div>
              <div><span className="text-gray-500">Authority:</span> <span className="ml-1">{permit.authority_name} ({permit.authority_type?.toUpperCase()})</span></div>
              <div><span className="text-gray-500">Complexity:</span> <span className="ml-1">{permit.complexity}</span></div>
              <div><span className="text-gray-500">Submitted:</span> <span className="ml-1">{permit.submission_date || 'Not submitted'}</span></div>
              <div><span className="text-gray-500">Approved:</span> <span className="ml-1">{permit.approval_date || 'Not approved'}</span></div>
              <div><span className="text-gray-500">Expiry:</span> <span className="ml-1">{permit.expiry_date || 'N/A'}</span></div>
              <div><span className="text-gray-500">Within 30m Signals:</span> <span className="ml-1 font-bold">{permit.is_within_30m_signals ? 'YES' : 'No'}</span></div>
              <div><span className="text-gray-500">MRWA Required:</span> <span className="ml-1 font-bold">{permit.requires_mrwa ? 'YES' : 'No'}</span></div>
            </div>
            {permit.rejection_reason && (
              <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 rounded text-sm text-red-700 dark:text-red-400">
                <strong>Rejection Reason:</strong> {permit.rejection_reason}
              </div>
            )}
          </div>

          {permit.sla && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <h2 className="font-semibold mb-2">SLA Information</h2>
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

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h2 className="font-semibold mb-2">Fees ({(permit.fees||[]).length})</h2>
            {(permit.fees||[]).length > 0 && (
              <table className="w-full text-sm mb-3">
                <thead><tr className="border-b"><th className="text-left py-2">Type</th><th className="text-left py-2">Amount</th><th className="text-left py-2">Status</th></tr></thead>
                <tbody>{permit.fees.map(f => (
                  <tr key={f.id} className="border-b"><td className="py-2">{f.fee_type.replace(/_/g, ' ')}</td><td>${f.amount.toFixed(2)}</td><td><span className={`text-xs px-2 py-0.5 rounded ${badgeFor(FEE_BADGES, f.status)}`}>{f.status}</span></td></tr>
                ))}</tbody>
              </table>
            )}
            <form onSubmit={handleAddFee} className="flex items-end gap-2 border-t pt-3">
              <div>
                <label className="text-xs text-gray-500 block">Type</label>
                <select value={feeForm.fee_type} onChange={e => setFeeForm(f => ({...f, fee_type: e.target.value}))} className="border rounded px-2 py-1 text-sm" required>
                  {['application_fee','assessment_fee','daily_occupancy_fee','lane_usage_fee','bond','other'].map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block">Amount ($)</label>
                <input type="number" step="0.01" min="0" value={feeForm.amount} onChange={e => setFeeForm(f => ({...f, amount: e.target.value}))} className="border rounded px-2 py-1 text-sm w-28" required />
              </div>
              <div>
                <label className="text-xs text-gray-500 block">Status</label>
                <select value={feeForm.status} onChange={e => setFeeForm(f => ({...f, status: e.target.value}))} className="border rounded px-2 py-1 text-sm">
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                  <option value="refunded">Refunded</option>
                  <option value="waived">Waived</option>
                </select>
              </div>
              <button type="submit" className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded text-sm">Add Fee</button>
            </form>
          </div>
          <WorkflowChecklist entityType="permit" entityId={id} />
        </div>

        <div className="space-y-4">
          {permit.triggers?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <h2 className="font-semibold mb-2">Workflow Triggers</h2>
              {permit.triggers.map(t => (
                <div key={t.id} className={`p-2 rounded mb-2 text-sm ${t.is_resolved ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                  <p className={t.is_resolved ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>{t.description}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-gray-400">{t.created_at?.slice(0, 10)}</span>
                    {!t.is_resolved && <button onClick={() => handleResolveTrigger(t.id)} className="text-xs bg-green-500 text-white px-2 py-0.5 rounded">Resolve</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h2 className="font-semibold mb-2">Contact</h2>
            <p className="text-sm text-gray-600">{permit.authority_email || 'No email on file'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
