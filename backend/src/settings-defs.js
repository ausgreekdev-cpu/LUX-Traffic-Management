import { z } from 'zod';

export const MASK_PLACEHOLDER = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a #RRGGBB hex colour');
const optionalStr = z.string().trim().optional();
const optionalNumber = z.number().int().min(0).optional().nullable();

// Namespaced settings groups. Members are stored in the settings KV table under
// "<group>.<member>" keys so legacy flat keys keep working untouched. Secrets are
// encrypted at rest via secrets-crypto and masked on read.
export const SETTINGS_GROUPS = {
  api_keys: {
    label: 'Environment & API keys',
    description: 'External service credentials used by the traffic engine (mapping, weather, SMS).',
    schema: z.object({
      mapbox_token: optionalStr,
      google_maps_key: optionalStr,
      nominatim_base_url: optionalStr,
      weather_provider: z.enum(['openweathermap', 'tomorrow', 'none']).optional(),
      weather_api_key: optionalStr,
      sms_gateway: z.enum(['twilio', 'clickatell', 'none']).optional(),
      sms_api_key: optionalStr,
      sms_from: optionalStr
    }),
    secretKeys: ['mapbox_token', 'google_maps_key', 'weather_api_key', 'sms_api_key'],
    defaults: {
      mapbox_token: '', google_maps_key: '', nominatim_base_url: 'https://nominatim.openstreetmap.org',
      weather_provider: 'none', weather_api_key: '', sms_gateway: 'none', sms_api_key: '', sms_from: ''
    }
  },
  rbac: {
    label: 'RBAC permission matrix',
    description: 'Role × permission matrix. Applied to the user interface (navigation and routes); server-side role checks remain enforced.',
    schema: z.object({
      matrix: z.record(z.enum(['developer', 'manager', 'staff', 'client']), z.record(z.string().max(64), z.boolean()))
    }),
    secretKeys: [],
    defaults: { matrix: {} }
  },
  sso: {
    label: 'Single sign-on',
    description: 'Enterprise SSO configuration (SAML / OAuth2). Stored here; JWT login stays active until an IdP is wired end-to-end.',
    schema: z.object({
      provider: z.enum(['none', 'saml', 'oauth2']).optional(),
      issuer: optionalStr,
      entity_id: optionalStr,
      acs_url: optionalStr,
      certificate: optionalStr,
      client_id: optionalStr,
      client_secret: optionalStr,
      authorize_url: optionalStr,
      token_url: optionalStr,
      userinfo_url: optionalStr,
      scopes: optionalStr,
      allowed_domains: optionalStr
    }),
    secretKeys: ['certificate', 'client_secret'],
    defaults: {
      provider: 'none', issuer: '', entity_id: '', acs_url: '', certificate: '',
      client_id: '', client_secret: '', authorize_url: '', token_url: '', userinfo_url: '', scopes: '', allowed_domains: ''
    }
  },
  export: {
    label: 'Export standards',
    description: 'Defaults for drawings, PDFs and CSVs (speed-zone colours, CAD/GIS layers, icon library).',
    schema: z.object({
      speed_zone_colors: z.array(z.object({
        speed: z.number().int().min(0).max(200),
        label: optionalStr,
        color: hexColor
      })).max(30).optional(),
      icon_library: z.enum(['standard', 'custom']).optional(),
      include_cad_layers: z.boolean().optional(),
      include_gis_layers: z.boolean().optional(),
      default_dwg_scale: optionalStr
    }),
    secretKeys: [],
    defaults: {
      speed_zone_colors: [
        { speed: 40, label: '40 km/h', color: '#f97316' },
        { speed: 50, label: '50 km/h', color: '#eab308' },
        { speed: 60, label: '60 km/h', color: '#22c55e' },
        { speed: 70, label: '70 km/h', color: '#3b82f6' },
        { speed: 80, label: '80 km/h', color: '#8b5cf6' },
        { speed: 100, label: '100 km/h', color: '#ec4899' },
        { speed: 110, label: '110 km/h', color: '#ef4444' }
      ],
      icon_library: 'standard', include_cad_layers: true, include_gis_layers: true, default_dwg_scale: '1:500'
    }
  },
  kanban: {
    label: 'Kanban rules',
    description: 'Default board behaviour applied to new columns and emergency lanes.',
    schema: z.object({
      default_wip_limit: optionalNumber,
      emergency_lane_policy: z.enum(['manual', 'auto_assign']).optional(),
      default_stale_business_days: optionalNumber
    }),
    secretKeys: [],
    defaults: { default_wip_limit: 12, emergency_lane_policy: 'manual', default_stale_business_days: 5 }
  }
};

