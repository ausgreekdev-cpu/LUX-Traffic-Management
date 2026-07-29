import { Router } from 'express';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const totalTmps = db.prepare('SELECT COUNT(*) as c FROM traffic_management_plans').get().c;
  const activeTmps = db.prepare("SELECT COUNT(*) as c FROM traffic_management_plans WHERE status NOT IN ('completed','cancelled')").get().c;
  const totalClients = db.prepare('SELECT COUNT(*) as c FROM clients').get().c;
  const totalSites = db.prepare('SELECT COUNT(*) as c FROM sites').get().c;
  const totalProjects = db.prepare('SELECT COUNT(*) as c FROM tmp_projects').get().c;
  const totalPermits = db.prepare('SELECT COUNT(*) as c FROM permits').get().c;
  const pendingPermits = db.prepare("SELECT COUNT(*) as c FROM permits WHERE status IN ('submitted','under_review')").get().c;
  const recentTmps = db.prepare(`
    SELECT t.*, s.name as site_name, p.name as project_name
    FROM traffic_management_plans t
    LEFT JOIN sites s ON t.site_id = s.id
    LEFT JOIN tmp_projects p ON t.project_id = p.id
    ORDER BY t.created_at DESC LIMIT 5
  `).all();
  const recentActivity = db.prepare(`
    SELECT a.*, u.name as user_name, t.title as tmp_title
    FROM plan_activities a
    LEFT JOIN users u ON a.user_id = u.id
    LEFT JOIN traffic_management_plans t ON a.tmp_id = t.id
    ORDER BY a.created_at DESC LIMIT 10
  `).all();
  res.json({
    stats: { totalTmps, activeTmps, totalClients, totalSites, totalProjects, totalPermits, pendingPermits },
    recentTmps,
    recentActivity
  });
});

export default router;
