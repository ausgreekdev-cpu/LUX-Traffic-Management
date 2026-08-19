# TMP Workflow Architecture — Evaluation & Expansion

> Status: Design v1 · Applies to LUX Traffic Management (backend: Express + better-sqlite3, frontend: React)

## 1. Current-State Assessment

| Capability | Current state | Gap |
|---|---|---|
| Workflow stages | Flat, global list per entity (`workflow_stages`), required/optional + sort order | No branching, no per-authority/complexity templates, no assignment, no due dates |
| Stage enforcement | Gate on approve/completed via `incompleteRequiredStages` | Enforcement only at 2 statuses; no soft warnings |
| Triggers | 2 hard-coded checks on permit create/update (`permits.js:checkTriggers`), manually resolvable | Not event-driven, not user-editable, only in the permit mutation path |
| Notifications | Manual `POST /api/notifications/scan` + `notifyUsers` | Pull-based, in-app only, no email/SMS hooks, no scheduling |
| SLA | Per authority × complexity (`sla_rules`) | Computed once at submission; no deadline warnings, no escalation |
| Email | SMTP config + manual send | No templates, no event hooks |
| Risk | None (sites store location only) | No risk model, no triage |

**Strengths to build on:** `workflow_triggers` is a working prototype of a rule engine; `/notifications/scan` is a prototype watchdog; `sla_rules` is a prototype rules table; `WorkflowSettings` page is the seed of a rule-builder UI.

## 2. Target Workflow Lifecycle

Phases: Intake & Scoping → Complexity Triage → Site Risk Assessment → Drafting & Drawings → Referral Branching → Internal QA & Client Sign-off → Authority Submission → Assessment & Decision → Mobilisation & Live Site → Audit & Decommission.

### 2.1 Branch points

- **Complexity triage** (auto): `simple` / `standard` / `complex` derived from road class, speed limit, duration, night works, rail/signal proximity. Drives stage template, SLA variant, checklist, fees, validation depth. Human override allowed and logged.
- **Referral branching**: 30m of signalised intersection → MRWA/PTA signal assessment; MRWA-controlled road → MRWA referral; rail corridor → PTA rail window coordination; HVS exposure → HVS notification.
- **Public notice**: required when the authority SLA rule sets `requires_public_notice` (e.g., `complex_with_notice`).
- **Fast-track**: minor works ≤ 3 days on local roads, no signals → compressed template + checklist.

### 2.2 Phases detail

| # | Phase | Entry criteria | Key steps | Exit criteria | Options |
|---|---|---|---|---|---|
| 1 | Intake & Scoping | Client/project exists | Site capture (road class, speed, AADT, ped/cycle, rail, signals), work type, duration | Draft TMP + complete site dataset | Fast-track / standard / complex |
| 2 | Complexity Triage | Site dataset complete | Auto-classification scoring, human override | Complexity class + template selected | Auto vs manual override |
| 3 | Site Risk Assessment | Complexity class set | Consequence (1-5) × Likelihood (1-5) = 1-25 risk score; band gates mitigation | Risk band Low/Med/High/Extreme + mitigations | High/Extreme → mandatory supervisor, TC plan, camera |
| 4 | Drafting & Drawings | Risk assessment done | Drawing prepared → AI validation → internal review → client sign-off | Drawing validated + signed off | Template library; multi-stage plans |
| 5 | Referral Branching | Draft complete | Auto-detect 30m signal / MRWA / rail / HVS → triggers + sub-tasks | Referrals acknowledged | Per-authority referral packs |
| 6 | QA & Sign-off | Drawings validated | Internal review (required), client sign-off (optional stage) | Checklist complete | Single vs independent QA |
| 7 | Submission | QA complete | Multi-permit orchestration per authority, submission pack, fee capture | Permits `submitted` | Per-authority SLA variants |
| 8 | Assessment | Permit submitted | SLA countdown, decision, structured rejection reasons | Permits `approved`/`rejected` | Deadline warnings; revision loop |
| 9 | Mobilisation & Live | Permits approved | Site setup, live TC supervision, incident register | Works underway | Standard / night closure / event |
| 10 | Audit & Decommission | End date passed | Site reopened, permits closed, bonds returned, decommission checklist, archive | TMP `completed` | Watchdog enforcement |

