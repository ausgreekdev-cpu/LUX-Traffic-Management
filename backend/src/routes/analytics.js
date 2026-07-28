import { Router } from 'express';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/approval-times', (req, res) => {
  const periodDays = parseInt(req.query.period_days || '90');
  const cutoff = new Date(Date.now() - periodDays * 86400000).toISOString().slice(0,10);
  let q = `SELECT a.id as authority_id,a.name as authority_name,a.short_name as authority_short,a.type as authority_type,
    COUNT(p.id) as sample_count, AVG(julianday(p.approval_date)-julianday(p.submission_date)) as avg_days,
    MIN(julianday(p.approval_date)-julianday(p.submission_date)) as min_days,
    MAX(julianday(p.approval_date)-julianday(p.submission_date)) as max_days
    FROM permits p LEFT JOIN authorities a ON p.authority_id=a.id
    WHERE p.approval_date IS NOT NULL AND p.submission_date IS NOT NULL AND p.submission_date>=?`;
  const params = [cutoff];
  if (req.query.authority_id) { q += ' AND p.authority_id=?'; params.push(req.query.authority_id); }
  q += ' GROUP BY a.id ORDER BY avg_days ASC';
  const metrics = db.prepare(q).all(...params).map(r => ({ authority_id: r.authority_id, authority_name: r.authority_name, authority_short: r.authority_short, sample_count: r.sample_count, avg_approval_days: r.avg_days ? Math.round(r.avg_days*10)/10 : null, min_approval_days: r.min_days ? Math.round(r.min_days) : null, max_approval_days: r.max_days ? Math.round(r.max_days) : null }));
  res.json({ metrics, total_authorities: metrics.length, period_days: periodDays });
});

router.get('/planner-throughput', (req, res) => {
  const periodDays = parseInt(req.query.period_days || '90');
  const cutoff = new Date(Date.now() - periodDays * 86400000).toISOString().slice(0,10);
  const tmpRows = db.prepare('SELECT created_by,COUNT(*) as tmps_created,SUM(CASE WHEN status=\'completed\' THEN 1 ELSE 0 END) as tmps_completed FROM traffic_management_plans WHERE created_at>=? GROUP BY created_by').all(cutoff);
  const timeRows = db.prepare('SELECT user_id,cost_code,SUM(duration_hours) as total_hours FROM time_entries WHERE date>=? GROUP BY user_id,cost_code').all(cutoff);
  const planners = {};
  tmpRows.forEach(r => { planners[r.created_by||'Unknown'] = { tmps_created: r.tmps_created, tmps_completed: r.tmps_completed, completion_rate: r.tmps_created ? Math.round(r.tmps_completed/r.tmps_created*100) : 0, revision_hours: 0, total_hours: 0 }; });
  timeRows.forEach(r => { const n = r.user_id||'Unknown'; if (!planners[n]) planners[n] = { tmps_created:0, tmps_completed:0, completion_rate:0, revision_hours:0, total_hours:0 }; planners[n].total_hours += r.total_hours; if (['TMP-REVISION-INT','TMP-REVISION-EXT'].includes(r.cost_code)) planners[n].revision_hours += r.total_hours; });
  Object.values(planners).forEach(p => { p.revision_rate = p.total_hours ? Math.round(p.revision_hours/p.total_hours*100) : 0; p.total_hours = Math.round(p.total_hours*100)/100; p.revision_hours = Math.round(p.revision_hours*100)/100; });
  res.json({ planners, period_days: periodDays });
});

router.get('/rejection-analysis', (req, res) => {
  const periodDays = parseInt(req.query.period_days || '180');
  const cutoff = new Date(Date.now() - periodDays * 86400000).toISOString().slice(0,10);
  const permits = db.prepare('SELECT p.rejection_reason,p.authority_id,a.name as authority_name FROM permits p LEFT JOIN authorities a ON p.authority_id=a.id WHERE p.status=\'rejected\' AND p.rejection_reason IS NOT NULL AND p.updated_at>=?').all(cutoff);
  const reasons = {};
  permits.forEach(p => { const r = p.rejection_reason.trim(); if (!reasons[r]) reasons[r] = { count: 0, authorities: new Set() }; reasons[r].count++; reasons[r].authorities.add(p.authority_name||'Unknown'); });
  const sorted = Object.entries(reasons).sort((a,b) => b[1].count-a[1].count).map(([reason,d]) => ({ reason, count: d.count, authorities: [...d.authorities] }));
  res.json({ rejection_reasons: sorted, total_rejections: permits.length, period_days: periodDays });
});

