import { Router } from 'express';
import PDFDocument from 'pdfkit';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/tmp/:id', (req, res) => {
  const tmp = db.prepare(`
    SELECT t.*, s.name as site_name, s.road_name, s.suburb, p.name as project_name, c.name as client_name, c.company as client_company
    FROM traffic_management_plans t
    LEFT JOIN sites s ON t.site_id = s.id
    LEFT JOIN tmp_projects p ON t.project_id = p.id
    LEFT JOIN clients c ON p.client_id = c.id WHERE t.id = ?
  `).get(req.params.id);
  if (!tmp) return res.status(404).json({ error: 'TMP not found' });

  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${tmp.reference || 'TMP'}.pdf"`);
  doc.pipe(res);

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
  if (tmp.start_date) doc.text(`Start Date: ${tmp.start_date}`);
  if (tmp.end_date) doc.text(`End Date: ${tmp.end_date}`);
  doc.moveDown();
  doc.fontSize(10).text(`Generated: ${new Date().toISOString().slice(0, 10)}`, { align: 'right' });
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
    doc.text(`${p.tmp_reference || 'N/A'} | ${p.authority_short || 'N/A'} | ${p.status} | ${p.complexity}`);
  });
  if (!permits.length) doc.text('No permits found.');
  doc.end();
});

function csvEscape(v) { const s = String(v || ''); return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s; }

router.get('/tmps-csv', (req, res) => {
  const tmps = db.prepare(`
    SELECT t.reference, t.title, t.status, t.plan_type, s.name as site_name, p.name as project_name, t.created_at
    FROM traffic_management_plans t
    LEFT JOIN sites s ON t.site_id = s.id
    LEFT JOIN tmp_projects p ON t.project_id = p.id
    ORDER BY t.created_at DESC
  `).all();
  const header = 'Reference,Title,Status,Type,Site,Project,Created';
  const rows = tmps.map(t => [t.reference, t.title, t.status, t.plan_type, t.site_name, t.project_name, t.created_at].map(csvEscape).join(','));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="tmps.csv"');
  res.send([header, ...rows].join('\n'));
});

router.get('/permits-csv', (req, res) => {
  const permits = db.prepare(`
    SELECT t.reference as tmp_ref, au.name as authority, p.status, p.complexity, p.submission_date, p.approval_date
    FROM permits p
    LEFT JOIN traffic_management_plans t ON p.tmp_id = t.id
    LEFT JOIN authorities au ON p.authority_id = au.id
    ORDER BY p.created_at DESC
  `).all();
  const header = 'TMP Reference,Authority,Status,Complexity,Submitted,Approved';
  const rows = permits.map(p => [p.tmp_ref, p.authority, p.status, p.complexity, p.submission_date, p.approval_date].map(csvEscape).join(','));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="permits.csv"');
  res.send([header, ...rows].join('\n'));
});

export default router;