## 3. AI Agent Integration

Principle: **agents are automation actions with human-in-the-loop gates** — they produce recommendations/validations the user confirms; never silently mutate records.

| # | Agent | Trigger | Inputs → Outputs | Value | Integration |
|---|---|---|---|---|---|
| 1 | Complexity & Risk Triage Agent | `tmp.created` / site changed | Site dataset → risk score 1-25, complexity class, template, pre-filled checklist | Consistent triage; kills misclassification | `run_agent` action |
| 2 | Drawing Validation Agent | `document.uploaded` | PDF/DWG + checklists + AS 1742.3/MRWA rules → validation report (pass/warn/fail) | Rejection reduction; review days → minutes | `run_agent` action |
| 3 | Permit Compliance Checker | `permit.submitted` | Permit + TMP + SLA + proximity → compliance score, blocker list, submission pack | Stops incomplete submissions | `run_agent` action; blocks submit below threshold |
| 4 | SLA & Expiry Watchdog | Daily scheduler + status changes | Active permits/TMPs + SLA → warnings at -14/-7/-2d, escalation, renewal | Prevents SLA breaches + expired TMP operation | Scheduled event emitter |
| 5 | Fee & Bond Reconciliation | `permit.approved` / `tmp.completed` | Fees + statuses → bonds due, outstanding fees, refunds | Recovers fees; timely bond returns | `run_agent` action |
| 6 | Decommissioning Auditor | TMP `end_date` passes, not `completed` | Expired TMP + permits + fees → decommission checklist, reopen notification, escalation | Prevents legal exposure | Scheduled event emitter |
| 7 | Correspondence Extractor | Email/SMS webhook | Council emails → parsed status change + structured rejection reason | Removes manual entry | Webhook → event bus |

## 4. Automation Engine & "Automation & Trigger Settings"

> The automation UI lives under **Settings → Traffic Engine → Automation** in the
> unified Settings hub (see `docs/settings-hub.md`).

### 4.1 Architecture

- **Event bus** (`src/events.js`): `emitEvent(type, entity, payload)`. Every mutation route calls it. Replaces scattered inline logic; single place for audit + automation + AI hooks.
- **Rules are data, not code**: hard-coded `checkTriggers` becomes seed data for rules.
- **All automations user-editable**: CRUD + enable/disable + test, admin-only, with run history.
- **Execution**: in-process async queue; `automation_runs` log (rule, entity, matched, actions, result, error). Dry-run endpoint for the builder UI.
- **Scheduler**: hourly tick for SLA/expiry watches (replaces manual `/scan`), plus `POST /api/automations/run-scheduled` for manual trigger. If `reminder_email_enabled` is on and SMTP is configured, the scan also sends a summary digest of expiring/expired TMPs and permits to `reminder_email_to` (or all admins).

### 4.2 Data model

