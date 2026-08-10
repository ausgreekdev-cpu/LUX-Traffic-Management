# Server Deployment

LUX Traffic Management is a single Express server (Node.js + SQLite) that also serves the built
frontend from `frontend/dist`. You can run it:

1. As the packaged desktop app (default) — Electron embeds the server on `localhost`.
2. As a standalone Node server on a shared PC.
3. Inside Docker (recommended for a permanent shared server).

> **Single-node only:** the database is a SQLite file (`tmpcms.db`, WAL mode). It must live on
> one filesystem — SQLite does not work over a network share reliably. This is fine for a
> small team (tens of users) on one host. Beyond that, the data layer would need moving to
> PostgreSQL/MySQL.

---

## Configuration (environment variables)

| Variable        | Default                                    | Purpose                                   |
|-----------------|--------------------------------------------|-------------------------------------------|
| `PORT`          | `3001`                                     | HTTP listen port                          |
| `DB_PATH`       | `./data/tmpcms.db`                         | Path to the SQLite database file          |
| `UPLOADS_DIR`   | `<backend>/uploads`                        | Where uploaded plan documents are stored  |
| `CORS_ORIGIN`   | `http://localhost:5173,http://localhost:3001` | Allowed browser origins                |
| `JWT_SECRET`    | hardcoded dev value                        | **Change in production**                  |
| `SMTP_HOST`     | `smtp.example.com`                         | Outbound email (also editable in the app) |
| `SMTP_PORT`     | `587`                                      | SMTP port                                 |
| `SMTP_USER`     | —                                          | SMTP username / sender                    |
| `SMTP_PASS`     | —                                          | SMTP password                             |
| `NODE_ENV`      | *(unset)*                                  | Set `production` for prod runs            |

Environment can be supplied via a `.env` file in `backend/` (`dotenv` is loaded on start).

---

## Option 1 — Standalone Node server

Requires Node.js 20+ (built and tested on 22). `better-sqlite3` is a native module — the
`npm ci` step below downloads a prebuilt binary for your platform (Windows/Linux/macOS x64).

```bash
cd backend
npm ci --omit=dev
# seed the sample data + default users (admin@tmpcms.com / admin123) on first run only:
npm run seed
node src/index.js
```

Open `http://<host>:3001`. LAN users just browse to that address.

### Run as a service on Windows (optional)

Use Task Scheduler or [NSSM](https://nssm.cc/):

```bat
nssm install LUXBackend "C:\Program Files\nodejs\node.exe" "C:\lux\backend\src\index.js"
nssm set LUXBackend AppDirectory "C:\lux\backend"
nssm set LUXBackend AppEnvironmentExtra DB_PATH=C:\lux\data\tmpcms.db UPLOADS_DIR=C:\lux\uploads JWT_SECRET=<secret>
nssm start LUXBackend
```

On Linux use systemd:

```ini
# /etc/systemd/system/lux-backend.service
[Service]
WorkingDirectory=/opt/lux/backend
Environment=NODE_ENV=production
Environment=DB_PATH=/var/lib/lux/tmpcms.db
Environment=UPLOADS_DIR=/var/lib/lux/uploads
Environment=JWT_SECRET=<secret>
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
User=lux
```

---

## Option 2 — Docker

Requires Docker (and optionally Docker Compose).

### Build + run (Compose)

```bash
git clone https://github.com/ausgreekdev-cpu/LUX-Traffic-Management.git
cd LUX-Traffic-Management

# set a real JWT secret (and optionally SMTP creds) — it is forwarded from your shell/.env
set JWT_SECRET=change-me-please             # PowerShell
# export JWT_SECRET=change-me-please        # bash/zsh

docker compose build
docker compose up -d

# first run only: seed sample data + default users (admin@tmpcms.com / admin123)
docker compose exec lux-backend npm run seed
```

The app is live at `http://localhost:3001`. Data and uploads persist in the named volumes
`lux-data` and `lux-uploads` (survive rebuilds/restarts).

### Plain Docker (no Compose)

```bash
docker build -t lux-backend .
docker run -d --name lux-backend -p 3001:3001 \
  -e JWT_SECRET=change-me-please \
  -v lux-data:/app/data -v lux-uploads:/app/uploads \
  lux-backend
```

---

## HTTPS / reverse proxy

The Node server has no TLS. Put it behind nginx or Caddy so traffic is encrypted.

### nginx

```nginx
server {
    listen 443 ssl;
    server_name lux.example.com;
    ssl_certificate     /etc/letsencrypt/live/lux.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/lux.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Set `CORS_ORIGIN=https://lux.example.com` to match the origin users actually visit.
(certbot can automate the Let's Encrypt certificates.)

---

## Backups

The database is a single SQLite file in WAL mode. A consistent snapshot can be taken while
the server is running:

```bash
# on the host, from any shell with `sqlite3`:
sqlite3 /..path../tmpcms.db "VACUUM INTO 'backup-$(date +%F).db'"
# or in Docker:
docker compose exec lux-backend node -e "const D=require('better-sqlite3');const d=new D('/app/data/tmpcms.db');d.pragma('wal_checkpoint(TRUNCATE)');d.backup('/app/data/backup.db');console.log('backed up')"
```

Copy the resulting file plus the `uploads` volume somewhere safe. Restore by stopping the
server and replacing `tmpcms.db` (in-app restore is also available under Settings → Data).

---

## Option 4 — Netlify (serverless) ⚠️ demo-only

A `netlify.toml` + `netlify/functions/*` adapter deploys the Express API as serverless
functions. **This is not a persistent deployment** — the SQLite database lives in the
functions' ephemeral `/tmp` filesystem and is recreated on every cold start. Treat it as a
public demo/CI smoke target, never as the real system.

Consequences you must plan around:

- **All data resets on cold starts** (per-function, and functions recycle frequently):
  records, settings, SMTP config, webhook secrets and correspondence are lost.
- **Default credentials are never created on serverless.** If the DB is empty the function
  bootstraps a single admin from environment variables:
  - `NETLIFY_ADMIN_EMAIL` (required)
  - `NETLIFY_ADMIN_PASSWORD` (required)
  - `NETLIFY_ADMIN_NAME` (optional, default `Admin User`)
  If either variable is missing, **no users exist and login is impossible** — this is
  intentional, so the public endpoint never ships `admin@tmpcms.com / admin123`.
- The hourly scheduled function (`netlify/functions/scheduled.js`) runs the reminder scan,
  but its results are ephemeral too.

For any real shared deployment use **Option 2 (Docker)** or **Option 1 (standalone Node)** —
the same `netlify.toml`/serverless files are inert in those modes (they check for the
Netlify/Lambda environment before changing any behaviour).

---

## First login & security checklist

- **Seed** the DB once (`npm run seed` or the compose exec above) to create
  `admin@tmpcms.com / admin123`, then change the password from the Users page.
- **Set `JWT_SECRET`** to a long random string on the server — if unset, the code now
  generates and persists one in the settings table (desktop/local mode) so a shared default
  is never used.
- Decide whether to expose SMTP creds; otherwise the Email settings in the app UI keep
  working on their own.
- The embedded default users can be removed or roles tightened on the Users page.