router.get('/financial-summary', (req, res) => {
  const periodDays = parseInt(req.query.period_days || '90');
  const cutoff = new Date(Date.now() - periodDays * 86400000).toISOString().slice(0,10);
  const fees = db.prepare('SELECT * FROM permit_fees WHERE created_at>=?').all(cutoff);
  const times = db.prepare('SELECT * FROM time_entries WHERE date>=?').all(cutoff);
  const fs = { application_fees:0, occupancy_fees:0, bonds_held:0, bonds_returned:0, total_fees:0, total_paid:0, total_pending:0 };
  fees.forEach(f => { if (['application_fee','assessment_fee'].includes(f.fee_type)) fs.application_fees+=f.amount; else if (['daily_occupancy_fee','lane_usage_fee'].includes(f.fee_type)) fs.occupancy_fees+=f.amount; else if (f.fee_type==='bond') { if (f.bond_returned) fs.bonds_returned+=f.amount; else fs.bonds_held+=f.amount; } fs.total_fees+=f.amount; if (f.status==='paid') fs.total_paid+=f.amount; else if (f.status==='pending') fs.total_pending+=f.amount; });
  let billableH=0, nonBillableH=0, billableC=0;
  times.forEach(t => { if (t.is_billable) { billableH+=t.duration_hours; billableC+=t.total_cost||0; } else nonBillableH+=t.duration_hours; });
  Object.keys(fs).forEach(k => fs[k] = Math.round(fs[k]*100)/100);
  res.json({ fees: fs, time: { billable_hours: Math.round(billableH*100)/100, non_billable_hours: Math.round(nonBillableH*100)/100, billable_cost: Math.round(billableC*100)/100 }, period_days: periodDays });
});

router.get('/dashboard', (req, res) => {
  const totalPermits = db.prepare('SELECT COUNT(*) as c FROM permits').get().c;
  const activePermits = db.prepare("SELECT COUNT(*) as c FROM permits WHERE status NOT IN ('completed','expired','rejected','cancelled')").get().c;
  const pendingApproval = db.prepare("SELECT COUNT(*) as c FROM permits WHERE status IN ('submitted','under_review')").get().c;
  const openTriggers = db.prepare('SELECT COUNT(*) as c FROM workflow_triggers WHERE is_resolved=0').get().c;
  const totalFeesOwed = db.prepare("SELECT COALESCE(SUM(amount),0) as s FROM permit_fees WHERE status='pending'").get().s;
  const totalBondHeld = db.prepare("SELECT COALESCE(SUM(amount),0) as s FROM permit_fees WHERE fee_type='bond' AND bond_returned=0").get().s;
  const permitsByAuthority = db.prepare('SELECT a.short_name,a.type,COUNT(p.id) as count FROM permits p LEFT JOIN authorities a ON p.authority_id=a.id GROUP BY a.id ORDER BY count DESC').all();
  const permitsByStatus = db.prepare('SELECT status,COUNT(*) as count FROM permits GROUP BY status').all();
  const urgentPermits = db.prepare('SELECT p.id,p.status,p.expiry_date,a.short_name FROM permits p LEFT JOIN authorities a ON p.authority_id=a.id WHERE p.expiry_date IS NOT NULL AND p.expiry_date>datetime(\'now\') ORDER BY p.expiry_date ASC LIMIT 5').all();
  res.json({ stats: { total_permits: totalPermits, active_permits: activePermits, pending_approval: pendingApproval, open_triggers: openTriggers, total_fees_owed: totalFeesOwed, total_bond_held: totalBondHeld }, permits_by_authority: permitsByAuthority, permits_by_status: permitsByStatus, urgent_permits: urgentPermits });
});

export default router;
