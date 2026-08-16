import jwt from 'jsonwebtoken';
import db from '../db.js';
import { getJwtSecret } from '../secrets.js';

const JWT_SECRET = getJwtSecret();

export const ROLE_RANK = { developer: 4, manager: 3, staff: 2, client: 1 };

export function roleRank(role) {
  return ROLE_RANK[role] || 0;
}

export function authenticate(req, res, next) {
  const header = req.headers.authorization || (req.query.token ? `Bearer ${req.query.token}` : null);
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided', requestId: req.requestId });
  }
  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, email, name, role, client_id FROM users WHERE id = ?').get(payload.userId);
    if (!user) return res.status(401).json({ error: 'User not found', requestId: req.requestId });
    req.user = { ...user, clientId: user.client_id };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token', requestId: req.requestId });
  }
}

export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated', requestId: req.requestId });
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions', requestId: req.requestId });
    }
    next();
  };
}

// Requires a role at least as privileged as minRole.
export function roleAtLeast(minRole) {
  const min = roleRank(minRole);
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated', requestId: req.requestId });
    if (roleRank(req.user.role) < min) {
      return res.status(403).json({ error: 'Insufficient permissions', requestId: req.requestId });
    }
    next();
  };
}
