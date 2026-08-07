import { Router } from 'express';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import os from 'os';
import path from 'path';
import db, { dbPath } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

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

function fmtAmount(amount) {
  const currency = getSetting('default_currency', 'AUD');
  const symbol = { AUD: '$', USD: '$', GBP: '£', EUR: '€', NZD: '$' }[currency] || '';
  const n = Number(amount || 0);
  return `${symbol}${n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function addFooter(doc) {
  const footer = getSetting('pdf_footer_text', '');
  if (!footer) return;
  doc.moveDown(2);
  doc.fontSize(8).fillColor('#666').text(footer, { align: 'center' });
  doc.fillColor('#000');
}

router.get('/db-backup', (req, res) => {
  const backupPath = path.join(os.tmpdir(), `lux-backup-${Date.now()}.db`);
  db.backup(backupPath)
    .then(() => {
      res.download(backupPath, `lux-backup-${new Date().toISOString().slice(0, 10)}.db`, () => {
        try { fs.unlinkSync(backupPath); } catch {}
      });
    })
    .catch((err) => res.status(500).json({ error: 'Backup failed: ' + err.message }));
});

router.get('/tmp/:id', (req, res) => {
  const tmp = db.prepare(`
    SELECT t.*, s.name as site_name, s.road_name, s.suburb, p.name as project_name, c.name as client_name, c.company as client_company
    FROM traffic_management_plans t
    LEFT JOIN sites s ON t.site_id = s.id
    LEFT JOIN tmp_projects p ON t.project_id = p.id
    LEFT JOIN clients c ON p.client_id = c.id WHERE t.id = ?
  `).get(req.params.id);
  if (!tmp) return res.status(404).json({ error: 'TMP not found' });

  const companyName = getSetting('company_name', '');
  const companyPhone = getSetting('company_phone', '');
  const companyEmail = getSetting('company_email', '');

  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${tmp.reference || 'TMP'}.pdf"`);
  doc.pipe(res);

  if (companyName) {
    doc.fontSize(16).text(companyName, { align: 'center' });
    if (companyPhone || companyEmail) {
      doc.fontSize(9).text([companyPhone, companyEmail].filter(Boolean).join('  |  '), { align: 'center' });
    }
    doc.moveDown();
  }
  doc.fontSize(20).text('Traffic Management Plan', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12);
  doc.text(`Reference: ${tmp.reference}`);
  doc.text(`Title: ${tmp.title}`);
  doc.text(`Status: ${tmp.status}`);
  doc.text(`Type: ${tmp.plan_type}`);
  if (tmp.site_name) doc.text(`Site: ${tmp.site_name}${tmp.road_name ? ', ' + tmp.road_name : ''}${tmp.suburb ? ', ' + tmp.suburb : ''}`);
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
  addFooter(doc);
  doc.fontSize(10).text(`Generated: ${fmtDate(new Date().toISOString())}`, { align: 'right' });
  doc.end();
});

router.get('/permits-summary', (req, res) => {
  const permits = db.prepare(`
    SELECT pe.*, au.name as authority_name, au.short_name as authority_short, t.title as tmp_title, t.reference as tmp_reference
    FROM permits pe
    LEFT JOIN authorities au ON pe.authority_id = au.id
    LEFT JOIN traffic_management_plans t ON pe.tmp_id = t.id
    ORDER BY pe.created_at DESC
  `).all();

  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="permits-summary.pdf"');
  doc.pipe(res);

  doc.fontSize(20).text('Permits Summary', { align: 'center' });
  doc.moveDown();
  doc.fontSize(10);
  permits.forEach(p => {
    doc.text(`${p.tmp_reference || 'N/A'} | ${p.authority_short || 'N/A'} | ${p.status} | ${p.complexity}${p.expiry_date ? ' | Expires ' + fmtDate(p.expiry_date) : ''}`);
  });
  if (!permits.length) doc.text('No permits found.');
  addFooter(doc);
  doc.end();
});

router.get('/audit-report', (req, res) => {
  const activities = db.prepare(`
    SELECT a.*, u.name as user_name, t.title as tmp_title, t.reference as tmp_reference
    FROM plan_activities a
    LEFT JOIN users u ON a.user_id = u.id
    LEFT JOIN traffic_management_plans t ON a.tmp_id = t.id
    ORDER BY a.created_at DESC LIMIT 500
  `).all();

  const companyName = getSetting('company_name', '');

  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="audit-report.pdf"');
  doc.pipe(res);

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
  addFooter(doc);
  doc.fontSize(10).text(`Generated: ${fmtDate(new Date().toISOString())}`, { align: 'right' });
  doc.end();
});

function csvEscape(v) { const s = String(v || ''); return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s; }

router.get('/tmps-csv', (req, res) => {
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

router.get('/permits-csv', (req, res) => {
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
