import { v4 as uuid } from 'uuid';
import db from './db.js';

export const PRESETS = [
  {
    id: 'approval_notify',
    name: 'Permit approved notification',
    description: 'Notify the TMP owner when a permit is approved.',
    entity_type: 'permit',
    event_type: 'permit.status_changed',
    conditions: [{ field: 'status', op: 'eq', value: 'approved' }],
    actions: [
      { type: 'notify_user', params: { title: 'Permit approved', message: 'Permit for {tmp_reference} was approved.', notification_type: 'permit' } }
    ],
    dedupe_key_template: 'approval-{id}',
    default_active: true
  },
  {
    id: 'rejection_notify',
    name: 'Permit rejected notification',
    description: 'Notify the TMP owner when a permit is rejected.',
    entity_type: 'permit',
    event_type: 'permit.status_changed',
    conditions: [{ field: 'status', op: 'eq', value: 'rejected' }],
    actions: [
      { type: 'notify_user', params: { title: 'Permit rejected', message: 'Permit rejected: {rejection_reason || "No reason given"}.', notification_type: 'permit' } }
    ],
    dedupe_key_template: 'rejection-{id}',
    default_active: true
  },
  {
    id: 'sla_deadline_notify',
    name: 'SLA deadline approaching',
    description: 'Notify the TMP owner when an SLA decision is due within 3 days.',
    entity_type: 'permit',
    event_type: 'sla.deadline_approaching',
    conditions: [{ field: 'days_left', op: 'lte', value: 3 }],
    actions: [
      { type: 'notify_user', params: { title: 'SLA decision due', message: 'Decision on permit for {tmp_reference} due in {days_left} days ({expiry_date}).', notification_type: 'sla_warning' } }
    ],
    dedupe_key_template: 'sla-{id}-{days_left}',
    default_active: true
  },
  {
    id: 'sla_overdue_escalate',
    name: 'SLA overdue escalation',
    description: 'Alert admins when an SLA decision is overdue.',
    entity_type: 'permit',
    event_type: 'sla.overdue',
    conditions: [],
    actions: [
      { type: 'notify_role', params: { role: 'manager', title: 'SLA overdue', message: 'Decision on permit for {tmp_reference} is {days_overdue} days overdue.', notification_type: 'sla_overdue' } },
      { type: 'create_task', params: { role: 'manager', title: 'Escalate SLA overdue', message: 'Follow up with {authority_short || "the authority"} on permit {id}.' } }
    ],
    dedupe_key_template: 'sla-overdue-{id}',
    default_active: true
  },
  {
    id: 'bond_return_check',
    name: 'Bond return check on completion',
    description: 'Remind admins to return bonds when a TMP is completed.',
    entity_type: 'tmp',
    event_type: 'tmp.completed',
    conditions: [],
    actions: [
      { type: 'notify_role', params: { role: 'manager', title: 'TMP completed - bonds due', message: '{reference} completed. Check outstanding bonds on its permits.' } },
      { type: 'create_task', params: { role: 'manager', title: 'Return bonds for {reference}', message: 'Review permit fees and return bonds for {reference}.' } }
    ],
    dedupe_key_template: 'bond-{id}',
    default_active: true
  },
  {
    id: 'tmp_expiry_warn',
    name: 'TMP expiry reminder',
    description: 'Notify the owner when a TMP is ending within the reminder window.',
    entity_type: 'tmp',
    event_type: 'tmp.expiring',
    conditions: [],
    actions: [
      { type: 'notify_user', params: { title: 'TMP {reference} ending soon', message: '{title} ends on {end_date}. Review and extend or close it.', notification_type: 'tmp_expiring' } }
    ],
    dedupe_key_template: 'tmp-end-{id}-{end_date}',
    default_active: true
  },
  {
    id: 'tmp_expired_notify',
    name: 'TMP ended without completion',
    description: 'Notify the owner when a TMP has ended but was not marked completed.',
    entity_type: 'tmp',
    event_type: 'tmp.expired',
    conditions: [],
    actions: [
      { type: 'notify_user', params: { title: 'TMP {reference} has ended', message: '{title} ended on {end_date} but has not been marked completed.', notification_type: 'tmp_expired' } }
    ],
    dedupe_key_template: 'tmp-end-{id}-{end_date}',
    default_active: true
  },
  {
    id: 'permit_expiry_warn',
    name: 'Permit expiry reminder',
    description: 'Notify the owner when an approved permit expires within the reminder window.',
    entity_type: 'permit',
    event_type: 'permit.expiring',
    conditions: [],
    actions: [
      { type: 'notify_user', params: { title: 'Permit for {tmp_reference} expiring soon', message: 'Approved permit expires on {expiry_date}. Check renewal or removal.', notification_type: 'permit_expiring' } }
    ],
    dedupe_key_template: 'permit-exp-{id}-{expiry_date}',
    default_active: true
  },
  {
    id: 'permit_expired_notify',
    name: 'Permit expired without update',
    description: 'Notify the owner when an approved permit has expired.',
    entity_type: 'permit',
    event_type: 'permit.expired',
    conditions: [],
    actions: [
      { type: 'notify_user', params: { title: 'Permit for {tmp_reference} has expired', message: 'Approved permit expired on {expiry_date} without being updated.', notification_type: 'permit_expired' } }
    ],
    dedupe_key_template: 'permit-exp-{id}-{expiry_date}',
    default_active: true
  },
  {
    id: 'mrwa_referral_trigger',
    name: 'MRWA referral auto-trigger',
    description: 'Raise an MRWA referral workflow trigger when a submitted permit is within 30m of signals.',
    entity_type: 'permit',
    event_type: 'permit.status_changed',
    conditions: [
      { field: 'status', op: 'eq', value: 'submitted' },
      { field: 'is_within_30m_signals', op: 'eq', value: true }
    ],
    actions: [
      { type: 'raise_trigger', params: { trigger_type: 'mrwa_referral_required', description: 'Site within 30m of signalised intersection - MRWA referral required' } },
      { type: 'notify_user', params: { title: 'MRWA referral required', message: 'Permit for {tmp_reference} is within 30m of signals. MRWA referral needed.' } }
    ],
    dedupe_key_template: 'mrwa-trig-{id}',
    default_active: true
  },
  {
    id: 'risk_triage_agent',
    name: 'Run triage agent on TMP creation',
    description: 'Runs the Complexity & Risk Triage Agent whenever a TMP is created, flagging misclassified complexity for review.',
    entity_type: 'tmp',
    event_type: 'tmp.created',
    conditions: [],
    actions: [
      { type: 'run_agent', params: { agent: 'triage' } }
    ],
    dedupe_key_template: 'triage-{id}',
    default_active: true
  },
  {
    id: 'drawing_validate_agent',
    name: 'Run drawing validation on upload',
    description: 'Runs the Drawing Validation Agent whenever a document is uploaded to a TMP.',
    entity_type: 'document',
    event_type: 'document.uploaded',
    conditions: [],
    actions: [
      { type: 'run_agent', params: { agent: 'drawing_validation' } }
    ],
    dedupe_key_template: 'drawing-{id}',
    default_active: true
  },
  {
    id: 'compliance_check_agent',
    name: 'Run compliance checker on submission',
    description: 'Runs the Permit Compliance Checker when a permit is submitted, raising blockers and notifying admins on failure.',
    entity_type: 'permit',
    event_type: 'permit.status_changed',
    conditions: [{ field: 'status', op: 'eq', value: 'submitted' }],
    actions: [
      { type: 'run_agent', params: { agent: 'compliance_checker' } }
    ],
    dedupe_key_template: 'compliance-{id}',
    default_active: true
  },
  {
    id: 'correspondence_status_notify',
    name: 'Correspondence received notification',
    description: 'Notify the TMP owner when correspondence is received and matched to a TMP, with the extracted outcome.',
    entity_type: 'tmp',
    event_type: 'correspondence.matched',
    conditions: [],
    actions: [
      { type: 'notify_user', params: { title: 'Correspondence for {tmp_reference}: {extracted_status}', message: 'From {sender}: {subject}', notification_type: 'correspondence' } }
    ],
    dedupe_key_template: 'corr-{id}',
    default_active: true
  },
  {
    id: 'safety_audit_auto_assign',
    name: 'Safety Audit auto-assignment',
    description: 'Automatically assign a Safety Auditor when a plan moves into the Safety Audit column.',
    entity_type: 'tmp',
    event_type: 'board.card_moved',
    conditions: [{ field: 'to_column_name', op: 'eq', value: 'Safety Audit' }],
    actions: [
      { type: 'assign_card', params: { role: 'staff', title: 'Safety Audit assigned', message: '{reference} ({title}) moved to Safety Audit. Review and sign off.' } }
    ],
    dedupe_key_template: 'safety-audit-{id}-{to_column}',
    default_active: true
  },
  {
    id: 'stale_council_card_alert',
    name: 'Stale council card alert',
    description: 'Alert the owner and managers when a card sits too long in a stale-prone column.',
    entity_type: 'tmp',
    event_type: 'board.card_stale',
    conditions: [],
    actions: [
      { type: 'notify_user', params: { title: 'Card stale in {column_name}', message: '{reference} ({title}) has been in {column_name} for over {stale_business_days} business days. Follow up.', notification_type: 'board_stale' } },
      { type: 'create_task', params: { role: 'manager', title: 'Chase stale card {reference}', message: '{reference} has been in {column_name} for over {stale_business_days} business days.' } }
    ],
    dedupe_key_template: 'stale-{id}-{column_id}',
    default_active: true
  },
  {
    id: 'emergency_fast_track_notify',
    name: 'Emergency / Fast-Track notification',
    description: 'Notify managers whenever a card is moved into the Emergency / Fast-Track swimlane.',
    entity_type: 'tmp',
    event_type: 'board.card_moved',
    conditions: [{ field: 'to_lane', op: 'eq', value: 'emergency' }],
    actions: [
      { type: 'notify_role', params: { role: 'manager', title: 'Emergency fast-track: {reference}', message: '{reference} ({title}) moved to the Emergency lane in {to_column_name}.', notification_type: 'emergency' } }
    ],
    dedupe_key_template: 'emergency-{id}-{to_column}',
    default_active: true
  }
];

