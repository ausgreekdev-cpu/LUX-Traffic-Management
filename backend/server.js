require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const db = require('./database');
const auth = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3001;

// ===== SECURITY MIDDLEWARE =====
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));

// Rate limiting
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);

// ===== VALIDATION SCHEMAS =====
const loginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(100),
});

const tmpCreateSchema = z.object({
  tmpNumber: z.string().max(50).optional(),
  projectName: z.string().min(1).max(200),
  requestDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  clientName: z.string().min(1).max(200),
  location: z.string().min(1).max(500),
  dateOfWorks: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  details: z.string().max(5000).optional(),
  assignedTo: z.string().max(200).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  status: z.string().max(50).optional(),
  customFields: z.record(z.unknown()).optional(),
});

const tmpUpdateSchema = tmpCreateSchema.partial();

const settingsSchema = z
  .object({
    menuItems: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          icon: z.string(),
          enabled: z.boolean(),
          badge: z.boolean(),
        })
      )
      .optional(),
    tableColumns: z
      .record(
        z.array(
          z.object({
            key: z.string(),
            label: z.string(),
            enabled: z.boolean(),
          })
        )
      )
      .optional(),
    formFields: z
      .array(
        z.object({
          key: z.string(),
          label: z.string(),
          type: z.string(),
          required: z.boolean(),
          enabled: z.boolean(),
          gridClass: z.string().optional(),
        })
      )
      .optional(),
    customFields: z
      .array(
        z.object({
          key: z.string(),
          label: z.string(),
          type: z.string(),
          required: z.boolean(),
          options: z.array(z.string()).optional(),
          gridClass: z.string().optional(),
          enabled: z.boolean(),
        })
      )
      .optional(),
    statuses: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          bg: z.string(),
          color: z.string(),
          enabled: z.boolean(),
        })
      )
      .optional(),
    priorities: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          bg: z.string(),
          color: z.string(),
        })
      )
      .optional(),
    content: z
      .object({
        appName: z.string(),
        appTagline: z.string(),
        viewTitles: z.record(z.string()),
        placeholders: z.record(z.string()),
        labels: z.record(z.string()),
      })
      .optional(),
    theme: z
      .object({
        primary: z.string(),
        primaryLight: z.string(),
        primaryDark: z.string(),
        sidebarBg: z.string(),
        bg: z.string(),
        surface: z.string(),
        text: z.string(),
        textSecondary: z.string(),
        border: z.string(),
        success: z.string(),
        warning: z.string(),
        danger: z.string(),
        purple: z.string(),
        cyan: z.string(),
        radius: z.string(),
        font: z.string(),
        sidebarText: z.string(),
        sidebarNavText: z.string(),
        sidebarHoverBg: z.string(),
        sidebarActiveBg: z.string(),
        sidebarHeaderBorder: z.string(),
        sidebarSubOpacity: z.string(),
        logo: z.string().optional(),
        banner: z.string().optional(),
        favicon: z.string().optional(),
        sidebarBgImg: z.string().optional(),
      })
      .optional(),
    users: z
      .array(
        z.object({
          username: z.string(),
          password: z.string(),
          role: z.enum(['admin', 'planner', 'inspector', 'viewer']),
        })
      )
      .optional(),
    statusRules: z
      .record(
        z.object({
          canAdvanceRoles: z.array(z.enum(['admin', 'planner', 'inspector', 'viewer'])),
        })
      )
      .optional(),
    defaultValues: z.record(z.unknown()).optional(),
    dashboardWidgets: z.record(z.boolean()).optional(),
    rowDensity: z.enum(['compact', 'comfortable']).optional(),
    keyboardShortcuts: z.record(z.string()).optional(),
    automations: z
      .array(
        z.object({
          fromStatus: z.string(),
          toStatus: z.string(),
          delayDays: z.number().int().positive(),
          enabled: z.boolean(),
        })
      )
      .optional(),
    clients: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          type: z.enum(['government', 'private']),
          contact: z.string().email().optional().nullable(),
          phone: z.string().optional().nullable(),
        })
      )
      .optional(),
  })
  .partial();

const userCreateSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(100),
  role: z.enum(['admin', 'planner', 'inspector', 'viewer']),
});

