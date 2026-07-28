# LUX Traffic Management

WA Traffic Management System — TMP & Permit Management

## Features

- **TMP Management** — Create, track, and manage Traffic Management Plans
- **Permit Tracking** — Multi-authority permit workflows with SLA tracking
- **WA Authorities** — COP, MRWA, PTA, HVS with specific SLA rules
- **30m Signalised Intersection Rule** — Automatic MRWA trigger detection
- **Time Tracking** — Billable/non-billable entries with cost codes
- **Analytics** — Approval times, financial summary, rejection analysis
- **PDF Export** — Generate TMP and permits summary PDFs
- **Desktop App** — Electron-based Windows application

## Quick Start

### Development

```bash
npm install:all
npm run seed
npm run dev
```

Open http://localhost:5173

### Default Login

| Email | Password | Role |
|-------|----------|------|
| admin@tmpcms.com | admin123 | Admin |
| planner@tmpcms.com | planner123 | Planner |
| viewer@tmpcms.com | viewer123 | Viewer |

### Windows Build

```bash
build.bat
```

Or for portable:
```bash
npm run electron:portable
```

## Architecture

```
├── backend/          Node.js/Express API (SQLite)
│   ├── src/routes/   14 route modules
│   ├── src/middleware JWT auth, Zod validation
│   └── src/db.js     14 SQLite tables
├── frontend/         React + Vite + Tailwind
│   └── src/pages/    15 pages
├── electron/         Electron desktop shell
└── assets/           App icons
```

## Tech Stack

- **Backend**: Node.js, Express, better-sqlite3, JWT, Zod
- **Frontend**: React 18, Vite, Tailwind CSS, React Router
- **Desktop**: Electron 32
- **Build**: electron-builder (NSIS + portable)

## License

MIT — LUX Traffic Management
