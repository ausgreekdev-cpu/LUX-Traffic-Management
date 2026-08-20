import { Router } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import multer from 'multer';
import Database from 'better-sqlite3';
import db, { dbPath, reopenDatabase, isServerless } from '../db.js';
import { backupNow, listBackups, backupsDir } from '../backups.js';
import { authenticate } from '../middleware/auth.js';
import { roleAtLeast } from '../middleware/auth.js';
import { isClientUser, tmpOwnedByClient } from '../middleware/scope.js';
import { parseJson, DEFAULT_WATERMARK } from '../branding.js';
import { loadAsset } from '../assets.js';
import { deserializeMember, groupDefaults } from '../settings-defs.js';
import { buildSitePlanSvg } from '../compliance/siteplan.js';

const requirePkg = typeof require !== 'undefined' ? require : createRequire(import.meta.url);
let _PDFDocument = null;

function getPDFDocument() {
  if (!_PDFDocument) _PDFDocument = requirePkg('pdfkit');
  return _PDFDocument;
}

const router = Router();
router.use(authenticate);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function fmtDate(str) {
  if (!str) return str;
  const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return str;
  return getSetting('date_format', 'yyyymmdd') === 'ddmmyyyy' ? `${m[3]}/${m[2]}/${m[1]}` : `${m[1]}-${m[2]}-${m[3]}`;
}

function addFooter(doc) {
  const footer = getSetting('pdf_footer_text', '');
  if (!footer) return;
  doc.moveDown(2);
  doc.fontSize(8).fillColor('#666').text(footer, { align: 'center' });
  doc.fillColor('#000');
}

// Resolve the configured colour for a site's speed zone (export standards).
function speedZoneColor(speedLimit) {
  if (!speedLimit) return null;
  const defaults = groupDefaults('export');
  const row = db.prepare("SELECT value FROM settings WHERE key = 'export.speed_zone_colors'").get();
  const zones = row ? deserializeMember('export', 'speed_zone_colors', row.value) : defaults.speed_zone_colors;
  if (!Array.isArray(zones)) return null;
  const zone = [...zones].sort((a, b) => Math.abs((a.speed || 0) - speedLimit) - Math.abs((b.speed || 0) - speedLimit))[0];
  return zone && zone.color && /^#[0-9a-fA-F]{6}$/.test(zone.color) ? zone.color : null;
}

// ------------------------------------------------------ white-label branding

async function loadBranding() {
  const row = db.prepare('SELECT typography_json, pdf_layout_json, watermark_json FROM branding WHERE id = 1').get();
  if (!row) return null;
  return {
    typography: parseJson(row.typography_json, {}),
    layout: parseJson(row.pdf_layout_json, { header: [], footer: [] }),
    watermark: parseJson(row.watermark_json, DEFAULT_WATERMARK)
  };
}

async function registerBrandFont(doc, typography) {
  const src = typography && typography.ui && typography.ui.src;
  if (!src) return false;
  const bytes = await loadAsset(src).catch(() => null);
  if (!bytes || !bytes.length) return false;
  try {
    const tmpPath = path.join(os.tmpdir(), `lux-font-${Date.now()}-${String(src).replace(/[^a-zA-Z0-9_-]/g, '_')}`);
    fs.writeFileSync(tmpPath, bytes);
    doc.registerFont('brand', tmpPath);
    return true;
  } catch (err) {
    console.warn('Brand font registration failed:', err.message);
    return false;
  }
}

function watermarkText(wm, status) {
  if (!wm || wm.mode === 'off') return '';
  if (wm.mode === 'status') return (wm.status_text && wm.status_text[status]) || '';
  return wm.text || '';
}

function drawWatermark(doc, text, wm) {
  const { width, height } = doc.page;
  doc.save();
  doc.rotate(-30, { origin: [width / 2, height / 2] });
  doc.fontSize(wm.fontSize || 56)
    .fillColor(wm.color || '#cccccc')
    .fillOpacity(typeof wm.opacity === 'number' ? wm.opacity : 0.14);
  doc.text(text, width / 2, height / 2, { align: 'center', lineBreak: false });
  doc.restore();
  doc.fillColor('#000');
  doc.fillOpacity(1);
}

