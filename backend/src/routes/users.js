import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
router.use(authenticate);
router.use(authorize('developer'));

router.get('/', (req, res) => {
  const users = db.prepare('SELECT id, email, name, role, client_id, created_at FROM users ORDER BY created_at DESC').all();
  res.json(users);
});

router.post('/', validate('user'), (req, res) => {
  const id = uuid();
  const { email, password, name, role, client_id } = req.validated;
  const hash = bcrypt.hashSync(password, 12);
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
    res.status(201).json({ id, email, name, role: finalRole, client_id: client_id || null });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email already exists' });
    throw e;
  }
});

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
