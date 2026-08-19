import { Router } from 'express';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { roleAtLeast } from '../middleware/auth.js';
import { isClientUser, tmpOwnedByClient } from '../middleware/scope.js';
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
    const tmp = db.prepare('SELECT id FROM traffic_management_plans WHERE id = ?').get(tmpId);
    if (!tmp) return res.status(404).json({ error: 'TMP not found' });
    const id = uuid();
    const key = await saveMedia(id, extFor(mime), req.file.buffer, { mime });
    const latitude = Number.isFinite(Number(meta.latitude)) ? Number(meta.latitude) : null;
    const longitude = Number.isFinite(Number(meta.longitude)) ? Number(meta.longitude) : null;
    const watermarkOn = meta.watermark_on === false || meta.watermark_on === 'false' || meta.watermark_on === 0 ? 0 : 1;
    db.prepare(`
      INSERT INTO site_photos (id, tmp_id, card_id, blob_key, mime_type, size, latitude, longitude, captured_at, caption, watermark_on, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, tmpId, meta.card_id || null, key, mime, req.file.size, latitude, longitude, meta.captured_at || null, meta.caption || null, watermarkOn, req.user.id);
    emitEvent('photo.uploaded', { id, tmp_id: tmpId, card_id: meta.card_id || null, uploaded_by: req.user.id, size: req.file.size });
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
  const photos = db.prepare(`
    SELECT p.*, u.name as uploaded_by_name
    FROM site_photos p LEFT JOIN users u ON p.uploaded_by = u.id
    WHERE p.tmp_id = ? ORDER BY p.created_at DESC
  `).all(req.params.tmpId);
  res.json(photos);
});

router.get('/:id', async (req, res, next) => {
  try {
    const photo = db.prepare('SELECT * FROM site_photos WHERE id = ?').get(req.params.id);
    if (!photo) return res.status(404).json({ error: 'Photo not found' });
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
    await deleteMedia(photo.blob_key);
    db.prepare('DELETE FROM site_photos WHERE id = ?').run(req.params.id);
    emitEvent('photo.deleted', { id: req.params.id, tmp_id: photo.tmp_id }, { by: req.user.id });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;