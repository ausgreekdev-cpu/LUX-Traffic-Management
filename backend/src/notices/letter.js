import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';
import db from '../db.js';
import { parseJson, DEFAULT_WATERMARK } from '../branding.js';
import { loadAsset } from '../assets.js';

const requirePkg = typeof require !== 'undefined' ? require : createRequire(import.meta.url);
let _PDFDocument = null;

function getPDFDocument() {
  if (!_PDFDocument) _PDFDocument = requirePkg('pdfkit');
  return _PDFDocument;
}

function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

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
  const src = typography?.ui?.src;
  if (!src) return false;
  const bytes = await loadAsset(src).catch(() => null);
  if (!bytes || !bytes.length) return false;
  try {
    const tmpPath = path.join(os.tmpdir(), `lux-font-${Date.now()}-${String(src).replace(/[^a-zA-Z0-9_-]/g, '_')}`);
    fs.writeFileSync(tmpPath, bytes);
    doc.registerFont('BrandFont', tmpPath);
    return true;
  } catch {
    return false;
  }
}

export async function buildLetterPdf({ heading, body, recipient, tmp_id: _tmp_id }) {
  const branding = await loadBranding();
  const companyName = getSetting('company_name', 'LUX Traffic Management');
  const companyPhone = getSetting('company_phone', '');
  const companyEmail = getSetting('company_email', '');
  const companyAddress = getSetting('company_address', '');

  const doc = new (getPDFDocument())({ margin: 50, size: 'A4' });
  const buffers = [];
  doc.on('data', buffers.push.bind(buffers));

  // const pageWidth = doc.page.width - 100;
  // let y = 50;

  if (branding?.typography) {
    await registerBrandFont(doc, branding.typography);
  }
  const useBrandFont = !!branding?.typography;

  // Company header
  if (useBrandFont) doc.font('BrandFont');
  doc.fontSize(18).fillColor('#1e3a8a').text(companyName, { align: 'left' });
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor('#64748b');
  const contactLine = [companyAddress, companyPhone, companyEmail].filter(Boolean).join('  |  ');
  if (contactLine) doc.text(contactLine, { align: 'left' });
  doc.moveDown(1.5);

  // Horizontal rule
  doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor('#1e3a8a').stroke();
  doc.moveDown(1);

  // Date
  doc.fontSize(10).fillColor('#374151').text(new Date().toLocaleDateString('en-AU'), { align: 'left' });
  doc.moveDown(1);

  // Recipient block
  if (recipient?.name) doc.fontSize(11).fillColor('#111827').text(recipient.name);
  if (recipient?.address) doc.fontSize(11).fillColor('#111827').text(recipient.address);
  doc.moveDown(1);

  // Subject / heading
  doc.fontSize(13).fillColor('#1e3a8a').font(useBrandFont ? 'BrandFont' : 'Helvetica-Bold').text(heading, { underline: true });
  doc.moveDown(1);

  // Body
  doc.fontSize(11).fillColor('#1f2937').font(useBrandFont ? 'BrandFont' : 'Helvetica');
  const lines = String(body).split('\n');
  for (const line of lines) {
    doc.text(line, { align: 'left' });
  }
  doc.moveDown(2);

  // Footer / signature block
  if (branding?.watermark?.enabled && branding.watermark.text) {
    doc.fontSize(8).fillColor('#94a3b8').text(branding.watermark.text, { align: 'center' });
    doc.moveDown(0.5);
  }
  doc.fontSize(10).fillColor('#374151').text('Yours sincerely,');
  doc.moveDown(0.8);
  doc.fontSize(10).fillColor('#1f2937').text(getSetting('signatory_name', 'Traffic Management Team'));
  doc.fontSize(9).fillColor('#64748b').text(getSetting('signatory_title', 'LUX Traffic Management'));

  doc.end();
  return new Promise((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(buffers)));
  });
}