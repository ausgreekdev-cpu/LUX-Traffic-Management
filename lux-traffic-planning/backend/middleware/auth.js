const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'tmp-dashboard-secret-key-2026';
const JWT_EXPIRES = '24h';

const ROLES = {
  admin: { canEdit: true, canDelete: true, canManageSettings: true, canAdvance: true },
  planner: { canEdit: true, canDelete: true, canManageSettings: false, canAdvance: true },
  inspector: { canEdit: false, canDelete: false, canManageSettings: false, canAdvance: true },
  viewer: { canEdit: false, canDelete: false, canManageSettings: false, canAdvance: false },
};

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function generateToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = header.split(' ')[1];
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  req.user = decoded;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

function checkPermission(perm) {
  return (req, res, next) => {
    const role = ROLES[req.user.role];
    if (!role || !role[perm]) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  authenticate,
  requireRole,
  checkPermission,
  ROLES,
  JWT_SECRET,
};