```sql
automation_rules(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  entity_type TEXT NOT NULL,          -- tmp | permit | fee | document
  event_type TEXT NOT NULL,           -- tmp.created, permit.status_changed, document.uploaded, sla.deadline_approaching ...
  conditions_json TEXT,               -- [{field, op(in|eq|gt|lt|ne|contains), value}]
  actions_json TEXT,                  -- [{type, params}]
  priority INTEGER DEFAULT 0,
  cooldown_hours INTEGER DEFAULT 0,
  dedupe_key_template TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

automation_runs(
  id TEXT PRIMARY KEY,
  rule_id TEXT,
  event_type TEXT,
  entity_type TEXT,
  entity_id TEXT,
  payload_json TEXT,
  status TEXT DEFAULT 'fired',        -- fired | skipped | error
  actions_json TEXT,
  error TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

**Action types:** `notify_user(role|userId|created_by)`, `notify_email(to, template?, subject?, body?)`, `create_task(subject, assignee_role, due_in_days)`, `create_permit_sub_task`, `set_field(field, value)`, `raise_trigger(type, description)`, `compute_risk_score`, `run_agent(agent_id)`, `webhook(url)`. `notify_email` falls back to inline `subject`/`body` when `template` is omitted or has no subject/body; templates render `{field}` placeholders.

### 4.3 Seed rule presets

| Rule | Event | Condition | Actions |
|---|---|---|---|
| Approval notification | `permit.status_changed` | status = approved | notify planner + site supervisor (SMS if configured) |
| MRWA referral check | `permit.submitted` | within 30m signals AND no MRWA permit | raise trigger + notify planner |
| SLA breach warning | `sla.deadline_approaching` | days_left ≤ 7 | notify assignee; escalate to admin at 2 days |
| Bond return | `tmp.completed` | — | mark bond fee refunded, notify client |
| Decommission audit | `tmp.expired` | — | run Decommissioning Auditor agent, notify created_by |
| Risk triage | `tmp.created` | — | run Complexity & Risk Triage Agent |
| Expiry reminder | daily scheduler | end_date within 14 days | notify created_by |

### 4.4 UI — Automation & Trigger settings (admin)

Reached from **Settings → Traffic Engine → Automation**:

1. **Rules table** — name, entity, event, active toggle, last run, run count, Edit/Test/Delete.
2. **Rule builder** — `WHEN <entity> <event>` → `IF <field> <op> <value>` → `THEN <action> <params>`; natural-language preview line.
3. **Preset library** — one-click install of seed rules.
4. **Test console** — pick rule + real entity ID → dry-run against current state.
5. **Run history** — `automation_runs` with status/error, filter by rule.

Endpoints: `GET/POST/PUT/DELETE /api/automations/rules`, `POST /api/automations/rules/:id/test`, `GET /api/automations/rules/:id/runs`, `POST /api/automations/run-scheduled`.

## 5. Roadmap

| Phase | Scope | Builds on |
|---|---|---|
| P1 | Event bus + scheduler + `automation_runs` table; migrate `/scan` logic to events | — |
| P2 | Automation engine (rules CRUD, condition/action engine) + Automation & Trigger settings UI (Settings → Traffic Engine → Automation) + presets + test console | P1 |
| P3 | Workflow templates & branching; complexity triage UI on TMP form; per-authority stage sets | P2 |
| P4 | Risk scoring model; site data fields (speed, AADT, class); triage rules | P2 |
| P5 | ✅ AI agents (Triage, Drawing Validation, Compliance Checker) as `run_agent` actions — deterministic, human-in-the-loop (`agent_runs` + Apply) | P2 |
| P6 | ✅ Email templates, inbound webhooks, correspondence ingest (SMS provider deliberately scrapped) | P2 |

## 6. Agents implementation notes (P5)

- `backend/src/agents.js` — deterministic registry: `triage` (reuses `risk.js`), `drawing_validation` (format/naming checks + pdf-parse text scan for TMP reference, AS 1742.3, date, title-block markers), `compliance_checker` (workflow stages, documents, MRWA/signals referral, SLA rule, risk mitigations, fees → score 0–100 + blockers).
- Runs stored in `agent_runs`; verdict `ok|warn|fail`, score, findings + `recommended_json`. Apply is explicit (`POST /api/agents/runs/:id/apply`) and only the triage agent mutates (sets complexity + `complexity_source='auto'`, swaps workflow template, logs activity, emits `tmp.complexity_changed`).
- Engine action `run_agent` (params: `agent`); on warn/fail it raises an `agent_blocker` workflow trigger (permit events) and notifies admins. Emits `agent.completed` so rules can react.
- Presets: `risk_triage_agent`, `drawing_validate_agent`, `compliance_check_agent`. UI: Settings → Traffic Engine → Automation → AI Agents tab + panels on TMP/Permit detail pages.

## 7. Correspondence & inbound integrations implementation notes (P6)

- **Webhook endpoint** `POST /api/integrations/webhook/:provider` (`mailgun|sendgrid|postmark|generic`) is public and mounted before auth. If the `webhook_secret` setting is set, requests must include an HMAC-SHA256 hex digest of the raw request body in `x-lux-signature` or `x-webhook-signature` (raw body captured via `express.json({ verify })`). 401 otherwise.
- Provider field extraction: mailgun (`sender/from`, `subject/Subject`, `stripped-text`/`body-plain`/`body-html`), sendgrid (`from`/`subject`/`text`), postmark (`From`/`Subject`/`TextBody`), generic fallback (`sender/from/email`, `subject`, `text/body/message`).
- `backend/src/correspondence.js` — `parseCorrespondence` extracts a `TMP-\d{4}-\d{3}` reference and an outcome status. **Order matters:** `rejected` (incl. `not approved`, `cannot be approved`) is checked before `approved` so negations never classify as approvals; then `requested_information`, `under_review`, `received`. Rejection reason = first sentence containing the rejection wording, cleaned of boilerplate.
- `matchPermit` prefers a `submitted`/`under_review` permit on the TMP, else the latest. `ingestCorrespondence` emits `correspondence.received` (always) and `correspondence.matched` (when a TMP matched).
- `reviewCorrespondence` (via `POST /api/integrations/correspondence/:id/review`) applies only `approved`/`rejected` when a permit is matched: updates the permit (+ `approval_date` / `rejection_reason`), writes a `permit_status_changed` activity, emits `permit.status_changed` with `{previous_status, by, from_correspondence: true}`. Other review states: `reviewed`, `dismissed`.
- **Email templates** (`email_templates` table): CRUD + preview at `/api/email/templates*`; rendered by `emailer.renderTemplate(name, ctx)`; referenced by the `notify_email` action via its `template` param. UI: Settings → Traffic Engine → Automation → Email templates tab + Correspondence page (`/correspondence`) for review queue.
- Preset `correspondence_status_notify` (event `correspondence.matched`) notifies the TMP owner with the extracted outcome. `ensureAutomationPresets` seeds only presets missing from the rules table, so new presets install on existing databases at startup.
- No SMS provider, `sms_logs` table, `users.phone` field, or `notify_sms` action — dropped by product decision during P6.

## 8. Settings hub, developer & branding labels, SMTP persistence (P7)

- **Settings → General & System → Labels & Legal (developer role)** lets an admin rename UI copy without touching code. The frontend loads them through the `AppTextProvider` context (`frontend/src/context/AppText.jsx`) which exposes `nav(route)`, `pageTitle(key)`, `section(key)`, `column(page,key)`, `status(code)`, `complexity(code)` and `appName()`, each falling back to the built-in default when a key is missing.
- Stored as JSON strings in the `settings` table: `nav_labels_json` (15 sidebar routes), `page_titles_json` (15 pages), `sections_json` (11 detail-page panels), `columns_json` (7 table groups), `status_labels_json` (8 statuses), `complexity_labels_json` (4 complexities).
- **Branding**: `app_name` (login header, sidebar brand), `login_subtitle`, `footer_text`, `pdf_footer_text` (exported PDF footers), `privacy_policy` / `terms_of_service` (rendered as sections on the Help page and linked from the login screen). Company profile fields (name/ABN/phone/email) remain in the base settings and feed PDF exports.
- **System behaviour settings** (plain scalars in `settings`): `default_currency` (AUD/USD/GBP/EUR/NZD → export + time-tracking symbol), `timezone`, `date_format` (`yyyymmdd`/`ddmmyyyy` → PDF exports), `default_rate` (Time Tracking form/fallback), `session_timeout_minutes` (JWT expiry on login, default 1440, min 5), `default_sla_days` (SLA fallback when no rule matches, default 14), `risk_high_threshold` / `risk_extreme_threshold` (risk band boundaries, defaults 10/16), `notif_retention_days` / `email_retention_days` (scheduler cleanup of notifications/email logs, min 7, defaults 180/365), `maintenance_mode` (503s all `/api` writes except `/health`, `/auth`, `/settings`).
- **SMTP now persists** in the settings table (`smtp_host`, `smtp_port`, `smtp_secure`, `smtp_user`, `smtp_pass`, `smtp_from_name`, `smtp_from_email`) instead of `process.env` only — settings win over `SMTP_*` env fallbacks. `GET /api/email/config` returns the config with the password masked (`has_pass`); `POST /api/email/config` upserts. See `docs/email-setup.md` for the full provider guide.

