import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { validate } from '../middleware/validate.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'lux-traffic-jwt-secret-change-in-production';

router.post('/login', validate('login'), (req, res) => {
  const { email, password } = req.validated;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

router.get('/me', (req, res) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    const user = db.prepare('SELECT id, email, name, role FROM users WHERE id = ?').get(payload.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;
