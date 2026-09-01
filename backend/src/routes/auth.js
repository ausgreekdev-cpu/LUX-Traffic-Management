import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { validate } from '../middleware/validate.js';
import { rateLimit, rateLimitFailed, rateLimitSucceeded } from '../middleware/rate-limit.js';
import { getJwtSecret } from '../secrets.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();
const JWT_SECRET = getJwtSecret();
const PERSONAL_DOMAINS = new Set(['gmail.com','yahoo.com','outlook.com','hotmail.com','icloud.com','protonmail.com','aol.com']);

function domainFromEmail(email) {
  return String(email).split('@')[1]?.toLowerCase().trim() || '';
}

router.post('/login', rateLimit('login', 10, 15), validate('login'), asyncHandler(async (req, res) => {
  const { email, password } = req.validated;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    rateLimitFailed(req.rateLimitKey);
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  rateLimitSucceeded(req.rateLimitKey);
  const link = db.prepare('SELECT tenant_id FROM tenant_users WHERE user_id = ? LIMIT 1').get(user.id);
  const tenantId = link?.tenant_id || db.prepare('SELECT id FROM tenants LIMIT 1').get()?.id || null;
  const minutes = parseInt(db.prepare("SELECT value FROM settings WHERE key = 'session_timeout_minutes'").get()?.value || '1440', 10) || 1440;
  const token = jwt.sign({ userId: user.id, role: user.role, clientId: user.client_id, tenant_id: tenantId, tenantId }, JWT_SECRET, { expiresIn: `${Math.max(5, minutes)}m` });
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, client_id: user.client_id, clientId: user.client_id, tenant_id: tenantId, tenantId },
    tenant_id: tenantId
  });
}));

router.post('/register', rateLimit('register', 5, 60), asyncHandler(async (req, res) => {
  const { email, password, name, companyName } = req.body || {};
  if (!email || !password || !name) return res.status(400).json({ error: 'email, password, name required' });
  const lowerEmail = String(email).toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lowerEmail)) return res.status(400).json({ error: 'Invalid email' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Password must be >=8 chars' });
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(lowerEmail)) return res.status(409).json({ error: 'Email already registered' });
  const domain = domainFromEmail(lowerEmail);
  const isPersonal = PERSONAL_DOMAINS.has(domain);
  let tenant = null;
  let tenantId = null;
  // Try to find existing tenant by domain (company sandbox)
  if (!isPersonal && domain) {
    tenant = db.prepare('SELECT * FROM tenants WHERE domain = ?').get(domain);
    // Also check allowed_domains JSON
    if (!tenant) {
      const all = db.prepare('SELECT * FROM tenants WHERE allowed_domains IS NOT NULL').all();
      for (const t of all) {
        try { const arr = JSON.parse(t.allowed_domains); if (Array.isArray(arr) && arr.includes(domain)) { tenant = t; break; } } catch {}
      }
    }
  }
  // If no tenant found, create new sandbox for this company
  if (!tenant) {
    tenantId = uuid();
    const slugBase = isPersonal ? lowerEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9]+/g,'-') : domain.replace(/\./g,'-');
    let slug = slugBase;
    let suffix = 0;
    while (db.prepare('SELECT id FROM tenants WHERE slug = ?').get(slug)) { slug = `${slugBase}-${++suffix}`; }
    const tName = (companyName || (isPersonal ? `${name}'s Workspace` : domain)).trim();
    db.prepare('INSERT INTO tenants (id, name, slug, domain, plan, status) VALUES (?, ?, ?, ?, ?, ?)').run(tenantId, tName, slug, isPersonal ? null : domain, 'trial', 'trialing');
    // Seed trial entitlements via default pro trial limits
    db.prepare('UPDATE tenants SET trial_ends_at = datetime(\'now\', \'+14 days\') WHERE id = ?').run(tenantId);
  } else {
    tenantId = tenant.id;
    // For existing company sandbox, create pending invitation if auto-join not allowed
    // For MVP: auto-join if domain matches (company sandbox) - directly add user to tenant
    // If tenant requires approval, we would create invitation; for now auto-join for same domain
  }
  const userId = uuid();
  const hash = await bcrypt.hash(String(password), 12);
  db.prepare('INSERT INTO users (id, email, password, name, role) VALUES (?, ?, ?, ?, ?)').run(userId, lowerEmail, hash, String(name).trim(), 'manager');
  db.prepare('INSERT INTO tenant_users (tenant_id, user_id, role) VALUES (?, ?, ?)').run(tenantId, userId, 'manager');
  const minutes = 1440;
  const token = jwt.sign({ userId, role: 'manager', tenant_id: tenantId, tenantId }, JWT_SECRET, { expiresIn: `${minutes}m` });
  res.status(201).json({ token, user: { id: userId, email: lowerEmail, name, role: 'manager', tenant_id: tenantId, tenantId }, tenant: db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId) });
}));

router.get('/me', (req, res) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    const user = db.prepare('SELECT id, email, name, role, client_id FROM users WHERE id = ?').get(payload.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

router.post('/accept', asyncHandler(async (req, res) => {
  const { token, password, name } = req.body || {};
  if (!token || !password) return res.status(400).json({ error: 'token and password required' });
  const inv = db.prepare("SELECT * FROM invitations WHERE token = ? AND status = 'pending'").get(String(token).trim());
  if (!inv) return res.status(404).json({ error: 'Invalid or expired invitation' });
  if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
    db.prepare("UPDATE invitations SET status = 'expired' WHERE id = ?").run(inv.id);
    return res.status(410).json({ error: 'Invitation expired' });
  }
  const lowerEmail = String(inv.email).toLowerCase();
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(lowerEmail)) return res.status(409).json({ error: 'User already exists' });
  const userId = uuid();
  const hash = await bcrypt.hash(String(password), 12);
  const finalName = String(name || lowerEmail.split('@')[0]).trim();
  db.prepare('INSERT INTO users (id, email, password, name, role, client_id) VALUES (?, ?, ?, ?, ?, ?)').run(userId, lowerEmail, hash, finalName, inv.role || 'staff', inv.client_id || null);
  db.prepare('INSERT INTO tenant_users (tenant_id, user_id, role) VALUES (?, ?, ?)').run(inv.tenant_id, userId, inv.role || 'staff');
  db.prepare("UPDATE invitations SET status = 'accepted' WHERE id = ?").run(inv.id);
  const jwtToken = jwt.sign({ userId, role: inv.role || 'staff', tenant_id: inv.tenant_id, tenantId: inv.tenant_id }, JWT_SECRET, { expiresIn: '1440m' });
  res.json({ token: jwtToken, user: { id: userId, email: lowerEmail, name: finalName, role: inv.role, tenant_id: inv.tenant_id } });
}));

router.get('/invitation/:token', (req, res) => {
  const inv = db.prepare("SELECT id, email, role, tenant_id, expires_at, status FROM invitations WHERE token = ?").get(String(req.params.token).trim());
  if (!inv) return res.status(404).json({ error: 'Invitation not found' });
  if (inv.status !== 'pending') return res.status(400).json({ error: `Invitation ${inv.status}` });
  if (inv.expires_at && new Date(inv.expires_at) < new Date()) return res.status(410).json({ error: 'Invitation expired' });
  const tenant = db.prepare('SELECT name FROM tenants WHERE id = ?').get(inv.tenant_id);
  res.json({ ...inv, tenant_name: tenant?.name || 'Workspace' });
});

export default router;
