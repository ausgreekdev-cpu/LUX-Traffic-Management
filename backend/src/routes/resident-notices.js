import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { authenticate, roleAtLeast } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { emitEvent } from '../events.js';
import { buildLetterPdf } from '../notices/letter.js';

const router = Router();
router.use(authenticate);
router.use(roleAtLeast('staff'));

const NOMINATIM_BASE = process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org';

async function _geocodeAddress(address) {
  try {
    const params = new URLSearchParams({
      q: address,
      format: 'json',
      limit: '1',
      addressdetails: '1'
    });
    const res = await fetch(`${NOMINATIM_BASE}/search?${params}`, {
      headers: { 'User-Agent': 'LUX-Traffic-Management/1.0' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), display_name: data[0].display_name };
  } catch {
    return null;
  }
}

async function reverseGeocode(lat, lon) {
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      format: 'json',
      addressdetails: '1'
    });
    const res = await fetch(`${NOMINATIM_BASE}/reverse?${params}`, {
      headers: { 'User-Agent': 'LUX-Traffic-Management/1.0' }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function _haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function buildAddressFilter(addressFilter) {
  if (!addressFilter) return { suburbs: [], postcodes: [], maxDistanceM: 200 };
  try {
    const parsed = typeof addressFilter === 'string' ? JSON.parse(addressFilter) : addressFilter;
    return {
      suburbs: Array.isArray(parsed.suburbs) ? parsed.suburbs.map(String) : [],
      postcodes: Array.isArray(parsed.postcodes) ? parsed.postcodes.map(String) : [],
      maxDistanceM: Number(parsed.max_distance_m) || 200
    };
  } catch {
    return { suburbs: [], postcodes: [], maxDistanceM: 200 };
  }
}

function filterByAddress(geo, filter) {
  if (!geo?.address) return false;
  if (filter.suburbs.length) {
    const sub = geo.address.suburb || geo.address.city || geo.address.town || geo.address.village || '';
    if (!filter.suburbs.some(s => sub.toLowerCase().includes(s.toLowerCase()))) return false;
  }
  if (filter.postcodes.length) {
    const pc = geo.address.postcode || '';
    if (!filter.postcodes.some(p => pc.includes(p))) return false;
  }
  return true;
}

// List resident notices for a TMP
router.get('/tmp/:tmpId', async (req, res) => {
  const rows = db.prepare('SELECT * FROM resident_notices WHERE tmp_id = ? ORDER BY created_at DESC').all(req.params.tmpId);
  res.json(rows.map(r => ({ ...r, recipients: JSON.parse(r.recipients_json), address_filter: buildAddressFilter(r.address_filter) })));
});

// Get single notice
router.get('/:id', async (req, res) => {
  const row = db.prepare('SELECT * FROM resident_notices WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Notice not found' });
  res.json({ ...row, recipients: JSON.parse(row.recipients_json), address_filter: buildAddressFilter(row.address_filter) });
});

// Create a notice (draft)
router.post('/', validate('residentNotice'), async (req, res) => {
  const { tmp_id, template_id, subject, body, html_body, radius_m, address_filter, recipients } = req.validated;
  const tmp = db.prepare('SELECT * FROM traffic_management_plans WHERE id = ?').get(tmp_id);
  if (!tmp) return res.status(404).json({ error: 'TMP not found' });
  if (template_id && !db.prepare('SELECT id FROM email_templates WHERE id = ?').get(template_id)) {
    return res.status(404).json({ error: 'Template not found' });
  }
  const id = uuid();
  db.prepare(`INSERT INTO resident_notices (id, tmp_id, template_id, subject, body, html_body, radius_m, address_filter, recipients_json, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, tmp_id, template_id || null, subject, body, html_body || null, radius_m || 200,
    address_filter ? JSON.stringify(address_filter) : null, JSON.stringify(recipients || []), req.user.id
  );
  emitEvent('resident_notice.created', { id, tmp_id, by: req.user.id });
  res.status(201).json(db.prepare('SELECT * FROM resident_notices WHERE id = ?').get(id));
});

// Update a draft notice
router.put('/:id', validate('residentNotice'), async (req, res) => {
  const existing = db.prepare('SELECT * FROM resident_notices WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Notice not found' });
  if (existing.status !== 'draft') return res.status(400).json({ error: 'Only draft notices can be edited' });
  const { subject, body, html_body, radius_m, address_filter, recipients, template_id } = req.validated;
  if (template_id && !db.prepare('SELECT id FROM email_templates WHERE id = ?').get(template_id)) {
    return res.status(404).json({ error: 'Template not found' });
  }
  db.prepare(`UPDATE resident_notices SET subject=?, body=?, html_body=?, radius_m=?, address_filter=?, recipients_json=?, template_id=?, updated_at=datetime('now') WHERE id=?`).run(
    subject, body, html_body || null, radius_m || 200,
    address_filter ? JSON.stringify(address_filter) : null,
    JSON.stringify(recipients || []), template_id || null, req.params.id
  );
  res.json(db.prepare('SELECT * FROM resident_notices WHERE id = ?').get(req.params.id));
});

// Delete a draft notice
router.delete('/:id', async (req, res) => {
  const existing = db.prepare('SELECT * FROM resident_notices WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Notice not found' });
  if (existing.status !== 'draft') return res.status(400).json({ error: 'Only draft notices can be deleted' });
  db.prepare('DELETE FROM resident_notices WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Auto-suggest recipients within impact radius of the TMP site
router.post('/tmp/:tmpId/suggest-recipients', async (req, res) => {
  const tmp = db.prepare(`
    SELECT t.*, s.latitude, s.longitude, s.suburb, s.postcode, s.name as site_name
    FROM traffic_management_plans t
    LEFT JOIN sites s ON t.site_id = s.id
    WHERE t.id = ?
  `).get(req.params.tmpId);
  if (!tmp) return res.status(404).json({ error: 'TMP not found' });
  if (!tmp.latitude || !tmp.longitude) return res.status(400).json({ error: 'Site has no coordinates' });

  const radius = req.body?.radius_m || 200;
  const filter = buildAddressFilter(req.body?.address_filter);
  const maxDist = Math.min(filter.maxDistanceM || radius, 2000);

  // For MVP: use a simple static dataset or OSM query for nearby addresses.
  // In production, you'd query a local address database or use a service.
  // Here we'll do a Nominatim reverse search for the center point and a few offsets.
  // For demo, we return the site itself as a placeholder recipient.
  // TODO: integrate with a proper address database (GNAF, Landgate, etc.)

  const center = await reverseGeocode(tmp.latitude, tmp.longitude);
  const suggestions = [];
  if (center && filterByAddress(center, filter)) {
    suggestions.push({
      name: 'Occupier',
      address: center.display_name || `${tmp.site_name}, ${tmp.suburb} ${tmp.postcode}`,
      email: null,
      phone: null,
      channel: 'letter',
      distance_m: 0,
      lat: tmp.latitude,
      lon: tmp.longitude
    });
  }

  // Also return the site coordinates for the map
  res.json({ site: { lat: tmp.latitude, lon: tmp.longitude, name: tmp.site_name }, suggestions, maxDistanceM: maxDist });
});

// Queue notice for sending (validates recipients, generates PDFs for letters)
router.post('/:id/queue', async (req, res) => {
  const notice = db.prepare('SELECT * FROM resident_notices WHERE id = ?').get(req.params.id);
  if (!notice) return res.status(404).json({ error: 'Notice not found' });
  if (notice.status !== 'draft') return res.status(400).json({ error: 'Only draft notices can be queued' });

  const recipients = JSON.parse(notice.recipients_json);
  if (!recipients.length) return res.status(400).json({ error: 'No recipients defined' });

  // Validate: each recipient must have address + at least one channel contact
  for (const r of recipients) {
    if (!r.address) return res.status(400).json({ error: 'Recipient missing address' });
    if (r.channel === 'email' && !r.email) return res.status(400).json({ error: `Recipient ${r.name} has email channel but no email` });
    if (r.channel === 'letter' && !r.address) return res.status(400).json({ error: `Recipient ${r.name} has letter channel but no address` });
  }

  db.prepare("UPDATE resident_notices SET status='queued', updated_at=datetime('now') WHERE id=?").run(req.params.id);
  emitEvent('resident_notice.queued', { id: notice.id, tmp_id: notice.tmp_id, recipient_count: recipients.length, by: req.user.id });
  res.json({ success: true, recipient_count: recipients.length });
});

// Send notice (process queue - in production this would be async via automation)
router.post('/:id/send', async (req, res) => {
  const notice = db.prepare('SELECT * FROM resident_notices WHERE id = ?').get(req.params.id);
  if (!notice) return res.status(404).json({ error: 'Notice not found' });
  if (!['draft', 'queued'].includes(notice.status)) return res.status(400).json({ error: 'Notice not in sendable state' });

  const recipients = JSON.parse(notice.recipients_json);
  if (!recipients.length) return res.status(400).json({ error: 'No recipients' });

  db.prepare("UPDATE resident_notices SET status='sending', updated_at=datetime('now') WHERE id=?").run(req.params.id);

  let sent = 0, failed = 0;
  const results = [];

  for (const r of recipients) {
    try {
      if (r.channel === 'email' || r.channel === 'both') {
        if (r.email) {
          // Use email service
          const { sendEmail } = await import('../email.js');
          await sendEmail({
            to: r.email,
            subject: notice.subject,
            text: notice.body.replace('{{name}}', r.name).replace('{{address}}', r.address),
            html: notice.html_body?.replace('{{name}}', r.name).replace('{{address}}', r.address)
          });
        }
      }
      if (r.channel === 'letter' || r.channel === 'both') {
        // Generate letter PDF
        const pdfBuffer = await buildLetterPdf({
          heading: notice.subject,
          body: notice.body.replace('{{name}}', r.name).replace('{{address}}', r.address),
          recipient: r,
          tmp_id: notice.tmp_id
        });
        // Store PDF as document attached to TMP
        const docId = uuid();
        db.prepare('INSERT INTO documents (id, tmp_id, original_name, mime_type, size_bytes, created_by) VALUES (?, ?, ?, ?, ?, ?)').run(
          docId, notice.tmp_id, `Letter-${r.name.replace(/\s+/g, '-')}.pdf`, 'application/pdf', pdfBuffer.length, req.user.id
        );
        // TODO: actually write file to storage; for now we just record it
      }
      r.status = 'sent';
      r.sent_at = new Date().toISOString();
      sent++;
    } catch (err) {
      r.status = 'failed';
      r.error = err.message;
      failed++;
    }
    results.push(r);
  }

  const finalStatus = failed === 0 ? 'sent' : (sent > 0 ? 'partial' : 'failed');
  db.prepare("UPDATE resident_notices SET status=?, recipients_json=?, sent_at=?, completed_at=?, updated_at=datetime('now') WHERE id=?").run(
    finalStatus, JSON.stringify(results), new Date().toISOString(), new Date().toISOString(), req.params.id
  );
  emitEvent('resident_notice.sent', { id: notice.id, tmp_id: notice.tmp_id, sent, failed, by: req.user.id });
  res.json({ success: true, sent, failed, results });
});

// Download letter PDF for a specific recipient (placeholder - real impl would fetch from storage)
router.get('/:id/letter/:recipientIndex', async (req, res) => {
  const notice = db.prepare('SELECT * FROM resident_notices WHERE id = ?').get(req.params.id);
  if (!notice) return res.status(404).json({ error: 'Notice not found' });
  const recipients = JSON.parse(notice.recipients_json);
  const idx = parseInt(req.params.recipientIndex);
  const recipient = recipients[idx];
  if (!recipient) return res.status(404).json({ error: 'Recipient not found' });

  const pdfBuffer = await buildLetterPdf({
    heading: notice.subject,
    body: notice.body.replace('{{name}}', recipient.name).replace('{{address}}', recipient.address),
    recipient,
    tmp_id: notice.tmp_id
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="letter-${recipient.name.replace(/\s+/g, '-')}.pdf"`);
  res.send(pdfBuffer);
});

function _deserializeNotice(r) {
  if (!r) return null;
  return { ...r, recipients: JSON.parse(r.recipients_json), address_filter: buildAddressFilter(r.address_filter) };
}

export default router;