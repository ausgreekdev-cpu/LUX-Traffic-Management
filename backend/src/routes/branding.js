import { Router } from 'express';
import path from 'path';
import multer from 'multer';
import db from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { saveAsset, loadAsset, deleteAsset, assetMimeType } from '../assets.js';
import {
  getPublicSummary, getFullBranding, saveBrandingRow, snapshotBranding,
  listVersions, restoreVersion, resetBranding, validateBrandingInput,
  computeAudit, buildCss
} from '../branding.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

const ASSET_SLOTS = new Set(['logo_light', 'logo_dark', 'favicon', 'apple_touch', 'pwa_192', 'pwa_512', 'splash', 'seal', 'font_ui', 'font_map']);

const SLOT_ALLOWED_MIME = {
  logo_light: ['image/png', 'image/svg+xml', 'image/webp'],
  logo_dark: ['image/png', 'image/svg+xml', 'image/webp'],
  favicon: ['image/svg+xml', 'image/png', 'image/x-icon', 'image/vnd.microsoft.icon'],
  apple_touch: ['image/png'],
  pwa_192: ['image/png'],
  pwa_512: ['image/png'],
  splash: ['image/png'],
  seal: ['image/png', 'image/svg+xml'],
  font_ui: ['font/ttf', 'font/otf', 'application/x-font-ttf', 'application/octet-stream'],
  font_map: ['font/ttf', 'font/otf', 'application/x-font-ttf', 'application/octet-stream']
};

// Public: consumed pre-login at boot to white-label the login page + app shell.
router.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(getPublicSummary());
});

// Public asset stream (logos on the login page, fonts for the web app).
router.get('/assets/:slot', async (req, res) => {
  const slot = String(req.params.slot || '');
  if (!ASSET_SLOTS.has(slot)) return res.status(404).json({ error: 'Unknown asset slot' });
  const mime = assetMimeType(slot);
  const buf = await loadAsset(slot).catch(() => null);
  if (!buf || !buf.length) return res.status(404).json({ error: 'Asset not found' });
  res.setHeader('Content-Type', mime || 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(buf);
});

// Full editable state + asset/version/domain listing.
router.get('/full', authenticate, authorize('developer'), (req, res) => {
  res.json(getFullBranding());
});

// Save any branding section. Previous state is snapshotted for rollback.
router.put('/', authenticate, authorize('developer'), (req, res) => {
  const { errors, clean } = validateBrandingInput(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });
  snapshotBranding(`Edit v${getFullBranding().css_version + 1}`, req.user.id);
  const css_version = saveBrandingRow(clean, req.user.id);
  res.json({ success: true, css_version, summary: getPublicSummary() });
});

// Live compute for the WYSIWYG preview without persisting.
router.post('/preview', authenticate, authorize('developer'), (req, res) => {
  const theme = req.body?.theme;
  const cssOverride = req.body?.css_override;
  res.json({
    css: buildCss(theme || {}, cssOverride || ''),
    audit: computeAudit(theme || {})
  });
});

router.post('/assets/:slot', authenticate, authorize('developer'), upload.single('file'), async (req, res) => {
  const slot = String(req.params.slot || '');
  if (!ASSET_SLOTS.has(slot)) return res.status(400).json({ error: 'Unknown asset slot' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const allowed = SLOT_ALLOWED_MIME[slot];
  if (allowed && !allowed.includes(req.file.mimetype)) {
    return res.status(400).json({ error: `Unsupported file type "${req.file.mimetype}". Allowed: ${allowed.join(', ')}` });
  }
  const isFont = slot === 'font_ui' || slot === 'font_map';
  if (isFont) {
    const ext = path.extname(req.file.originalname || '').toLowerCase();
    if (!['.ttf', '.otf'].includes(ext) && req.file.mimetype !== 'font/ttf' && !String(req.file.mimetype).includes('truetype')) {
      return res.status(400).json({ error: 'Only .ttf or .otf font files are supported (WOFF2 is not embeddable in PDFs).' });
    }
  }
  await saveAsset(slot, req.file.buffer, req.file.mimetype);
  db.prepare(`
    INSERT INTO branding_assets (slot, blob_key, mime_type, size, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(slot) DO UPDATE SET blob_key = excluded.blob_key, mime_type = excluded.mime_type, size = excluded.size, updated_at = excluded.updated_at
  `).run(slot, slot, req.file.mimetype, req.file.size, new Date().toISOString());
  res.json({ success: true, slot, mime_type: req.file.mimetype, size: req.file.size });
});

router.delete('/assets/:slot', authenticate, authorize('developer'), async (req, res) => {
  const slot = String(req.params.slot || '');
  if (!ASSET_SLOTS.has(slot)) return res.status(400).json({ error: 'Unknown asset slot' });
  await deleteAsset(slot);
  db.prepare('DELETE FROM branding_assets WHERE slot = ?').run(slot);
  res.json({ success: true });
});

router.post('/reset', authenticate, authorize('developer'), (req, res) => {
  resetBranding(req.user.id);
  res.json({ success: true, summary: getPublicSummary() });
});

router.get('/versions', authenticate, authorize('developer'), (req, res) => {
  res.json({ versions: listVersions(parseInt(req.query.limit, 10) || 25) });
});

router.post('/versions/:id/restore', authenticate, authorize('developer'), (req, res) => {
  const ok = restoreVersion(parseInt(req.params.id, 10), req.user.id);
  if (!ok) return res.status(404).json({ error: 'Version not found' });
  res.json({ success: true, summary: getPublicSummary() });
});

router.get('/domain', authenticate, authorize('developer'), (req, res) => {
  res.json({ domains: db.prepare('SELECT * FROM domain_map ORDER BY id').all() });
});

router.post('/domain', authenticate, authorize('developer'), (req, res) => {
  const domain = String(req.body?.domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return res.status(400).json({ error: 'Invalid domain' });
  try {
    const info = db.prepare('INSERT INTO domain_map (domain, is_primary, status, notes) VALUES (?, ?, ?, ?)')
      .run(domain, req.body?.is_primary ? 1 : 0, req.body?.status || 'pending', req.body?.notes || '');
    return res.status(201).json({ id: info.lastInsertRowid, domain });
  } catch {
    return res.status(409).json({ error: 'Domain already mapped' });
  }
});

router.delete('/domain/:id', authenticate, authorize('developer'), (req, res) => {
  db.prepare('DELETE FROM domain_map WHERE id = ?').run(parseInt(req.params.id, 10));
  res.json({ success: true });
});

export default router;
