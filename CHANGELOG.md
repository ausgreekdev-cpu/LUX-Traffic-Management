# Changelog

All notable changes to LUX Traffic Management are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/) and this project
adheres to [Semantic Versioning](https://semver.org/).

## [1.2.2] — 2026-08-20 — "Login-loop hotfix"

Fixes a second boot-time defect from 1.2.0 that the 1.2.1 blank-screen fix
uncovered: the login page reloaded itself in a tight loop, so no logged-out user
could sign in. The settings hub's store fetched developer-only settings groups
on mount for every visitor, including anonymous ones; the resulting 401 sent the
API client into `window.location.href = '/login'`, which is a full reload when
the login page is already open, which remounted the store, which fetched again.
The store now waits for a session, and the 401 handler can no longer navigate to
the page it is already on. The same release makes the native shell's API origin
actually take effect and gives it a fallback.

### Fixed

- `frontend/src/stores/SettingsStore.jsx` no longer requests `/settings/groups`
  without a session; it refetches on login, when the provider remounts.
- `frontend/src/api.js` only redirects on a 401 when a live session just ended,
  and never when the login screen is already showing. `settings.groups()` is a
  background prefetch and opts out of auth redirects entirely.
- The native API base is resolved per request instead of being captured when
  `api.js` is first imported. It was previously read before `main.jsx` could set
  it, so the Capacitor shell silently called its own local scheme, and the base
  was missing the `/api` path segment even when it was read.
- The keep-warm ping in `frontend/src/App.jsx` and the offline photo-queue drain
  in `frontend/src/pages/field/FieldLayout.jsx` went to a hardcoded `/api/...`
  and bypassed the base entirely; queued field photos could never upload from
  the native app.

### Changed

- The native shell probes a list of API origins at launch and uses the first one
  that answers `/api/ping`, remembering the winner for subsequent launches, so a
  single unreachable hostname no longer takes the field app down. An offline
  launch skips probing. `https://main--lux-official.netlify.app` is the fallback
  and was added to the backend CORS allow-list.

## [1.2.1] — 2026-08-20 — "Blank-screen hotfix"

Fixes the runtime crash introduced in 1.2.0 that blanked the app for all
clients. The 1.2.0 frontend mounted the React data router inside an extra
`<BrowserRouter>` wrapper; the data router's internal `<Router>` then threw
*"cannot render a `<Router>` inside another `<Router>`"* (its message is
stripped in the production bundle, so users saw a bare "Something went wrong"
fallback and never reached the login screen). The redundant wrapper is removed
and the login flow verified in a headless browser.

### Fixed

- Removed the outer `<BrowserRouter>` from `frontend/src/main.jsx` — `App` owns
  routing via `createBrowserRouter`/`RouterProvider`.
- Verified end-to-end: web/PWA login page renders on the live deployment;
  desktop/mobile builds are re-published as 1.2.1 so existing installs update
  to a working build instead of the broken 1.2.0 bundle.

## [1.2.0] — 2026-08-19 — "Field & Settings Hub"

This release turns LUX into a two-surface product: the desktop/web app gains a
complete admin experience built around a single Settings hub, while crews get a
native mobile field app for working on site. On the web side, all developer and
administrative configuration — branding, workflow and automation rules, email,
API keys, Kanban behaviour, export standards, SSO and role permissions — now
lives in one reorganized, permission-aware hub backed by validated,
encrypted-at-rest settings, with telemetry and webhook logging for oversight
and speed-zone colours stamped into TMP PDFs. On the phone, the new LUX Field
app (Android APK ready, iOS scaffolded) gives crews a read-only view of plans,
permits, the Kanban board and checklists, plus a durable photo pipeline that
captures geotagged, watermarked TMP photos on site, queues them offline, and
syncs them to the web app where they appear on the TMP detail page and Kanban
cards. A raft of serverless reliability fixes (no more settings loss, readable
errors, persisted DB), PWA support, and the Microsoft 365 email service round
out the release.

### Added

- **LUX Field mobile app** (Capacitor, Android + iOS): a native shell around
  the web frontend for on-site crews — view-only mode for plans, Kanban board,
  permits, checklists, speed zones and crew info.
- **Durable photo pipeline**: crews capture TMP site photos with the device
  camera (geotag, watermark, compression) and upload them to a Blob-backed
  store (`/api/photos`); photos appear in the web app on the TMP detail page
  and the Kanban card modal.
- **Offline-safe uploads**: photo captures are queued in an IndexedDB store
  while offline and flushed automatically when the connection returns.
- **Photo permissions**: staff can upload and view photos; only managers and
  above can delete them.
- **Unified Settings hub** at `/settings` with four categories: General &
  System, Branding & White-Labeling, Traffic Engine, and Access & Security.
- **Namespaced settings groups** (API keys, RBAC, SSO, export standards, Kanban
  rules) with Zod validation, typed serialization and encrypted secret
  masking — stored secrets are never overwritten by placeholder or empty
  values.
- **RBAC permission matrix**: role × permission configuration with UI gating
  of navigation and routes (server-side role checks remain the authoritative
  gate).
- **SSO configuration storage** for SAML/OAuth2 providers (issuer, endpoints,
  certificates, allowed domains).
- **Export standards**: configurable speed-zone colours, CAD/GIS layer toggles
  and icon library; the TMP export PDF now stamps the site's speed-zone colour
  from the configured standard.
- **Telemetry endpoints** (manager+): recent webhook deliveries, automation
  runs, email log and storage usage; the health endpoint now reports
  storage/media/backup usage.
- **Webhook delivery logging** (new `webhook_deliveries` table, migration v8).
- **Microsoft 365 SMTP email service**: pooled STARTTLS transport (TLS 1.2+),
  transient retry handling, startup health probe, and test/verify endpoints
  that return actionable M365-specific error hints; seeded notification
  templates and `notify_email` role/owner recipients.
- **Editable HTML email templates**: `html_body` editor with live preview
  under Automation → Email templates and a draft-preview endpoint.
- **White-label & branding engine**: theme builder, PDF stamping, email shell
  and CSS override — with per-domain brands resolved by Host header (global
  fallback) and a brand-scope switcher in the editor.
- **Domain-specific Kanban board** with swimlanes, WIP limits,
  Definition-of-Done checklists and CFD analytics.
- **PWA support**: manifest, service worker (precache + offline shell) and
  icons.

### Changed

- Legacy admin routes `/branding`, `/workflows`, `/automations` and `/users`
  now redirect into the Settings hub instead of being separate pages.
- Sidebar navigation consolidated to a single **Settings** entry with
  permission gating.
- The old 735-line Settings page was split into modular panels: System now has
  tabs for Profile & Behaviour, Labels & Legal, Email & Webhooks, API Keys,
  Telemetry, Health, and Data/Backups.
- Frontend migrated to the React data router (`createBrowserRouter`), enabling
  the global **unsaved-changes prompt** (in-app via `useBlocker`, plus a
  `beforeunload` guard).
- Email provider selection made explicit (SMTP or Postmark) so a saved SMTP
  config actually takes effect.
- Serverless DB is persisted to Netlify Blobs with snapshot-on-every-mutating
  request, closing the previous settings-loss window.
- Performance: heavy modules are lazy-loaded, the serverless function is kept
  warm, routes are code-split, and snapshots are faster.
- Server-side hardening: request-ID error handler, DB-backed login lockout,
  async bcrypt, secrets encrypted at rest, pagination caps, Helmet headers,
  and versioned migrations.

### Fixed / Notes

- Fixed serverless settings loss where WAL mtime could drop up to 20 seconds of
  changes — every mutating request now snapshots before responding.
- Fixed email provider config that was silently not taking effect after save.
- Fixed Netlify function crashes (DOMMatrix polyfill, asset-dir resolution in
  esbuild bundle) and replaced opaque 502s with readable boot-error 500s.
- Fixed login issues: refresh loop, redirect-after-login, silent settings
  fetch, case-insensitive emails, and persisted serverless JWT secret.
- Scoped client data access to owned records and fixed critical RBAC security
  issues.
- **Microsoft 365 tenants**: SMTP AUTH is off by default for new M365 tenants —
  enable it for the sending mailbox in the Exchange admin centre before using
  `smtp.office365.com` (see `docs/email-setup.md`).
- **iOS build pending a Mac**: the iOS project is scaffolded but cannot be
  compiled on Windows — building requires macOS with Xcode + CocoaPods. The
  Android debug APK is buildable now (`mobile/README.md`).

## [1.1.1] — previous release

Auto-update release prior to the Field app and Settings hub work.