function drawBlock(doc, b, ctx) {
  const font = ctx.brandFont ? 'brand' : 'Helvetica';
  const size = b.size || 10;
  const align = b.align || 'left';
  const x = b.x !== undefined ? b.x : 50;
  const y = b.y !== undefined ? b.y : 50;

  if (b.type === 'logo' || b.type === 'seal') {
    const buffer = b.type === 'logo' ? ctx.logoBuffer : ctx.sealBuffer;
    if (!buffer) return;
    const w = b.width || (b.type === 'logo' ? 140 : 64);
    const h = b.height || (b.type === 'logo' ? 40 : 64);
    try { doc.image(buffer, x, y, { fit: [w, h] }); } catch (err) { console.warn('brand image draw failed:', err.message); }
    return;
  }

  let content;
  switch (b.type) {
    case 'text': content = b.text || ''; break;
    case 'company_name': content = ctx.companyName; break;
    case 'company_details': content = [ctx.companyPhone, ctx.companyEmail].filter(Boolean).join('  |  '); break;
    case 'plan_title': content = ctx.tmpTitle; break;
    case 'reference': content = ctx.reference ? `Reference: ${ctx.reference}` : ''; break;
    case 'permit_number': content = ctx.permitNumber ? `Permit: ${ctx.permitNumber}` : ''; break;
    case 'accreditation': content = ctx.accreditation || ''; break;
    case 'generated_at': content = `Generated: ${fmtDate(new Date().toISOString())}`; break;
    case 'page_number': content = `Page ${doc.page.pageNumber || 1}`; break;
    default: content = '';
  }
  if (!content) return;
  doc.font(font).fontSize(size).fillColor(b.color || '#000000');
  doc.text(content, x, y, { width: doc.page.width - 100, align, lineBreak: false });
  doc.fillColor('#000');
}

function renderHeaderBlocks(doc, layout, ctx) {
  for (const b of layout.header || []) drawBlock(doc, b, ctx);
  doc.moveDown();
}

function renderFooterBlocks(doc, layout, ctx) {
  for (const b of layout.footer || []) {
    const y = doc.page.height - 70 + (b.y || 0);
    drawBlock(doc, { ...b, y }, ctx);
  }
}

async function applyBranding(doc, tmp) {
  const br = await loadBranding();
  if (!br) return { footerHandled: false, headerHandled: false };

  const ctx = {
    companyName: getSetting('company_name', ''),
    companyPhone: getSetting('company_phone', ''),
    companyEmail: getSetting('company_email', ''),
    tmpTitle: tmp.title,
    reference: tmp.reference,
    accreditation: getSetting('company_abn', '') ? `ABN ${getSetting('company_abn', '')}` : '',
    brandFont: false,
    logoBuffer: null,
    sealBuffer: null
  };
  const permits = db.prepare('SELECT pe.status, au.short_name FROM permits pe LEFT JOIN authorities au ON pe.authority_id = au.id WHERE pe.tmp_id = ?').all(tmp.id);
  ctx.permitNumber = permits.filter(p => p.status === 'approved').map(p => p.short_name || 'approved').filter(Boolean).join(', ') || undefined;

  ctx.brandFont = await registerBrandFont(doc, br.typography);
  ctx.logoBuffer = await loadAsset('logo_dark').catch(() => null);
  ctx.sealBuffer = await loadAsset('seal').catch(() => null);

  const wmText = watermarkText(br.watermark, tmp.status);
  const hasHeader = Array.isArray(br.layout.header) && br.layout.header.length > 0;
  const hasFooter = Array.isArray(br.layout.footer) && br.layout.footer.length > 0;

  const perPage = () => {
    if (wmText) drawWatermark(doc, wmText, br.watermark);
    if (hasFooter) renderFooterBlocks(doc, br.layout, ctx);
  };
  perPage();
  doc.on('pageAdded', perPage);

  if (hasHeader) renderHeaderBlocks(doc, br.layout, ctx);

  return { footerHandled: hasFooter || !!wmText, headerHandled: hasHeader, watermark: wmText };
}

