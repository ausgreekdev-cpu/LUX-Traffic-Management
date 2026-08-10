import { v4 as uuid } from 'uuid';
import db from './db.js';
import { emitEvent } from './events.js';

const STATUS_PATTERNS = [
  { status: 'rejected', pattern: /\b(?:reject(?:ed|ion)?|refus(?:ed)?|declin(?:ed)?|not granted|not approved|cannot be approved|cant be approved)\b/i },
  { status: 'approved', pattern: /\bapprov(?:ed|al)\b/i },
  { status: 'requested_information', pattern: /\b(?:request(?:ing)?|further|more|additional) (?:for |of |)information\b/i },
  { status: 'under_review', pattern: /\b(?:under review|being assess(?:ed)?|assessment in progress)\b/i },
  { status: 'received', pattern: /\b(?:received|lodg(?:ed)?|submitted)\b/i }
];

const REF_PATTERN = /TMP-\d{4}-\d{3}/i;

export function parseCorrespondence({ sender: _sender = '', subject = '', raw_text = '' }) {
  const text = [subject, raw_text].join('\n');
  const refMatch = text.match(REF_PATTERN);
  const tmp_reference = refMatch ? refMatch[0].toUpperCase() : null;

  let extracted_status = null;
  for (const { status, pattern } of STATUS_PATTERNS) {
    if (pattern.test(text)) { extracted_status = status; break; }
  }

  let extracted_reason = null;
  if (extracted_status === 'rejected') {
    const sentences = raw_text ? raw_text.split(/(?<=[.!?])\s+/) : [];
    const reasonSentence = sentences.find(s => /reject|refus|declin|not granted|not approve/i.test(s)) || sentences[0];
    if (reasonSentence) {
      extracted_reason = reasonSentence.replace(/\b(?:your\s+)?(?:application|permit|traffic\s+management\s+plan|tmp)\b/i, '').replace(/\b(?:has been|was|is)\s+rejected|refused|declined\b/i, '').trim().replace(/[.!?]$/, '');
      if (!extracted_reason || extracted_reason.length < 3) extracted_reason = null;
    }
  }

  return { tmp_reference, extracted_status, extracted_reason };
}

export function matchPermit(tmpReference) {
  if (!tmpReference) return null;
  const tmp = db.prepare('SELECT * FROM traffic_management_plans WHERE reference = ?').get(tmpReference);
  if (!tmp) return null;
  const permit = db.prepare(`
    SELECT * FROM permits WHERE tmp_id = ? AND status IN ('submitted','under_review')
    ORDER BY created_at DESC LIMIT 1
  `).get(tmp.id) || db.prepare('SELECT * FROM permits WHERE tmp_id = ? ORDER BY created_at DESC LIMIT 1').get(tmp.id);
  return { tmp, permit: permit || null };
}

export function ingestCorrespondence({ source = 'webhook', provider = 'generic', sender = '', subject = '', raw_text = '', received_at = null }) {
  const parsed = parseCorrespondence({ sender, subject, raw_text });
  const matched = matchPermit(parsed.tmp_reference);
  const id = uuid();
  db.prepare(`
    INSERT INTO correspondence (id, source, provider, sender, subject, received_at, raw_text, tmp_reference, matched_tmp_id, matched_permit_id, extracted_status, extracted_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, source, provider, sender || null, subject || null, received_at || null, raw_text || null, parsed.tmp_reference, matched?.tmp?.id || null, matched?.permit?.id || null, parsed.extracted_status, parsed.extracted_reason);

  const payload = { id, source, provider, sender, subject, tmp_reference: parsed.tmp_reference, extracted_status: parsed.extracted_status, extracted_reason: parsed.extracted_reason, tmp_id: matched?.tmp?.id || null, permit_id: matched?.permit?.id || null, created_by: matched?.tmp?.created_by || null };
  emitEvent('correspondence.received', payload);
  if (matched) emitEvent('correspondence.matched', payload);
  return { id, ...payload };
}

export function reviewCorrespondence(id, { review_status, by = null }) {
  const row = db.prepare('SELECT * FROM correspondence WHERE id = ?').get(id);
  if (!row) return null;
  const status = ['new', 'reviewed', 'applied', 'dismissed'].includes(review_status) ? review_status : row.review_status;
  let applied = null;

  if (status === 'applied' && row.matched_permit_id && row.extracted_status && ['approved', 'rejected'].includes(row.extracted_status)) {
    const permit = db.prepare('SELECT * FROM permits WHERE id = ?').get(row.matched_permit_id);
    if (permit) {
      const nextStatus = row.extracted_status === 'approved' ? 'approved' : 'rejected';
      const now = new Date().toISOString().slice(0, 10);
      if (nextStatus === 'approved') {
        db.prepare("UPDATE permits SET status = 'approved', approval_date = ?, updated_at = datetime('now') WHERE id = ?").run(now, row.matched_permit_id);
      } else {
        db.prepare('UPDATE permits SET status = ?, rejection_reason = ?, updated_at = datetime(\'now\') WHERE id = ?').run(nextStatus, row.extracted_reason || 'Rejected per correspondence', row.matched_permit_id);
      }
      db.prepare('INSERT INTO plan_activities (id, tmp_id, user_id, action, description) VALUES (?, ?, ?, ?, ?)')
        .run(uuid(), permit.tmp_id, by || null, 'permit_status_changed', `Permit ${row.matched_permit_id.slice(0, 8)} ${nextStatus} from correspondence (${row.id.slice(0, 8)})`);
      emitEvent('permit.status_changed', db.prepare('SELECT * FROM permits WHERE id = ?').get(row.matched_permit_id), { previous_status: permit.status, by, from_correspondence: true });
      applied = { permit_id: row.matched_permit_id, status: nextStatus };
    }
  }

  db.prepare('UPDATE correspondence SET review_status = ?, reviewed_by = ?, reviewed_at = datetime(\'now\') WHERE id = ?').run(status, by || null, id);
  return { ...row, review_status: status, applied };
}
