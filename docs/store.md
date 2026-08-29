# Microsoft Store Submission Guide — Delux TPM CRM

**App:** Delux TPM CRM (`com.ausgreek.deluxtpmcrm`, `1.2.3`)  
**Publisher:** AusGreek Developments (`CN=AusGreek Developments`)  
**Category:** Business > Project Management

## 1. Prerequisites

*   **Partner Center account** — $19 (individual, one-time) or $99 (company, verified business, DUNS). Create at https://partner.microsoft.com/dashboard → **Account settings**.
*   **Reserved name** — Partner Center → `Create a new app` → reserve `Delux TPM CRM`. After reservation you receive **Identity Name** (`AusGreekDevelopments.DeluxTPMCRM`) and **Publisher** (`CN=...`). Copy these into `package.json:25` `build.appx.identityName` / `publisher`.
*   **225 MB+ MSIX** — built via `npm run electron:msix` or CI `build-msix.yml` (`windows-latest`). The MSIX is signed by Store on upload; for local sideload test you need a test cert.

## 2. Build MSIX Locally (Windows 10/11)

```powershell
# 1. Build frontend (generates frontend/dist)
npm ci
cd backend; npm ci; cd ..
npm run build:frontend

# 2. Build MSIX (requires electron-builder)
npm run electron:msix
# Output: release/Delux TPM CRM 1.2.3.msix  (+ .blockmap)
```

The MSIX uses `build/appx/*Logo.png` generated from `assets/icon.png` (256) + `frontend/public/pwa-512x512.png` (512). Replace with professionally rendered Store scales (50, 44, 150, 310) before final submission if possible — electron-builder will auto-scale the single source but Store review prefers crisp assets.

**Test sideload (unsigned):**
```powershell
# Install test cert (if you generated one)
Add-AppxPackage release/Delux*.msix
```

**For CI/test signing:** Add secrets `WINDOWS_CERTIFICATE_BASE64` (base64 `.pfx`) + `WINDOWS_CERTIFICATE_PASSWORD` → `build-msix.yml` sets `CSC_LINK`/`CSC_KEY_PASSWORD`. For Store submission **leave `CSC_LINK` empty** — Partner Center re-signs with its trusted cert.

## 3. CI — Automated MSIX

Workflow `.github/workflows/build-msix.yml` runs on `push main/master`, `tags v*`, manual dispatch:

```
windows-latest → setup-node 22 → npm ci (root + backend) → npm run build:frontend → npx electron-builder build --win msix --publish never → upload release/*.msix
```

Artifacts expire in 14 days. Download from Actions → `build-msix` → `msix-package`.

## 4. Store Listing Checklist

| Field | Value / Source |
|-------|----------------|
| **Identity Name** | `AusGreekDevelopments.DeluxTPMCRM` (from Partner Center) |
| **Publisher** | `CN=AusGreek Developments` (must match `package.json:build.appx.publisher`) |
| **Publisher Display Name** | `AusGreek Developments` |
| **Display Name** | `Delux TPM CRM` |
| **Short Description** | WA Traffic Management — TMP, permits, GIS TCD, dispatch. Powered by AusGreek Developments. |
| **Long Description** | Use `frontend/public/screenshot-wide.png` + `screenshot-narrow.png` as hero; describe GIS CAD, WA LGA rule engine, offline field, audit log. |
| **Category / Subcategory** | Business > Project Management |
| **Keywords** | traffic management, TMP, TGS, Main Roads WA, LGA, permit |
| **Pricing** | Free download + IAP (Starter $79 / Pro $199 / Agency $499) or Paid one-time — match `backend/src/saas/tiers.js` |
| **Privacy Policy URL** | `https://lux-official.netlify.app/privacy` (create page — Store requires HTTPS privacy URL) |
| **Support URL / Contact** | `https://lux-official.netlify.app/support` or `info@ausgreek.dev` |
| **Copyright** | `© AusGreek Developments 2026` |
| **Age Rating (IARC)** | Complete questionnaire — Business/Productivity → **Everyone (3+)** / `E` |
| **Capabilities** | `internetClient`, `runFullTrust` (for `better-sqlite3` native + `localhost:3001`), optionally `privateNetworkClientServer` if intranet sync |
| **Screenshots** | Min 1 Desktop 1366×768 @100%, recommended 4 × 3840×2160. Capture `frontend/dist` at 1366×768 and 1920×1080. Source: `frontend/public/screenshot-wide.png` (1280×720) + `screenshot-narrow.png` (720×1280). |
| **Store Logos** | `build/appx/StoreLogo.png` (50×50), `Square44x44Logo.png`, `Square150x150Logo.png`, `Wide310x150Logo.png`, `LargeTile`, `SplashScreen` — already in `build/appx/` (generated from `assets/icon.png` / `pwa-512x512.png`). |

## 5. Upload to Partner Center

1.  Partner Center → Your app → **Product → Packages** → drag `release/*.msix` (not `nsis`).
2.  **Certification** will validate `appxManifest` (`internetClient`, `runFullTrust` must be declared). If `publisher` mismatch, error `Publisher display name does not match` — update `package.json:build.appx.publisher` to exactly what Partner Center shows (including `O=`, `L=`, `S=`, `C=` if present).
3.  **Submission → Store listings** → fill fields above → **Age rating** → **Pricing** → **Submit for certification** (24-72h).
4.  **Update behavior:** Store handles updates; `electron/main.js:127` `autoUpdater` is auto-disabled when `process.windowsStore` is true.

## 6. Versioning

*   Store Package Version is **quad** `1.2.3.0`. Bump `package.json:3` `version` for each Store submission (`1.2.4` → `1.2.4.0` in `.msix`). `electron-updater` uses GitHub `v1.2.4` tag for non-Store (NSIS/portable) — keep both.

## 7. Troubleshooting

*   **`makeappx` validation: Publisher mismatch** → copy exact `CN=` from Partner Center → Identity.
*   **`SignTool Error: No certificates`** → For local test, `New-SelfSignedCertificate -Type Custom -Subject "CN=AusGreek Developments" -KeyUsage DigitalSignature -FriendlyName "Delux Test" -CertStoreLocation Cert:\CurrentUser\My` + export `.pfx` → set `CSC_LINK`.
*   **`frontend/dist` missing** → `npm run build:frontend` first; `package.json:25` `extraResources {from:"frontend/dist"}` requires it.
*   **Black screen after install** → `frontend/dist` not included; check `extraResources` path.

## 8. Related Docs

*   `docs/server-deployment.md` — Docker / Netlify self-host
*   `package.json:25` `build` — authoritative electron-builder config
*   `electron/main.js:127` — autoUpdater Store guard
*   `.github/workflows/build-msix.yml:1` — CI
