import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { fileURLToPath } from 'url';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { emitEvent } from '../events.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = process.env.UPLOADS_DIR || path.resolve(__dirname, '..', '..', 'uploads');
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

router.get('/tmp/:tmpId', (req, res) => {
  const docs = db.prepare('SELECT * FROM documents WHERE tmp_id = ? ORDER BY created_at DESC').all(req.params.tmpId);
  res.json(docs);
});

router.post('/upload/:tmpId', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const id = uuid();
  db.prepare('INSERT INTO documents (id, tmp_id, filename, original_name, mime_type, size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, req.params.tmpId, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.user.id);
  emitEvent('document.uploaded', { id, tmp_id: req.params.tmpId, filename: req.file.filename, original_name: req.file.originalname, mime_type: req.file.mimetype, size: req.file.size, uploaded_by: req.user.id });
  res.status(201).json({ id, filename: req.file.filename, original_name: req.file.originalname });
});

router.get('/download/:id', (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  const filePath = path.join(uploadDir, doc.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });
  res.download(filePath, doc.original_name);
});

router.get('/preview/:id', (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  const ext = path.extname(doc.original_name).toLowerCase();
  if (!['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
    return res.status(400).json({ error: 'Preview not available for this file type' });
  }
  const filePath = path.join(uploadDir, doc.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });
  res.setHeader('Content-Disposition', 'inline');
  res.sendFile(filePath);
});

router.delete('/:id', (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  const filePath = path.join(uploadDir, doc.filename);
  try { fs.unlinkSync(filePath); } catch {}
  db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
  emitEvent('document.deleted', { id: req.params.id, tmp_id: doc.tmp_id, original_name: doc.original_name }, { by: req.user.id });
  res.json({ success: true });
});

export default router;