async function applyWatermarkFooter(doc, status, extra = {}) {
  const br = await loadBranding();
  if (!br) return { footerHandled: false };
  const ctx = {
    companyName: getSetting('company_name', ''),
    companyPhone: getSetting('company_phone', ''),
    companyEmail: getSetting('company_email', ''),
    tmpTitle: '', reference: '', accreditation: '',
    brandFont: false, logoBuffer: null, sealBuffer: null,
    ...extra
  };
  const wmText = watermarkText(br.watermark, status);
  const hasFooter = Array.isArray(br.layout.footer) && br.layout.footer.length > 0;
  const perPage = () => {
    if (wmText) drawWatermark(doc, wmText, br.watermark);
    if (hasFooter) renderFooterBlocks(doc, br.layout, ctx);
  };
  perPage();
  doc.on('pageAdded', perPage);
  return { footerHandled: hasFooter || !!wmText };
}

router.get('/db-backup', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const backupPath = path.join(os.tmpdir(), `lux-backup-${Date.now()}.db`);
  db.backup(backupPath)
    .then(() => {
      res.download(backupPath, `lux-backup-${new Date().toISOString().slice(0, 10)}.db`, () => {
        try { fs.unlinkSync(backupPath); } catch {}
      });
    })
    .catch((err) => res.status(500).json({ error: 'Backup failed: ' + err.message }));
});

function requireAdmin(req, res) {
  if (req.user.role !== 'developer') {
    res.status(403).json({ error: 'Developer role required.' });
    return false;
  }
  return true;
}

function performRestore(res, srcPath) {
  let check = null;
  try {
    check = new Database(srcPath, { readonly: true });
    const ok = check.pragma('integrity_check', { simple: true });
    if (ok !== 'ok') throw new Error('integrity check failed: ' + ok);
    check.close();
    check = null;

    const safetyPath = dbPath + '.pre-restore';
    try { fs.copyFileSync(dbPath, safetyPath); } catch {}
    try { fs.copyFileSync(srcPath, dbPath); }
    catch (err) { return res.status(500).json({ error: 'Could not write database file: ' + err.message }); }

    reopenDatabase();
    const { c: userCount } = db.prepare('SELECT COUNT(*) as c FROM users').get();
    const { c: tmpCount } = db.prepare('SELECT COUNT(*) as c FROM traffic_management_plans').get();
    return res.json({ ok: true, users: userCount, tmps: tmpCount, message: 'Database restored successfully.' });
  } catch (err) {
    try { check && check.close(); } catch {}
    try {
      const safetyPath = dbPath + '.pre-restore';
      if (fs.existsSync(safetyPath)) {
        fs.copyFileSync(safetyPath, dbPath);
        reopenDatabase();
      }
    } catch {}
    return res.status(500).json({ error: 'Restore failed: ' + err.message });
  }
}

router.post('/db-restore', upload.single('file'), (req, res) => {
  if (isServerless) {
    return res.status(400).json({ error: 'Restore is not available on serverless deployments — the database is ephemeral there.' });
  }
  if (!requireAdmin(req, res)) return;
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }
  const buf = req.file.buffer;
  const magic = Buffer.from('SQLite format 3\u0000', 'utf8');
  if (buf.length < 16 || !buf.subarray(0, 16).equals(magic)) {
    return res.status(400).json({ error: 'File is not a SQLite database.' });
  }
  const tmpPath = path.join(os.tmpdir(), `lux-restore-${Date.now()}.db`);
  try {
    fs.writeFileSync(tmpPath, buf);
  } catch (err) {
    return res.status(500).json({ error: 'Could not stage upload: ' + err.message });
  }
  performRestore(res, tmpPath);
  try { fs.unlinkSync(tmpPath); } catch {}
});

