import { Router } from 'express';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { isClientUser } from '../middleware/scope.js';
import { incompleteRequiredStages } from './workflows.js';

const router = Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const cid = isClientUser(req.user) ? req.user.clientId : null;
  const tmpJoin = cid ? ' INNER JOIN tmp_projects p ON p.id = t.project_id' : '';
  const tmpWhere = cid ? ' WHERE p.client_id = ?' : '';
  const tmpParams = cid ? [cid] : [];
  const totalTmps = db.prepare(`SELECT COUNT(*) as c FROM traffic_management_plans t${tmpJoin}${tmpWhere}`).get(...tmpParams).c;
  const activeTmps = db.prepare(`SELECT COUNT(*) as c FROM traffic_management_plans t${tmpJoin} WHERE t.status NOT IN ('completed','cancelled')${cid ? ' AND p.client_id = ?' : ''}`).get(...tmpParams).c;
  const totalClients = cid
    ? db.prepare('SELECT COUNT(*) as c FROM clients WHERE id = ?').get(cid).c
    : db.prepare('SELECT COUNT(*) as c FROM clients').get().c;
  const totalSites = cid
    ? db.prepare(`SELECT COUNT(DISTINCT t.site_id) as c FROM traffic_management_plans t${tmpJoin}${tmpWhere}`).get(...tmpParams).c
    : db.prepare('SELECT COUNT(*) as c FROM sites').get().c;
  const totalProjects = cid
    ? db.prepare('SELECT COUNT(*) as c FROM tmp_projects WHERE client_id = ?').get(cid).c
    : db.prepare('SELECT COUNT(*) as c FROM tmp_projects').get().c;
  const totalPermits = cid
    ? db.prepare(`SELECT COUNT(*) as c FROM permits pe INNER JOIN traffic_management_plans t ON pe.tmp_id = t.id${tmpJoin}${tmpWhere}`).get(...tmpParams).c
    : db.prepare('SELECT COUNT(*) as c FROM permits').get().c;
  const pendingPermits = cid
    ? db.prepare(`SELECT COUNT(*) as c FROM permits pe INNER JOIN traffic_management_plans t ON pe.tmp_id = t.id${tmpJoin} WHERE pe.status IN ('submitted','under_review')${cid ? ' AND p.client_id = ?' : ''}`).get(...tmpParams).c
    : db.prepare("SELECT COUNT(*) as c FROM permits WHERE status IN ('submitted','under_review')").get().c;
  const recentTmps = db.prepare(`
    SELECT t.*, s.name as site_name, p.name as project_name
    FROM traffic_management_plans t
    LEFT JOIN sites s ON t.site_id = s.id
    LEFT JOIN tmp_projects p ON t.project_id = p.id${tmpJoin ? '' : ''}
    ${tmpWhere}
    ORDER BY t.created_at DESC LIMIT 5
  `).all(...tmpParams);
  const recentActivity = db.prepare(`
    SELECT a.*, u.name as user_name, t.title as tmp_title
    FROM plan_activities a
    LEFT JOIN users u ON a.user_id = u.id
    LEFT JOIN traffic_management_plans t ON a.tmp_id = t.id
    ${cid ? 'WHERE a.tmp_id IN (SELECT t2.id FROM traffic_management_plans t2 INNER JOIN tmp_projects p2 ON p2.id = t2.project_id WHERE p2.client_id = ?)' : ''}
    ORDER BY a.created_at DESC LIMIT 10
  `).all(...tmpParams);
  const activeTmpsList = db.prepare(`SELECT id, reference, title FROM traffic_management_plans t${tmpJoin} WHERE t.status NOT IN ('completed','cancelled')${cid ? ' AND p.client_id = ?' : ''}`).all(...tmpParams);
  const activePermitsList = db.prepare(`SELECT p.id, t.reference as tmp_reference, au.short_name as authority FROM permits p LEFT JOIN traffic_management_plans t ON p.tmp_id = t.id LEFT JOIN authorities au ON p.authority_id = au.id${cid ? ' INNER JOIN tmp_projects pp ON pp.id = t.project_id' : ''} WHERE p.status NOT IN ('cancelled','completed','expired')${cid ? ' AND pp.client_id = ?' : ''}`).all(...tmpParams);
  const workflowAttention = [
    ...activeTmpsList.map(t => ({ type: 'tmp', id: t.id, label: `${t.reference || ''} ${t.title}`.trim(), missing: incompleteRequiredStages('tmp', t.id) }))
      .filter(t => t.missing.length),
    ...activePermitsList.map(p => ({ type: 'permit', id: p.id, label: `${p.tmp_reference || 'Permit'} • ${p.authority || ''}`.trim(), missing: incompleteRequiredStages('permit', p.id) }))
      .filter(p => p.missing.length)
  ].slice(0, 10);
  res.json({
    stats: { totalTmps, activeTmps, totalClients, totalSites, totalProjects, totalPermits, pendingPermits },
    recentTmps,
    recentActivity,
    workflowAttention
  });
});

export default router;
