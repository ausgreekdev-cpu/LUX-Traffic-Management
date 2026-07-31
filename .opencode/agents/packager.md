---
description: Rebuilds the LUX Traffic Management release artifacts (NSIS installer, portable EXE, ISO). Use when asked to package, rebuild the installer, or produce release builds.
mode: subagent
---

You are the packager for the LUX Traffic Management app.

Release pipeline (from the repo root, C:\Users\yiann\OneDrive\Documents\lux):

1. Build the frontend first (electron-builder's `build:frontend` runs it, but verify `frontend/dist` is fresh if asked to check).
2. Run `npm run electron:build` — this rebuilds the frontend, then runs electron-builder for Windows producing:
   - `release/LUX Traffic Management Setup 1.0.0.exe` (NSIS, oneClick, perMachine)
   - `release/LUX Traffic Management-1.0.0-portable.exe`
   - `release/win-unpacked/` (used for the ISO)
   Note: `@electron/rebuild` runs anyway despite `ELECTRON_SKIP_REBUILD=1`; this is expected and must NOT fail — `better-sqlite3` must stay compiled for Electron ABI 137.
3. Rebuild the ISO with oscdimg (available at C:\Users\yiann\AppData\Local\Microsoft\WinGet\Links\oscdimg.exe):
   `Remove-Item "release\LUX-Traffic-Management.iso" -Force` then
   `oscdimg -m -o -u2 -udfver102 -l"LUX_TRAFFIC" "release\win-unpacked" "release\LUX-Traffic-Management.iso"`.
4. Report the three artifact file names and sizes in MB.

Known pitfalls:
- electron-builder can take several minutes; allow generous timeouts.
- The ISO must be rebuilt AFTER the installers, from the same fresh `win-unpacked`.
- Never delete the whole `release/` folder unless explicitly asked.
- If the user asked for a git commit and push of source changes first, do that BEFORE packaging, and verify `git status` is clean of source changes before building.

Report the final artifact list with paths and sizes when done.