router.get('/backups', (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (isServerless) return res.json({ backups: [], note: 'Auto-backups are not available on serverless deployments.' });
  res.json({ backups: listBackups() });
});

router.post('/backups/run', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (isServerless) return res.status(400).json({ error: 'Manual backups are not available on serverless deployments — data is persisted to Netlify Blobs instead.' });
  try {
    const result = await backupNow({ reason: 'manual' });
    res.json({ ok: true, ...result, message: 'Backup created.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/backups/restore', (req, res) => {
  if (isServerless) {
    return res.status(400).json({ error: 'Restore is not available on serverless deployments — the database is ephemeral there.' });
  }
  if (!requireAdmin(req, res)) return;
  const name = String(req.body?.name || '');
  if (path.basename(name) !== name || !/^lux-backup-\d{4}-\d{2}-\d{2}_[\d-]+\.db$/.test(name)) {
    return res.status(400).json({ error: 'Invalid backup name.' });
  }
  const filePath = path.join(backupsDir(), name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Backup not found.' });
  performRestore(res, filePath);
});

router.get('/backups/:name', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const name = path.basename(req.params.name);
  const filePath = path.join(backupsDir(), name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Backup not found.' });
  res.download(filePath, name);
});

router.delete('/backups/:name', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const name = path.basename(req.params.name);
  const filePath = path.join(backupsDir(), name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Backup not found.' });
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    return res.status(500).json({ error: 'Could not delete backup: ' + err.message });
  }
  res.json({ success: true });
});

router.get('/tmp/:id', async (req, res) => {
  const tmp = db.prepare(`
    SELECT t.*, s.name as site_name, s.road_name, s.suburb, s.speed_limit, p.name as project_name, c.name as client_name, c.company as client_company
    FROM traffic_management_plans t
    LEFT JOIN sites s ON t.site_id = s.id
    LEFT JOIN tmp_projects p ON t.project_id = p.id
    LEFT JOIN clients c ON p.client_id = c.id WHERE t.id = ?
  `).get(req.params.id);
  if (!tmp) return res.status(404).json({ error: 'TMP not found' });
  if (isClientUser(req.user) && !tmpOwnedByClient(tmp, req.user.clientId)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const companyName = getSetting('company_name', '');
  const companyPhone = getSetting('company_phone', '');
  const companyEmail = getSetting('company_email', '');

  const doc = new (getPDFDocument())({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${tmp.reference || 'TMP'}.pdf"`);
  doc.pipe(res);

  const branding = await applyBranding(doc, tmp).catch(() => ({ footerHandled: false, headerHandled: false }));

  if (!branding.headerHandled) {
    if (companyName) {
      doc.fontSize(16).text(companyName, { align: 'center' });
      if (companyPhone || companyEmail) {
        doc.fontSize(9).text([companyPhone, companyEmail].filter(Boolean).join('  |  '), { align: 'center' });
      }
      doc.moveDown();
    }
  }
  doc.fontSize(20).text('Traffic Management Plan', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12);
  doc.text(`Reference: ${tmp.reference}`);
  doc.text(`Title: ${tmp.title}`);
  doc.text(`Status: ${tmp.status}`);
  doc.text(`Type: ${tmp.plan_type}`);
  if (tmp.site_name) doc.text(`Site: ${tmp.site_name}${tmp.road_name ? ', ' + tmp.road_name : ''}${tmp.suburb ? ', ' + tmp.suburb : ''}`);
  const zoneColor = speedZoneColor(tmp.speed_limit);
  if (zoneColor && tmp.speed_limit) {
    const y = doc.y + 2;
    doc.fillColor(zoneColor).rect(50, y, 12, 12).fill();
    doc.fillColor('#000').fontSize(10).text(`  ${tmp.speed_limit} km/h speed zone`, 68, y);
    doc.moveDown();
  }
  if (tmp.project_name) doc.text(`Project: ${tmp.project_name}`);
  if (tmp.client_name) doc.text(`Client: ${tmp.client_name}${tmp.client_company ? ' (' + tmp.client_company + ')' : ''}`);
  if (tmp.description) { doc.moveDown(); doc.text('Description:'); doc.text(tmp.description); }
  if (tmp.start_date) doc.text(`Start Date: ${fmtDate(tmp.start_date)}`);
  if (tmp.end_date) doc.text(`End Date: ${fmtDate(tmp.end_date)}`);
  const stages = db.prepare('SELECT s.name, s.is_optional, COALESCE(c.is_done, 0) as is_done FROM workflow_stages s LEFT JOIN workflow_checklist c ON c.stage_id = s.id AND c.entity_type = ? AND c.entity_id = ? WHERE s.entity_type = ? ORDER BY s.sort_order').all('tmp', tmp.id, 'tmp');
  if (stages.length) {
    doc.moveDown();
    doc.fontSize(12).text('Workflow Checklist');
    doc.fontSize(10);
    stages.forEach(s => {
      doc.text(`${s.is_done ? '[X]' : '[ ]'} ${s.name}${s.is_optional ? ' (optional)' : ''}`);
    });
  }
  doc.moveDown();
  if (!branding.footerHandled) addFooter(doc);
  doc.fontSize(10).text(`Generated: ${fmtDate(new Date().toISOString())}`, { align: 'right' });
  doc.end();
});

router.get('/tmp/:id/site-plan.svg', async (req, res) => {
  const tmp = db.prepare(`
    SELECT t.*, s.name as site_name, s.road_name, s.suburb, s.road_class
    FROM traffic_management_plans t
    LEFT JOIN sites s ON t.site_id = s.id WHERE t.id = ?
  `).get(req.params.id);
  if (!tmp) return res.status(404).json({ error: 'TMP not found' });
  if (isClientUser(req.user) && !tmpOwnedByClient(tmp, req.user.clientId)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const site = tmp.site_id ? db.prepare('SELECT * FROM sites WHERE id = ?').get(tmp.site_id) : null;
  const tgs = db.prepare('SELECT layout_json FROM tgs WHERE tmp_id = ?').get(tmp.id) || null;
  const svg = buildSitePlanSvg({ tmp, site, tgs });
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Content-Disposition', `inline; filename="${tmp.reference || 'TMP'}-site-plan.svg"`);
  res.send(svg);
});

router.get('/permits-summary', roleAtLeast('staff'), async (req, res) => {
  const permits = db.prepare(`
    SELECT pe.*, au.name as authority_name, au.short_name as authority_short, t.title as tmp_title, t.reference as tmp_reference
    FROM permits pe
    LEFT JOIN authorities au ON pe.authority_id = au.id
    LEFT JOIN traffic_management_plans t ON pe.tmp_id = t.id
    ORDER BY pe.created_at DESC
  `).all();

  const doc = new (getPDFDocument())({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="permits-summary.pdf"');
  doc.pipe(res);

  const branding = await applyWatermarkFooter(doc, 'approved').catch(() => ({ footerHandled: false }));

  doc.fontSize(20).text('Permits Summary', { align: 'center' });
  doc.moveDown();
  doc.fontSize(10);
  permits.forEach(p => {
    doc.text(`${p.tmp_reference || 'N/A'} | ${p.authority_short || 'N/A'} | ${p.status} | ${p.complexity}${p.expiry_date ? ' | Expires ' + fmtDate(p.expiry_date) : ''}`);
  });
  if (!permits.length) doc.text('No permits found.');
  if (!branding.footerHandled) addFooter(doc);
  doc.end();
});

router.get('/audit-report', roleAtLeast('staff'), async (req, res) => {
  const activities = db.prepare(`
    SELECT a.*, u.name as user_name, t.title as tmp_title, t.reference as tmp_reference
    FROM plan_activities a
    LEFT JOIN users u ON a.user_id = u.id
    LEFT JOIN traffic_management_plans t ON a.tmp_id = t.id
    ORDER BY a.created_at DESC LIMIT 500
  `).all();

  const companyName = getSetting('company_name', '');

  const doc = new (getPDFDocument())({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="audit-report.pdf"');
  doc.pipe(res);

  const branding = await applyWatermarkFooter(doc, 'completed').catch(() => ({ footerHandled: false }));

  if (companyName) {
    doc.fontSize(16).text(companyName, { align: 'center' });
    doc.moveDown();
  }
  doc.fontSize(20).text('Activity Audit Report', { align: 'center' });
  doc.moveDown();
  doc.fontSize(10);
  if (!activities.length) {
    doc.text('No activity recorded.');
  }
  for (const a of activities) {
    doc.text(`${fmtDate(a.created_at)}  |  ${a.user_name || 'unknown'}  |  ${a.action}  |  ${a.description || ''}${a.tmp_reference ? '  |  ' + a.tmp_reference : ''}`);
  }
  doc.moveDown();
  if (!branding.footerHandled) addFooter(doc);
  doc.fontSize(10).text(`Generated: ${fmtDate(new Date().toISOString())}`, { align: 'right' });
  doc.end();
});

function csvEscape(v) { const s = String(v || ''); return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s; }

router.get('/tmps-csv', roleAtLeast('staff'), (req, res) => {
  let q = `
    SELECT t.reference, t.title, t.status, t.plan_type, s.name as site_name, p.name as project_name, t.created_at, t.start_date, t.end_date
    FROM traffic_management_plans t
    LEFT JOIN sites s ON t.site_id = s.id
    LEFT JOIN tmp_projects p ON t.project_id = p.id`;
  const params = [];
  const conditions = [];
  if (req.query.status) { conditions.push('t.status = ?'); params.push(req.query.status); }
  if (req.query.search) { conditions.push('(t.title LIKE ? OR t.reference LIKE ? OR s.name LIKE ?)'); const s = `%${req.query.search}%`; params.push(s, s, s); }
  if (req.query.from) { conditions.push('t.created_at >= ?'); params.push(req.query.from); }
  if (req.query.to) { conditions.push('t.created_at <= ?'); params.push(req.query.to); }
  if (conditions.length) q += ' WHERE ' + conditions.join(' AND ');
  q += ' ORDER BY t.created_at DESC';
  const tmps = db.prepare(q).all(...params);
  const header = 'Reference,Title,Status,Type,Site,Project,Start Date,End Date,Created';
  const rows = tmps.map(t => [t.reference, t.title, t.status, t.plan_type, t.site_name, t.project_name, fmtDate(t.start_date), fmtDate(t.end_date), fmtDate(t.created_at)].map(csvEscape).join(','));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="tmps.csv"');
  res.send([header, ...rows].join('\n'));
});

router.get('/permits-csv', roleAtLeast('staff'), (req, res) => {
  let q = `
    SELECT t.reference as tmp_ref, au.name as authority, p.status, p.complexity, p.submission_date, p.approval_date, p.expiry_date
    FROM permits p
    LEFT JOIN traffic_management_plans t ON p.tmp_id = t.id
    LEFT JOIN authorities au ON p.authority_id = au.id`;
  const params = [];
  const conditions = [];
  if (req.query.status) { conditions.push('p.status = ?'); params.push(req.query.status); }
  if (req.query.authority_id) { conditions.push('p.authority_id = ?'); params.push(req.query.authority_id); }
  if (req.query.from) { conditions.push('p.created_at >= ?'); params.push(req.query.from); }
  if (req.query.to) { conditions.push('p.created_at <= ?'); params.push(req.query.to); }
  if (conditions.length) q += ' WHERE ' + conditions.join(' AND ');
  q += ' ORDER BY p.created_at DESC';
  const permits = db.prepare(q).all(...params);
  const header = 'TMP Reference,Authority,Status,Complexity,Submitted,Approved,Expiry';
  const rows = permits.map(p => [p.tmp_ref, p.authority, p.status, p.complexity, fmtDate(p.submission_date), fmtDate(p.approval_date), fmtDate(p.expiry_date)].map(csvEscape).join(','));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="permits.csv"');
  res.send([header, ...rows].join('\n'));
});

export default router;