export function ensureAutomationPresets() {
  const existing = new Set(db.prepare('SELECT id FROM automation_rules').all().map(r => r.id));
  const missing = PRESETS.filter(p => !existing.has(p.id));
  if (!missing.length) return { seeded: 0, skipped: existing.size };
  const insert = db.prepare(`
    INSERT INTO automation_rules (id, name, description, is_active, entity_type, event_type, conditions_json, actions_json, dedupe_key_template, priority)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction((presets) => {
    for (const p of presets) {
      insert.run(
        p.id,
        p.name,
        p.description,
        p.default_active ? 1 : 0,
        p.entity_type,
        p.event_type,
        JSON.stringify(p.conditions || []),
        JSON.stringify(p.actions || []),
        p.dedupe_key_template || null,
        0
      );
    }
  });
  tx(missing);
  return { seeded: missing.length, skipped: existing.size };
}

export function installPreset(id) {
  const preset = PRESETS.find(p => p.id === id);
  if (!preset) return null;
  const existing = db.prepare('SELECT id FROM automation_rules WHERE id = ?').get(preset.id);
  if (existing) return { installed: false, reason: 'already installed' };
  db.prepare(`
    INSERT INTO automation_rules (id, name, description, is_active, entity_type, event_type, conditions_json, actions_json, dedupe_key_template, priority)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(preset.id, preset.name, preset.description, 1, preset.entity_type, preset.event_type, JSON.stringify(preset.conditions || []), JSON.stringify(preset.actions || []), preset.dedupe_key_template || null, 0);
  return { installed: true };
}

export function newRuleId() {
  return uuid();
}
