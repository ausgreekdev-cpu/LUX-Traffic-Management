import jwt from 'jsonwebtoken';
import db from '../db.js';
import { getJwtSecret } from '../secrets.js';

const JWT_SECRET = getJwtSecret();

export function authenticate(req, res, next) {
  const header = req.headers.authorization || (req.query.token ? `Bearer ${req.query.token}` : null);
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, email, name, role FROM users WHERE id = ?').get(payload.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
