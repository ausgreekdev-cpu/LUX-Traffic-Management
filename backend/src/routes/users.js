import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { paginateResponse } from '../middleware/pagination.js';

const router = Router();
router.use(authenticate);

// Invitations - manager+ can invite, developer can list
router.get('/invitations', (req, res) => {
  const tenantId = req.user.tenant_id || req.user.tenantId;
  if (!tenantId) return res.json([]);
  const rows = db.prepare('SELECT * FROM invitations WHERE tenant_id = ? ORDER BY created_at DESC').all(tenantId);
  res.json(rows);
});

router.post('/invite', authorize('manager'), asyncHandler(async (req, res) => {
  const { email, role = 'staff', client_id } = req.body || {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) return res.status(400).json({ error: 'Valid email required' });
  const lowerEmail = String(email).toLowerCase().trim();
  const tenantId = req.user.tenant_id || req.user.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'No tenant' });
  // Domain check: personal domains can be invited but warn
  // Seat check
  const { resolveEntitlements, enforceLimit } = await import('../saas/entitlements.js');
  const ent = resolveEntitlements(tenantId);
  if (ent) {
    const used = db.prepare('SELECT count(*) as c FROM tenant_users WHERE tenant_id = ?').get(tenantId).c;
    const pending = db.prepare("SELECT count(*) as c FROM invitations WHERE tenant_id = ? AND status = 'pending'").get(tenantId).c;
    const { allowed, limit } = enforceLimit(tenantId, 'seats', used + pending);
    if (!allowed) return res.status(402).json({ error: 'limit_exceeded', limit: 'seats', limit_value: limit, current: used, pending, message: `Seat limit reached (${used}/${limit}). Upgrade at /billing.` });
  }
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(lowerEmail)) return res.status(409).json({ error: 'User already exists' });
  if (db.prepare("SELECT id FROM invitations WHERE email = ? AND tenant_id = ? AND status = 'pending'").get(lowerEmail, tenantId)) return res.status(409).json({ error: 'Invitation already pending' });
  const token = uuid() + '-' + uuid();
  const id = uuid();
  const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
  db.prepare('INSERT INTO invitations (id, tenant_id, email, role, client_id, token, invited_by, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, tenantId, lowerEmail, role, client_id || null, token, req.user.id, expiresAt);
  // In production, send email via emailer.js; for now return token for manual share
  res.status(201).json({ id, email: lowerEmail, role, token, expires_at: expiresAt, invite_url: `/accept?token=${token}` });
}));

router.post('/invitations/:id/revoke', authorize('manager'), (req, res) => {
  const tenantId = req.user.tenant_id || req.user.tenantId;
  const inv = db.prepare('SELECT * FROM invitations WHERE id = ? AND tenant_id = ?').get(req.params.id, tenantId);
  if (!inv) return res.status(404).json({ error: 'Invitation not found' });
  db.prepare("UPDATE invitations SET status = 'revoked' WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// Existing user management below is developer-only
router.use(authorize('developer'));

router.get('/', (req, res) => {
  const users = db.prepare('SELECT id, email, name, role, client_id, created_at FROM users ORDER BY created_at DESC').all();
  res.json(paginateResponse(req, users));
});

router.post('/', validate('user'), asyncHandler(async (req, res) => {
  // Seat-gated people upgrade: enforce seats limit before creating user
  const tenantId = req.user.tenant_id || req.user.tenantId;
  if (tenantId) {
    const { resolveEntitlements, enforceLimit } = await import('../saas/entitlements.js');
    const ent = resolveEntitlements(tenantId);
    if (ent) {
      const used = db.prepare('SELECT count(*) as c FROM tenant_users WHERE tenant_id = ?').get(tenantId).c;
      const { allowed, limit } = enforceLimit(tenantId, 'seats', used);
      if (!allowed) return res.status(402).json({ error: 'limit_exceeded', limit: 'seats', limit_value: limit, current: used, message: `Seat limit reached (${used}/${limit}). Upgrade plan or buy extra seats at /billing.` });
    }
  }
  const id = uuid();
  const { email, password, name, role, client_id } = req.validated;
  const hash = await bcrypt.hash(password, 12);
  const finalRole = role || 'staff';
  if (finalRole === 'client' && !client_id) {
    return res.status(400).json({ error: 'A client account must be linked to a company (client_id)' });
  }
  if (finalRole !== 'client' && client_id) {
    return res.status(400).json({ error: 'Only client accounts can be linked to a company' });
  }
  try {
    db.prepare('INSERT INTO users (id, email, password, name, role, client_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, email, hash, name, finalRole, client_id || null);
    // Link to tenant for seat billing
    if (tenantId) {
      try { db.prepare('INSERT OR IGNORE INTO tenant_users (tenant_id, user_id, role) VALUES (?, ?, ?)').run(tenantId, id, finalRole); } catch {}
    }
    res.status(201).json({ id, email, name, role: finalRole, client_id: client_id || null });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email already exists' });
    throw e;
  }
}));

router.put('/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'User not found' });
  const { name, role, client_id } = req.body;
  if (id === req.user.id && role && role !== req.user.role) {
    return res.status(400).json({ error: 'You cannot change your own role' });
  }
  if (name) db.prepare('UPDATE users SET name = ?, updated_at = datetime(\'now\') WHERE id = ?').run(name, id);
  if (role) {
    if (!['developer', 'manager', 'staff', 'client'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    if (role === 'client' && !client_id) {
      return res.status(400).json({ error: 'A client account must be linked to a company (client_id)' });
    }
    if (role !== 'client') {
      db.prepare('UPDATE users SET role = ?, client_id = NULL, updated_at = datetime(\'now\') WHERE id = ?').run(role, id);
    } else {
      db.prepare('UPDATE users SET role = ?, client_id = ?, updated_at = datetime(\'now\') WHERE id = ?').run(role, client_id, id);
    }
  } else if (client_id && req.body.role === undefined && existing.role !== 'client') {
    return res.status(400).json({ error: 'Only client accounts can be linked to a company' });
  }
  res.json(db.prepare('SELECT id, email, name, role, client_id FROM users WHERE id = ?').get(id));
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  if (id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'User not found' });
  const refs = {
    'TMPs': 'SELECT COUNT(*) as c FROM traffic_management_plans WHERE created_by = ?',
    'permits': 'SELECT COUNT(*) as c FROM permits WHERE created_by = ?',
    'time entries': 'SELECT COUNT(*) as c FROM time_entries WHERE user_id = ?',
    'documents': 'SELECT COUNT(*) as c FROM documents WHERE uploaded_by = ?',
    'activities': 'SELECT COUNT(*) as c FROM plan_activities WHERE user_id = ?',
    'notifications': 'SELECT COUNT(*) as c FROM notifications WHERE user_id = ?'
  };
  const used = Object.entries(refs).filter(([, sql]) => db.prepare(sql).get(id).c > 0).map(([k]) => k);
  if (used.length) return res.status(400).json({ error: 'User has references: ' + used.join(', ') });
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ success: true });
});

export default router;