export const SETTINGS_GROUP_NAMES = Object.keys(SETTINGS_GROUPS);

export const SECRET_MEMBER_SUFFIXES = new Set(
  Object.values(SETTINGS_GROUPS).flatMap((g) => g.secretKeys)
);

export function isSecretMember(member) {
  return SECRET_MEMBER_SUFFIXES.has(member);
}

export function isGroupedKey(key) {
  const dot = key.indexOf('.');
  if (dot < 1) return false;
  return Object.prototype.hasOwnProperty.call(SETTINGS_GROUPS, key.slice(0, dot));
}

export function groupPrefix(key) {
  const dot = key.indexOf('.');
  return dot > 0 ? key.slice(0, dot) : key;
}

export function groupMember(key) {
  const dot = key.indexOf('.');
  return dot > 0 ? key.slice(dot + 1) : '';
}

function memberZod(prefix, member) {
  return SETTINGS_GROUPS[prefix]?.schema.shape[member];
}

// ZodOptional / ZodNullable / ZodDefault wrap their base type — unwrap so the
// members' JSON shapes can be detected reliably.
function baseZod(zs) {
  let z = zs;
  while (z && (z._def?.typeName === 'ZodOptional' || z._def?.typeName === 'ZodNullable' || z._def?.typeName === 'ZodDefault')) {
    z = z._def.innerType || z._def.type;
  }
  return z;
}

// Convert a stored KV string back into a typed value using the group's Zod shape.
export function deserializeMember(prefix, member, stored) {
  if (stored === null || stored === undefined) return undefined;
  const bz = baseZod(memberZod(prefix, member));
  if (bz instanceof z.ZodBoolean) return stored === 'true';
  if (bz instanceof z.ZodNumber) { const n = Number(stored); return Number.isFinite(n) ? n : null; }
  if (bz instanceof z.ZodArray || bz instanceof z.ZodRecord || bz instanceof z.ZodObject) {
    try { return JSON.parse(stored); } catch { return undefined; }
  }
  return stored;
}

// Convert a typed value into its KV string form for storage.
export function serializeMember(prefix, member, value) {
  if (value === null || value === undefined) return null;
  const bz = baseZod(memberZod(prefix, member));
  if (bz instanceof z.ZodBoolean) return value ? 'true' : 'false';
  if (bz instanceof z.ZodNumber) return String(value);
  if (bz instanceof z.ZodArray || bz instanceof z.ZodRecord || bz instanceof z.ZodObject) return JSON.stringify(value);
  return String(value);
}

// Validate a whole-group payload. `strict: true` (used by PUT) rejects unknown
// members; assembled GET output always passes.
export function validateGroup(prefix, input, strict = false) {
  const group = SETTINGS_GROUPS[prefix];
  if (!group) return { ok: false, errors: [`Unknown settings group "${prefix}"`] };
  const schema = strict ? group.schema.strict() : group.schema;
  const result = schema.safeParse(input);
  if (!result.success) {
    return { ok: false, errors: result.error.issues.map((i) => `${i.path.join('.') || prefix}: ${i.message}`) };
  }
  return { ok: true, data: result.data };
}

export function groupDefaults(prefix) {
  return { ...(SETTINGS_GROUPS[prefix]?.defaults || {}) };
}