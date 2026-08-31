import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { fileURLToPath } from 'url';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { roleAtLeast } from '../middleware/auth.js';
import { isClientUser, tmpOwnedByClient } from '../middleware/scope.js';
import { getTenantId } from '../middleware/tenant.js';
import { limitFor, enforceLimit } from '../saas/entitlements.js';
import { emitEvent } from '../events.js';

const moduleDir = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const isServerless = !!(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
const uploadDir = process.env.UPLOADS_DIR || (isServerless ? '/tmp/uploads' : path.resolve(moduleDir, '..', '..', 'uploads'));
try {
  fs.mkdirSync(uploadDir, { recursive: true });
} catch (err) {
  console.warn('Could not create uploads dir at ' + uploadDir + ': ' + err.message);
}

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => cb(null, uuid() + path.extname(file.originalname))
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.dwg', '.dxf', '.png', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('File type not allowed'));
  }
});

const router = Router();
router.use(authenticate);

function tenantStorageBytes(tenantId) {
  if (!tenantId) return 0;
  try {
    const d = db.prepare('SELECT COALESCE(SUM(size),0) as s FROM documents WHERE tenant_id = ?').get(tenantId)?.s || 0;
    const p = (() => { try { return db.prepare('SELECT COALESCE(SUM(size),0) as s FROM site_photos WHERE tenant_id = ?').get(tenantId)?.s || 0; } catch { return 0; } })();
    return d + p;
  } catch { return 0; }
}

router.get('/tmp/:tmpId', (req, res) => {
  if (isClientUser(req.user)) {
    const tmp = db.prepare('SELECT id, project_id FROM traffic_management_plans WHERE id = ?').get(req.params.tmpId);
    if (!tmpOwnedByClient(tmp, req.user.clientId)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
  }
  const tenantId = getTenantId(req);
  let docs;
  if (tenantId) {
    try { docs = db.prepare('SELECT * FROM documents WHERE tmp_id = ? AND tenant_id = ? ORDER BY created_at DESC').all(req.params.tmpId, tenantId); }
    catch { docs = db.prepare('SELECT * FROM documents WHERE tmp_id = ? ORDER BY created_at DESC').all(req.params.tmpId); }
  } else {
    docs = db.prepare('SELECT * FROM documents WHERE tmp_id = ? ORDER BY created_at DESC').all(req.params.tmpId);
  }
  res.json(docs);
});

router.post('/upload/:tmpId', roleAtLeast('staff'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const tmp = db.prepare('SELECT id, tenant_id FROM traffic_management_plans WHERE id = ?').get(req.params.tmpId);
  if (!tmp) return res.status(404).json({ error: 'TMP not found' });
  const tenantId = getTenantId(req);
  if (tenantId && tmp.tenant_id && tmp.tenant_id !== tenantId) return res.status(403).json({ error: 'Tenant mismatch' });
  const effectiveTenantId = tenantId || tmp.tenant_id || null;
  if (effectiveTenantId) {
    const limitGb = limitFor(effectiveTenantId, 'storage_gb');
    if (limitGb !== Infinity && limitGb != null) {
      const used = tenantStorageBytes(effectiveTenantId);
      const limitBytes = limitGb * 1024 * 1024 * 1024;
      const { allowed } = enforceLimit(effectiveTenantId, 'storage_gb', used + req.file.size > limitBytes ? limitGb : used);
      if (used + req.file.size > limitBytes || !allowed && used >= limitBytes) {
        try { fs.unlinkSync(path.join(uploadDir, req.file.filename)); } catch {}
        return res.status(402).json({ error: 'storage_limit_exceeded', message: `Storage limit ${limitGb}GB reached (${Math.round(used/1024/1024)}MB used). Upgrade plan.`, limit_gb: limitGb, used_bytes: used });
      }
    }
  }
  const id = uuid();
  const insertTenantId = effectiveTenantId;
  try { db.prepare('INSERT INTO documents (id, tmp_id, filename, original_name, mime_type, size, uploaded_by, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, req.params.tmpId, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.user.id, insertTenantId); }
  catch { db.prepare('INSERT INTO documents (id, tmp_id, filename, original_name, mime_type, size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, req.params.tmpId, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.user.id); }
  emitEvent('document.uploaded', { id, tmp_id: req.params.tmpId, filename: req.file.filename, original_name: req.file.originalname, mime_type: req.file.mimetype, size: req.file.size, uploaded_by: req.user.id, tenant_id: insertTenantId });
  res.status(201).json({ id, filename: req.file.filename, original_name: req.file.originalname });
});

function requireTmpAccess(doc, user) {
  if (!isClientUser(user)) return true;
  const tmp = db.prepare('SELECT id, project_id FROM traffic_management_plans WHERE id = ?').get(doc.tmp_id);
  return tmpOwnedByClient(tmp, user.clientId);
}

router.get('/download/:id', (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  const tenantId = getTenantId(req);
  if (tenantId && doc.tenant_id && doc.tenant_id !== tenantId) return res.status(403).json({ error: 'Tenant mismatch' });
  if (!requireTmpAccess(doc, req.user)) return res.status(403).json({ error: 'Insufficient permissions' });
  const filePath = path.join(uploadDir, doc.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });
  res.download(filePath, doc.original_name);
});

router.get('/preview/:id', (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  const tenantId = getTenantId(req);
  if (tenantId && doc.tenant_id && doc.tenant_id !== tenantId) return res.status(403).json({ error: 'Tenant mismatch' });
  if (!requireTmpAccess(doc, req.user)) return res.status(403).json({ error: 'Insufficient permissions' });
  const ext = path.extname(doc.original_name).toLowerCase();
  if (!['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
    return res.status(400).json({ error: 'Preview not available for this file type' });
  }
  const filePath = path.join(uploadDir, doc.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });
  res.setHeader('Content-Disposition', 'inline');
  res.sendFile(filePath);
});

router.delete('/:id', roleAtLeast('manager'), (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  const tenantId = getTenantId(req);
  if (tenantId && doc.tenant_id && doc.tenant_id !== tenantId) return res.status(403).json({ error: 'Tenant mismatch' });
  const filePath = path.join(uploadDir, doc.filename);
  try { fs.unlinkSync(filePath); } catch {}
  if (tenantId) {
    try { db.prepare('DELETE FROM documents WHERE id = ? AND tenant_id = ?').run(req.params.id, tenantId); }
    catch { db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id); }
  } else {
    db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
  }
  emitEvent('document.deleted', { id: req.params.id, tmp_id: doc.tmp_id, original_name: doc.original_name }, { by: req.user.id });
  res.json({ success: true });
});

export default router;
