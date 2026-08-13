# Serverless Database Migration Plan — Managed SQL (Tier 4)

## Why migrate

The current Netlify architecture stores SQLite in `/tmp` (ephemeral, per-instance) and
snapshots the whole file to Netlify Blobs after mutations. Tier 1-3 hardening
(versioned blobs, integrity checks, seq-guarded optimistic writes, offsite backups)
drastically reduces the risk, but it cannot eliminate two structural limits:

1. **Split-brain is possible.** Two warm Lambda instances mutate their own `/tmp`
   copies concurrently. Each snapshots its own divergent DB; the ETag CAS prevents an
   older snapshot from clobbering a newer one, but genuinely concurrent writes from two
   instances can still be lost (one instance's view is simply newer).
2. **20-second snapshot window + 8s upload budget.** A burst of writes inside one
   snapshot interval on an instance that then freezes can lose the tail of writes.
3. **No point-in-time recovery.** Only the last good snapshot survives, even with the
   `prev` slot.

Managed SQL (multi-reader, real-time writes, WAL-free) removes all three.

## Goal

Serve the Netlify Functions from a managed SQL database so every instance reads and
writes one consistent dataset, with replication + automated backups + point-in-time
recovery provided by the provider.

## Candidate providers (2026)

| Provider | Engine | Why it fits | Notes |
|----------|--------|-------------|-------|
| **Turso** | libSQL (SQLite fork) | Drop-in SQLite-compatible; branch-based PITR built in; free tier | best-sqlite3 API is close but not identical — needs `@libsql/client` + async adapter |
| **Supabase** | Postgres | Real DB, RLS for the client-owner scoping, pgBackrest-managed backups | SQL dialect changes + the app's raw SQL must be rewritten |
| **Neon** | Postgres | Serverless-friendly, branching for PITR, autoscaling | Same SQL rewrite cost as Supabase |

Recommendation: **Turso first** — it preserves the SQLite query layer (everything
`db.prepare` does stays valid), which keeps this migration mostly mechanical. Postgres
is a larger rewrite of every route.

## Phased approach

### Phase A — abstraction layer (no behavior change)
1. Introduce a thin storage interface in `backend/src/db.js`:
   - Keep the current better-sqlite3 implementation as the **local/desktop** backend.
   - Add a new `TursoDatabase` that implements the same `prepare/run/get/all/pragma/exec`
     surface using `@libsql/client` (async under the hood).
2. Routes currently call synchronously (`db.prepare(...).get`). Either:
   - wrap each call in the router with `await` and switch routes to `async`, or
   - use libSQL's **replication URL + local replica** — open a synchronous local SQLite
     replica, `sync()` to the remote, keeping the sync API. This is the least invasive path.
3. Add a `DB_BACKEND` env (`sqlite` | `turso`) and an in-app health/`about` readout.

### Phase B — dual-write shadow
4. Run `sqlite` as primary and `turso` as shadow for a soak period. Compare counts
   (`SELECT COUNT(*)` per table) and checksums nightly via the scheduler. Keeps rollback
   trivial (flip the env var).

### Phase C — cutover
5. Point the serverless build at Turso; disable blob snapshotting
   (keep the blob upload code dormant for offsite backup of the local desktop app).
6. Keep `scheduled.js` `runScheduledChecks` unchanged (it only touches the DB via db.js).

### Phase D — cleanup / optional
7. If Postgres wins on requirements later, the abstraction isolates the rewrite to
   `db.js` + the SQL dialect, table-by-table.
8. For desktop, keep `better-sqlite3` + the Tier 2/3 local durability + offsite upload —
   those become the desktop backup path and are not removed.

## Open questions to resolve first
- Volume of writes per day (relevant to Turso free vs paid).
- Whether workflows/automations run inside hosts only during business hours.
- Multi-user concurrency expectations on a planning app (mostly low-write, form-heavy).
- RLS requirement: with a single deploying role + app-level scoping already enforced,
  are row-level grants needed at the DB (recommended for Postgres, optional for Turso)?

## Definition of done
- [ ] `DB_BACKEND=turso` builds and serves on Netlify
- [ ] Roles tests pass against Turso (client/owner scoping, admin, staff gates)
- [ ] 7 days shadow par
- [ ] Point-in-time restore drill succeeds on Turso branch
- [ ] Desktop still uses local SQLite and its backup/offsite path