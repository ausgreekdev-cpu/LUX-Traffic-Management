# Settings Hub

All administrative and developer configuration lives under the **Settings** hub
at `/settings` (developer role). It replaces the previous loose collection of
pages — `/settings` (company/profile), `/branding`, `/workflows`,
`/automations` and `/users` — which now **redirect into the hub**:

| Old route | Now redirects to |
|---|---|
| `/settings` | `/settings/system` |
| `/branding` | `/settings/branding` |
| `/workflows` | `/settings/traffic?tab=workflows` |
| `/automations` | `/settings/traffic?tab=automations` |
| `/users` | `/settings/security?tab=users` |

## Categories

The hub has a left sidebar with four categories, each with its own panels/tabs:

### 1. General & System (`/settings/system`)

- **Overview** — company profile, appearance (light/dark theme), reminder
  window, and system behaviour (currency, timezone, date format, default rate,
  session timeout, SLA fallback, risk thresholds, retention, maintenance mode).
- **Labels & Legal** — app name/login/footer text, sidebar menu names, page
  titles, detail-page sections, table columns, status/complexity labels and
  legal content (privacy policy, terms of service). Overrides are read by the
  `AppTextProvider` context (`nav()`, `pageTitle()`, `section()`, `column()`,
  `status()`, `complexity()`, `appName()`).
- **Email & Webhooks** — outgoing mail (Postmark or SMTP, stored in the DB and
  overriding `POSTMARK_*` / `SMTP_*` env vars), test email, reminder digest,
  recent email log, and inbound webhook endpoints (`mailgun`, `sendgrid`,
  `postmark`, `generic`).
- **Environment & API Keys** — external service credentials for the traffic
  engine (mapping, geocoding, weather, SMS). Secrets are encrypted at rest and
  masked; they are stored for use by optional integrations.
- **Audit & Telemetry** — storage usage, inbound webhook deliveries, automation
  runs and the outbound email log (backed by `/api/telemetry/*`, manager+).
- **System Health** — `/api/health` status, database integrity/size, storage.
- **Data & Backups** — download/restore the database, run a backup now,
  configure scheduled backups, manage existing backup files.

### 2. Branding & White-Labeling (`/settings/branding`)

The existing branding engine: theme builder, typography/assets/fonts, PDF
stamping layout builder, watermark controls, email shell + domain manager, and
advanced CSS override with version history. Changes apply instantly (CSS
variables are injected live) and can be scoped per domain.

### 3. Traffic Engine (`/settings/traffic`)

- **Kanban Rules** — board defaults (default WIP limit, emergency-lane policy,
  stale threshold) plus the TMP and permit board column editors (reorder,
  WIP/enforce, maps-to-status, auto-assign role, Definition-of-Done stages,
  stale days, final column, colour).
- **Workflows** — workflow stage templates (per entity type / complexity /
  authority), checklist behaviour and the proactive completion warnings.
- **Automation** — automation rules, triggers, AI agents, email templates and
  the test console.
- **Export Standards** — speed-zone colours, icon library, CAD/GIS layer
  toggles and the default DWG scale. The TMP export PDF stamps the site's
  speed-zone colour from these standards when the site has a speed limit.

### 4. Access & Security (`/settings/security`)

- **Users** — user account management.
- **RBAC Matrix** — role × permission matrix. Controls what each role sees and
  can do in the **interface** (navigation + routes). Server-side role checks
  are **always** enforced and are the authoritative gate.
- **Single Sign-On** — SAML / OAuth2 configuration storage (issuer, endpoints,
  certificate, client secret, allowed domains). Credentials are encrypted and
  masked. **JWT login remains active** until an identity provider is wired
  end-to-end — SSO is config storage only for now.

## Namespaced settings groups

Configuration for the newer panels is stored as **namespaced settings groups**
in the existing `settings` KV table, under `<group>.<member>` keys. Groups are
defined and validated in `backend/src/settings-defs.js`:

| Group | Members | Secrets (encrypted) |
|---|---|---|
| `api_keys` | `mapbox_token`, `google_maps_key`, `nominatim_base_url`, `weather_provider`, `weather_api_key`, `sms_gateway`, `sms_api_key`, `sms_from` | mapbox, google, weather, sms |
| `rbac` | `matrix` (role × permission record) | — |
| `sso` | `provider`, `issuer`, `entity_id`, `acs_url`, `certificate`, `client_id`, `client_secret`, `authorize_url`, `token_url`, `userinfo_url`, `scopes`, `allowed_domains` | certificate, client_secret |
| `export` | `speed_zone_colors` (array), `icon_library`, `include_cad_layers`, `include_gis_layers`, `default_dwg_scale` | — |
| `kanban` | `default_wip_limit`, `emergency_lane_policy`, `default_stale_business_days` | — |

### API

- `GET /api/settings/groups` (developer) — returns every group assembled over
  its defaults, typed (`deserializeMember`), with secrets replaced by a
  `••••••••` placeholder and a `has_secret` map per group.
- `PUT /api/settings/groups` (developer) — validate one or more groups against
  their Zod schemas (`strict()` rejects unknown members) and store members as
  namespaced KV rows. Sending the masked placeholder or an empty value for an
  existing secret **never overwrites** the stored credential.

Legacy flat settings endpoints (`GET/PUT /api/settings`) are kept for
backwards compatibility.

### Reading a group from backend code

```js
import { deserializeMember, groupDefaults } from '../settings-defs.js';

const defaults = groupDefaults('export');
const row = db.prepare("SELECT value FROM settings WHERE key = 'export.speed_zone_colors'").get();
const zones = row ? deserializeMember('export', 'speed_zone_colors', row.value) : defaults.speed_zone_colors;
```

### Frontend store

The frontend holds the groups in a reactive store
(`frontend/src/stores/SettingsStore.jsx`) with a per-panel dirty registry that
powers the global **unsaved-changes prompt**. Panels bind to a group through
the `useSettingsGroup(prefix, id)` hook (`frontend/src/hooks/useSettingsGroup.js`),
which handles loading, dirty tracking, secret stripping on save and
store refresh. Shared UI primitives live in `frontend/src/components/settings/`
(`SectionCard`, `Field`/`fields.jsx`, `SaveBar`, `UnsavedPrompt`).

## RBAC permission matrix

Permissions are catalogued in `frontend/src/utils/permissions.js` alongside a
default matrix that mirrors the app's historical visibility. The matrix stored
under the `rbac` group is merged over the defaults and consulted for sidebar
navigation and route visibility (`permissionAllowed(role, key, matrix)`).

- Changing a permission only affects the **UI** (what links/routes render).
- Server middleware (`authorize`, `roleAtLeast` in
  `backend/src/middleware/auth.js`) still enforces the real access rules.
- To tighten security you must change the server checks — the matrix is a
  convenience/onboarding layer, not a security boundary.

## Telemetry

Manager+ can inspect operational activity under **General & System → Audit &
Telemetry**, backed by `backend/src/routes/telemetry.js`:

- `GET /api/telemetry/webhooks` — recent inbound webhook deliveries with
  per-status counts (uses the `webhook_deliveries` table, migration v8).
- `GET /api/telemetry/automations` — automation engine runs.
- `GET /api/telemetry/emails` — outbound email log.
- `GET /api/telemetry/storage` — DB/media/photo/branding-asset/backup usage.
- `/api/health` additionally reports schema version and storage usage.