import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
router.use(authenticate);

router.get('/', authorize('admin'), (req, res) => {
  const users = db.prepare('SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC').all();
  res.json(users);
});

router.post('/', authorize('admin'), validate('user'), (req, res) => {
  const id = uuid();
  const { email, password, name, role } = req.validated;
  const hash = bcrypt.hashSync(password, 12);
  try {
    db.prepare('INSERT INTO users (id, email, password, name, role) VALUES (?, ?, ?, ?, ?)').run(id, email, hash, name, role || 'planner');
    res.status(201).json({ id, email, name, role: role || 'planner' });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email already exists' });
    throw e;
  }
});

router.put('/:id', authorize('admin'), (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'User not found' });
  const { name, role } = req.body;
  if (name) db.prepare('UPDATE users SET name = ?, updated_at = datetime(\'now\') WHERE id = ?').run(name, id);
  if (role) db.prepare('UPDATE users SET role = ?, updated_at = datetime(\'now\') WHERE id = ?').run(role, id);
  res.json(db.prepare('SELECT id, email, name, role FROM users WHERE id = ?').get(id));
});

router.delete('/:id', authorize('admin'), (req, res) => {
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
