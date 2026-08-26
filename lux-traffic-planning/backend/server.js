require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');
const auth = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ===== AUTH =====
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
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

app.post('/api/tmps', auth.authenticate, auth.checkPermission('canEdit'), (req, res) => {
  const tmp = db.createTmp(req.body);
  db.addAuditLog('create', tmp.id, tmp.tmpNumber, req.user.username, 'Created by ' + req.user.username);
  res.status(201).json(tmp);
});

app.put('/api/tmps/:id', auth.authenticate, auth.checkPermission('canEdit'), (req, res) => {
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

app.put('/api/settings', auth.authenticate, auth.checkPermission('canManageSettings'), (req, res) => {
  db.updateSettings(req.body);
  res.json({ success: true });
});

// ===== USERS (admin only) =====
app.get('/api/users', auth.authenticate, auth.checkPermission('canManageSettings'), (req, res) => {
  res.json(db.getAllUsers());
});

app.post('/api/users', auth.authenticate, auth.checkPermission('canManageSettings'), (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) return res.status(400).json({ error: 'username, password, role required' });
  if (db.getUserByUsername(username)) return res.status(409).json({ error: 'Username already exists' });
  db.createUser(username, auth.hashPassword(password), role);
  res.status(201).json({ success: true });
});

app.put('/api/users/:id', auth.authenticate, auth.checkPermission('canManageSettings'), (req, res) => {
  const fields = {};
  if (req.body.username) fields.username = req.body.username;
  if (req.body.password) fields.password = auth.hashPassword(req.body.password);
  if (req.body.role) fields.role = req.body.role;
  if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'No fields to update' });
  db.updateUser(req.params.id, fields);
  res.json({ success: true });
});

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

// ===== STATIC FILES (serve index.html) =====
app.use(express.static(path.join(__dirname, '..')));

// ===== START =====
db.getDb();
app.listen(PORT, () => {
  console.log('TMP Dashboard API running on http://localhost:' + PORT);
});
