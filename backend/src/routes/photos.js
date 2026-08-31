import { Router } from 'express';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { roleAtLeast } from '../middleware/auth.js';
import { isClientUser, tmpOwnedByClient } from '../middleware/scope.js';
import { getTenantId } from '../middleware/tenant.js';
import { limitFor, enforceLimit } from '../saas/entitlements.js';
import { saveMedia, loadMedia, deleteMedia } from '../media-store.js';
import { emitEvent } from '../events.js';

const router = Router();
router.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

function sniffImage(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'image/png';
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return 'image/webp';
  return null;
}

const extFor = (mime) => (mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg');

router.post('/', roleAtLeast('staff'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const mime = sniffImage(req.file.buffer);
    if (!mime) return res.status(400).json({ error: 'Only JPEG, PNG or WebP images are accepted' });
    let meta = {};
    if (req.body && typeof req.body.meta === 'string' && req.body.meta.length) {
      try { meta = JSON.parse(req.body.meta); } catch { meta = {}; }
    }
    const tmpId = meta.tmp_id || req.body.tmp_id;
    if (!tmpId) return res.status(400).json({ error: 'tmp_id is required' });
    const tmp = db.prepare('SELECT id, tenant_id FROM traffic_management_plans WHERE id = ?').get(tmpId);
    if (!tmp) return res.status(404).json({ error: 'TMP not found' });
    const tenantId = getTenantId(req);
    if (tenantId && tmp.tenant_id && tmp.tenant_id !== tenantId) return res.status(403).json({ error: 'Tenant mismatch' });
    const effectiveTenantId = tenantId || tmp.tenant_id || null;
    if (effectiveTenantId) {
      const limitGb = limitFor(effectiveTenantId, 'storage_gb');
      if (limitGb !== Infinity && limitGb != null) {
        const used = (() => {
          try {
            const d = db.prepare('SELECT COALESCE(SUM(size),0) as s FROM documents WHERE tenant_id = ?').get(effectiveTenantId)?.s || 0;
            const p = (() => { try { return db.prepare('SELECT COALESCE(SUM(size),0) as s FROM site_photos WHERE tenant_id = ?').get(effectiveTenantId)?.s || 0; } catch { return 0; } })();
            return d + p;
          } catch { return 0; }
        })();
        const limitBytes = limitGb * 1024 * 1024 * 1024;
        if (used + req.file.size > limitBytes) {
          return res.status(402).json({ error: 'storage_limit_exceeded', message: `Storage limit ${limitGb}GB reached (${Math.round(used/1024/1024)}MB used). Upgrade plan.`, limit_gb: limitGb, used_bytes: used });
        }
        const { allowed } = enforceLimit(effectiveTenantId, 'storage_gb', used);
        if (!allowed && used >= limitBytes) return res.status(402).json({ error: 'storage_limit_exceeded', message: `Storage limit ${limitGb}GB reached` });
      }
    }
    const id = uuid();
    const key = await saveMedia(id, extFor(mime), req.file.buffer, { mime });
    const latitude = Number.isFinite(Number(meta.latitude)) ? Number(meta.latitude) : null;
    const longitude = Number.isFinite(Number(meta.longitude)) ? Number(meta.longitude) : null;
    const watermarkOn = meta.watermark_on === false || meta.watermark_on === 'false' || meta.watermark_on === 0 ? 0 : 1;
    try {
      db.prepare(`
        INSERT INTO site_photos (id, tmp_id, card_id, blob_key, mime_type, size, latitude, longitude, captured_at, caption, watermark_on, uploaded_by, tenant_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, tmpId, meta.card_id || null, key, mime, req.file.size, latitude, longitude, meta.captured_at || null, meta.caption || null, watermarkOn, req.user.id, effectiveTenantId);
    } catch {
      db.prepare(`
        INSERT INTO site_photos (id, tmp_id, card_id, blob_key, mime_type, size, latitude, longitude, captured_at, caption, watermark_on, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, tmpId, meta.card_id || null, key, mime, req.file.size, latitude, longitude, meta.captured_at || null, meta.caption || null, watermarkOn, req.user.id);
    }
    emitEvent('photo.uploaded', { id, tmp_id: tmpId, card_id: meta.card_id || null, uploaded_by: req.user.id, size: req.file.size, tenant_id: effectiveTenantId });
    res.status(201).json({ id, tmp_id: tmpId, mime_type: mime, size: req.file.size });
  } catch (err) {
    next(err);
  }
});

router.get('/tmps/:tmpId', (req, res) => {
  if (isClientUser(req.user)) {
    const tmp = db.prepare('SELECT id, project_id FROM traffic_management_plans WHERE id = ?').get(req.params.tmpId);
    if (!tmpOwnedByClient(tmp, req.user.clientId)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
  }
  const tenantId = getTenantId(req);
  let photos;
  if (tenantId) {
    try {
      photos = db.prepare(`
        SELECT p.*, u.name as uploaded_by_name
        FROM site_photos p LEFT JOIN users u ON p.uploaded_by = u.id
        WHERE p.tmp_id = ? AND p.tenant_id = ? ORDER BY p.created_at DESC
      `).all(req.params.tmpId, tenantId);
    } catch {
      photos = db.prepare(`
        SELECT p.*, u.name as uploaded_by_name
        FROM site_photos p LEFT JOIN users u ON p.uploaded_by = u.id
        WHERE p.tmp_id = ? ORDER BY p.created_at DESC
      `).all(req.params.tmpId);
    }
  } else {
    photos = db.prepare(`
      SELECT p.*, u.name as uploaded_by_name
      FROM site_photos p LEFT JOIN users u ON p.uploaded_by = u.id
      WHERE p.tmp_id = ? ORDER BY p.created_at DESC
    `).all(req.params.tmpId);
  }
  res.json(photos);
});

router.get('/:id', async (req, res, next) => {
  try {
    const photo = db.prepare('SELECT * FROM site_photos WHERE id = ?').get(req.params.id);
    if (!photo) return res.status(404).json({ error: 'Photo not found' });
    const tenantId = getTenantId(req);
    if (tenantId && photo.tenant_id && photo.tenant_id !== tenantId) return res.status(403).json({ error: 'Tenant mismatch' });
    if (isClientUser(req.user)) {
      const tmp = db.prepare('SELECT id, project_id FROM traffic_management_plans WHERE id = ?').get(photo.tmp_id);
      if (!tmpOwnedByClient(tmp, req.user.clientId)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
    }
    const buf = await loadMedia(photo.blob_key);
    if (!buf) return res.status(404).json({ error: 'Photo data not found' });
    res.setHeader('Content-Type', photo.mime_type);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', roleAtLeast('manager'), async (req, res, next) => {
  try {
    const photo = db.prepare('SELECT * FROM site_photos WHERE id = ?').get(req.params.id);
    if (!photo) return res.status(404).json({ error: 'Photo not found' });
    const tenantId = getTenantId(req);
    if (tenantId && photo.tenant_id && photo.tenant_id !== tenantId) return res.status(403).json({ error: 'Tenant mismatch' });
    await deleteMedia(photo.blob_key);
    if (tenantId) {
      try { db.prepare('DELETE FROM site_photos WHERE id = ? AND tenant_id = ?').run(req.params.id, tenantId); }
      catch { db.prepare('DELETE FROM site_photos WHERE id = ?').run(req.params.id); }
    } else {
      db.prepare('DELETE FROM site_photos WHERE id = ?').run(req.params.id);
    }
    emitEvent('photo.deleted', { id: req.params.id, tmp_id: photo.tmp_id }, { by: req.user.id });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;