const userUpdateSchema = z
  .object({
    username: z.string().min(3).max(50).optional(),
    password: z.string().min(6).max(100).optional(),
    role: z.enum(['admin', 'planner', 'inspector', 'viewer']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field required' });

// Validation middleware
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Validation failed', details: result.error.flatten().fieldErrors });
    }
    req.body = result.data;
    next();
  };
}

// ===== HEALTH CHECK =====
app.get('/health', (req, res) => {
  try {
    db.getDb().prepare('SELECT 1').get();
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ status: 'unhealthy', error: e.message });
  }
});

// ===== AUTH =====
app.post('/api/auth/login', loginLimiter, validate(loginSchema), (req, res) => {
  const { username, password } = req.body;
  const user = db.getUserByUsername(username);
  if (!user || !auth.verifyPassword(password, user.password)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const token = auth.generateToken(user);
  res.json({ token, user: { username: user.username, role: user.role, id: user.id } });
});

// ===== TMPs =====
app.get('/api/tmps', auth.authenticate, (req, res) => {
  res.json(db.getAllTmps());
});

app.get('/api/tmps/:id', auth.authenticate, (req, res) => {
  const t = db.getTmpById(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json(t);
});

app.post('/api/tmps', auth.authenticate, auth.checkPermission('canEdit'), validate(tmpCreateSchema), (req, res) => {
  const tmp = db.createTmp(req.body);
  db.addAuditLog('create', tmp.id, tmp.tmpNumber, req.user.username, 'Created by ' + req.user.username);
  res.status(201).json(tmp);
});

app.put('/api/tmps/:id', auth.authenticate, auth.checkPermission('canEdit'), validate(tmpUpdateSchema), (req, res) => {
  const tmp = db.updateTmp(req.params.id, req.body);
  if (!tmp) return res.status(404).json({ error: 'Not found' });
  db.addAuditLog('update', tmp.id, tmp.tmpNumber, req.user.username, 'Updated by ' + req.user.username);
  res.json(tmp);
});

app.delete('/api/tmps/:id', auth.authenticate, auth.checkPermission('canDelete'), (req, res) => {
  const tmp = db.deleteTmp(req.params.id);
  if (!tmp) return res.status(404).json({ error: 'Not found' });
  db.addAuditLog('delete', tmp.id, tmp.tmpNumber, req.user.username, 'Deleted by ' + req.user.username);
  res.json({ success: true });
});

app.put('/api/tmps/:id/advance', auth.authenticate, auth.checkPermission('canAdvance'), (req, res) => {
  const tmp = db.getTmpById(req.params.id);
  if (!tmp) return res.status(404).json({ error: 'Not found' });
  const advanced = db.advanceTmp(req.params.id);
  if (!advanced) return res.status(400).json({ error: 'Cannot advance — already at final status' });
  db.addAuditLog(
    'advance',
    advanced.id,
    advanced.tmpNumber,
    req.user.username,
    'Advanced from "' + tmp.status + '" to "' + advanced.status + '" by ' + req.user.username
  );
  res.json(advanced);
});

// ===== SETTINGS =====
app.get('/api/settings', auth.authenticate, (req, res) => {
  res.json(db.getSettings());
});

app.put(
  '/api/settings',
  auth.authenticate,
  auth.checkPermission('canManageSettings'),
  validate(settingsSchema),
  (req, res) => {
    db.updateSettings(req.body);
    res.json({ success: true });
  }
);

// ===== USERS (admin only) =====
app.get('/api/users', auth.authenticate, auth.checkPermission('canManageSettings'), (req, res) => {
  res.json(db.getAllUsers());
});

app.post(
  '/api/users',
  auth.authenticate,
  auth.checkPermission('canManageSettings'),
  validate(userCreateSchema),
  (req, res) => {
    const { username, password, role } = req.body;
    if (db.getUserByUsername(username)) return res.status(409).json({ error: 'Username already exists' });
    db.createUser(username, auth.hashPassword(password), role);
    res.status(201).json({ success: true });
  }
);

app.put(
  '/api/users/:id',
  auth.authenticate,
  auth.checkPermission('canManageSettings'),
  validate(userUpdateSchema),
  (req, res) => {
    const fields = {};
    if (req.body.username) fields.username = req.body.username;
    if (req.body.password) fields.password = auth.hashPassword(req.body.password);
    if (req.body.role) fields.role = req.body.role;
    db.updateUser(req.params.id, fields);
    res.json({ success: true });
  }
);

app.delete('/api/users/:id', auth.authenticate, auth.checkPermission('canManageSettings'), (req, res) => {
  db.deleteUser(req.params.id);
  res.json({ success: true });
});

// ===== AUDIT LOG =====
app.get('/api/audit', auth.authenticate, auth.checkPermission('canManageSettings'), (req, res) => {
  res.json(db.getAuditLog());
});

app.post('/api/audit', auth.authenticate, (req, res) => {
  const { action, tmpId, tmpNumber, details, timestamp } = req.body;
  db.addAuditLog(action || 'unknown', tmpId || '', tmpNumber || '', req.user.username, details || '', timestamp);
  res.status(201).json({ success: true });
});

app.delete('/api/audit', auth.authenticate, auth.checkPermission('canManageSettings'), (req, res) => {
  db.clearAuditLog();
  res.json({ success: true });
});

// ===== EXPORT =====
app.get('/api/export/json', auth.authenticate, (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename=TMPs_export.json');
  res.json(db.getAllTmps());
});

app.get('/api/export/csv', auth.authenticate, (req, res) => {
  const data = db.getAllTmps();
  const fields = [
    'tmpNumber',
    'projectName',
    'requestDate',
    'clientName',
    'location',
    'dateOfWorks',
    'details',
    'assignedTo',
    'priority',
    'status',
  ];
  const header = fields.join(',');
  const rows = data.map((t) => fields.map((f) => '"' + (t[f] || '').replace(/"/g, '""') + '"').join(','));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=TMPs_export.csv');
  res.send([header, ...rows].join('\n'));
});

// ===== IMPORT =====
app.post('/api/import', auth.authenticate, auth.checkPermission('canEdit'), (req, res) => {
  const items = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'Expected array of TMP objects' });
  let count = 0;
  for (const item of items) {
    if (item.projectName || item.clientName || item.location) {
      db.createTmp(item);
      count++;
    }
  }
  res.json({ imported: count });
});

// ===== BACKUP =====
app.get('/api/backup', auth.authenticate, auth.checkPermission('canManageSettings'), (req, res) => {
  res.json(db.getFullBackup());
});

app.post('/api/backup/restore', auth.authenticate, auth.checkPermission('canManageSettings'), (req, res) => {
  if (!req.body || !req.body.data || !Array.isArray(req.body.data)) {
    return res.status(400).json({ error: 'Invalid backup format' });
  }
  db.restoreFullBackup(req.body);
  res.json({ success: true });
});

// ===== BULK SAMPLE =====
app.post('/api/bulk-sample', auth.authenticate, auth.checkPermission('canEdit'), (req, res) => {
  const td = () => new Date().toISOString().slice(0, 10);
  const d = (o) => {
    const dt = new Date();
    dt.setDate(dt.getDate() + o);
    return dt.toISOString().slice(0, 10);
  };
  const samples = [
    [
      'TMP-2024-006',
      'King Street Pedestrian Crossing',
      d(2),
      'City Council',
      'King Street, Newtown',
      d(15),
      'Pedestrian crossing installation.',
      'James Wilson',
      'high',
      'new',
    ],
    [
      'TMP-2024-007',
      'Harbour Bridge Maintenance',
      d(-7),
      'Transport NSW',
      'Sydney Harbour Bridge',
      d(30),
      'Routine maintenance works.',
      'Maria Garcia',
      'medium',
      'in-progress',
    ],
    [
      'TMP-2024-008',
      'Oxford Street Lighting',
      d(-14),
      'City of Sydney',
      'Oxford Street, Paddington',
      d(22),
      'Street light upgrade.',
      'Alex Kim',
      'low',
      'permits-lga',
    ],
  ];
  let count = 0;
  for (const s of samples) {
    db.createTmp({
      tmpNumber: s[0],
      projectName: s[1],
      requestDate: s[2],
      clientName: s[3],
      location: s[4],
      dateOfWorks: s[5],
      details: s[6],
      assignedTo: s[7],
      priority: s[8],
      status: s[9],
    });
    count++;
  }
  res.json({ created: count });
});

// ===== STATIC FILES =====
app.use(express.static(path.join(__dirname, '..')));

// ===== START =====
db.getDb();
app.listen(PORT, () => {
  console.log('TMP Dashboard API running on http://localhost:' + PORT);
});
