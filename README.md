# LUX Traffic Management

WA Traffic Management System — TMP & Permit Management

## Features

- **TMP Management** — Create, track, and manage Traffic Management Plans with automatic reference generation, versions, and a full activity log
- **Permit Tracking** — Multi-authority permit workflows with automatic SLA calculation (assessment + public notice + buffer days per authority and complexity), fees, expiry reminders and workflow triggers (30 m signalised intersections, MRWA referral)
- **WA Authorities** — Full WA Local Government Directory (139 LGAs) importable from the published PDF, with SLA rules per authority and complexity
- **Workflow Templates** — Per-entity, per-authority, per-complexity stage checklists that gate approval/completion (required vs optional stages)
- **Risk Scoring** — Consequence × likelihood model with configurable band thresholds and mitigation suggestions
- **AI Agents** — Deterministic, human-in-the-loop checks (triage, drawing validation, compliance checker) with apply/reject workflows
- **Automation & Triggers** — Event-driven rules (TMP/permit/fee/document/correspondence events) with notifications, emails, webhooks, tasks and agent actions; run in the background
- **Correspondence & Inbound Webhooks** — Mailgun/SendGrid/Postmark/generic webhook ingest with HMAC signing, TMP matching, status extraction and one-click apply-to-permit
- **Email** — SMTP outbound with reusable templates, `{field}` placeholders, test sending and an email log (see `docs/email-setup.md`)
- **Time Tracking** — Billable/non-billable entries with cost codes, configurable default rate and currency
- **Analytics** — Approval times, planner throughput, financial summary, rejection analysis
- **Exports** — Branded TMP/permits-summary/audit PDFs and CSV exports honouring date format, currency and footer text
- **Developer & Branding Settings** — Rename menu items, page titles, section headings, table columns, status/complexity labels, app name and legal text (privacy policy / terms of service) without touching code
- **Security** — JWT sessions with configurable timeout, login rate limiting, maintenance mode (read-only), persisted auto-generated `JWT_SECRET`, masked SMTP credentials
- **Desktop App** — Electron-based Windows application (NSIS installer, portable EXE and ISO)

## Quick Start

### Development

```bash
npm run install:all
npm run seed
npm run dev
```

Open http://localhost:5173

### Default Login (local seed only)

| Email | Password | Role |
|-------|----------|------|
| admin@tmpcms.com | admin123 | Admin |
| planner@tmpcms.com | planner123 | Planner |
| viewer@tmpcms.com | viewer123 | Viewer |

> These users are only created by `npm run seed` or on an empty local database.
> Serverless (Netlify) deployments never create default credentials — see below.

### Windows Build

```bash
build.bat
```

Or for portable:
```bash
npm run electron:portable
```

Artifacts land in `release/`: NSIS installer, portable EXE, and an ISO built from
`win-unpacked` (see `.opencode/agents/packager.md`).

## Deployment

- **Desktop / local** — packaged Electron app (backend runs embedded on `localhost:3001`)
- **Shared server** — standalone Node or Docker (recommended): `docs/server-deployment.md`
- **Netlify (serverless)** — ⚠️ demo-only: the SQLite DB is ephemeral and default
  credentials are never seeded. Bootstrap a single admin with `NETLIFY_ADMIN_EMAIL` /
  `NETLIFY_ADMIN_PASSWORD`. See `docs/server-deployment.md → Option 4`.
- **Docker CI** — the `.github/workflows/docker-image.yml` workflow builds and pushes a
  multi-arch image on every push/tag.

## Architecture

```
├── backend/            Node.js/Express API (SQLite, better-sqlite3)
│   ├── src/app.js      Express app (routes, maintenance mode, seeding) — serverless-compatible
│   ├── src/index.js    Server entry (static frontend, scheduler, listen)
│   ├── src/routes/     20 route modules
│   ├── src/middleware  JWT auth, Zod validation, rate limiting
│   └── src/db.js       SQLite schema, migrations, reopen/restore support
├── frontend/           React + Vite + Tailwind
│   ├── src/context/    AppTextProvider (developer & branding overrides)
│   └── src/pages/      20 pages
├── electron/           Electron desktop shell
├── netlify/            Serverless adapter (demo deployments)
├── docs/               email-setup.md, server-deployment.md, workflow-automation.md
└── assets/             App icons
```

## Tech Stack

- **Backend**: Node.js, Express, better-sqlite3, JWT, Zod
- **Frontend**: React 18, Vite, Tailwind CSS, React Router
- **Desktop**: Electron
- **Build**: electron-builder (NSIS + portable), oscdimg (ISO)

## License

MIT — LUX Traffic Management
