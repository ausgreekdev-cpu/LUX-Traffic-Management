import { Router } from 'express';
import db from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { encryptSecret, SECRET_SETTING_KEYS, shouldPersistSecret } from '../secrets-crypto.js';
import { can } from '../saas/entitlements.js';
import { getTenantId } from '../middleware/tenant.js';
import {
  SETTINGS_GROUPS, SETTINGS_GROUP_NAMES, isGroupedKey, groupMember,
  isSecretMember, deserializeMember, serializeMember, validateGroup, groupDefaults,
  MASK_PLACEHOLDER
} from '../settings-defs.js';

const router = Router();
router.use(authenticate);

const LEGACY_MASKED_KEYS = new Set(['smtp_pass', 'jwt_secret', 'webhook_secret', 'postmark_api_token']);

// Assemble one settings group from its "<group>.<member>" KV rows, overlay the
// defaults, and mask secret members (with a stored-secret flag).
function assembleGroup(prefix) {
  const defaults = groupDefaults(prefix);
  const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE ?").all(`${prefix}.%`);
  const out = { ...defaults };
  const stored = {};
  for (const row of rows) {
    const member = groupMember(row.key);
    if (!member || !(member in SETTINGS_GROUPS[prefix].schema.shape)) continue;
    if (isSecretMember(member)) {
      stored[member] = row.value ? true : false;
      if (row.value) out[member] = MASK_PLACEHOLDER;
      continue;
    }
    const typed = deserializeMember(prefix, member, row.value);
    if (typed !== undefined) out[member] = typed;
  }
  return { ...out, _stored: stored };
}

// GET /api/settings/groups  ->  assembled, typed, masked groups for the admin UI.
router.get('/groups', authorize('developer'), (req, res) => {
  const groups = {};
  for (const name of SETTINGS_GROUP_NAMES) {
    const { _stored, ...data } = assembleGroup(name);
    groups[name] = { ...data, has_secret: _stored };
  }
  res.json(groups);
});

// PUT /api/settings/groups  ->  validate one or more groups against their Zod
// schemas and store members as namespaced KV rows. Secrets are encrypted and
// never overwritten by the masked placeholder or an empty value.
router.put('/groups', authorize('developer'), (req, res) => {
  const body = req.body || {};
  // Gate sso_saml (enterprise) — provider != 'none' requires sso_saml feature
  if (body.sso && body.sso.provider && body.sso.provider !== 'none') {
    const tenantId = getTenantId(req);
    if (tenantId && !can(tenantId, 'sso_saml')) {
      return res.status(402).json({ error: 'upgrade_required', feature: 'sso_saml', message: 'SSO/SAML requires Enterprise plan.' });
    }
  }
  const requested = Object.keys(body).filter((n) => SETTINGS_GROUP_NAMES.includes(n));
  if (!requested.length) return res.status(400).json({ error: 'No valid settings group provided' });

  const errors = [];
  const valid = [];
  for (const name of requested) {
    const { ok, errors: groupErrors } = validateGroup(name, body[name], true);
    if (!ok) errors.push(...groupErrors);
    else valid.push({ name, data: body[name] });
  }
  if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });

  const upsert = db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);

  const tx = db.transaction((groups) => {
    for (const { name, data } of groups) {
      for (const [member, value] of Object.entries(data)) {
        const key = `${name}.${member}`;
        if (isSecretMember(member)) {
          if (!shouldPersistSecret(value)) continue;
          upsert.run(key, encryptSecret(value));
        } else {
          upsert.run(key, serializeMember(name, member, value));
        }
      }
    }
  });
  tx(valid);
  res.json({ success: true });
});

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) {
    if (LEGACY_MASKED_KEYS.has(row.key) || (isGroupedKey(row.key) && isSecretMember(groupMember(row.key)))) {
      settings[row.key] = row.value ? MASK_PLACEHOLDER : '';
    } else {
      settings[row.key] = row.value;
    }
  }
  res.json(settings);
});

router.put('/', authorize('developer'), (req, res) => {
  const entries = Object.entries(req.body || {});
  if (!entries.length) return res.status(400).json({ error: 'No settings provided' });
  const upsert = db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  const tx = db.transaction((list) => {
    for (const [key, value] of list) {
      if (SECRET_SETTING_KEYS.includes(key)) {
        // Never overwrite a secret with the masked placeholder or an empty string.
        if (!shouldPersistSecret(value)) continue;
        upsert.run(key, encryptSecret(value));
      } else {
        upsert.run(key, value === null || value === undefined ? '' : String(value));
      }
    }
  });
  tx(entries);
  res.json({ success: true });
});

export default router;