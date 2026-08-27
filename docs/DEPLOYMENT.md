# Store Deployment

This document covers packaging and publishing to the **Google Play Store** (Android)
and the **Microsoft Store** (Windows).

---

## Prerequisites

- Node.js 20+
- For Android builds: JDK 17+ and the Android SDK (see [Mobile](#mobile))
- Store developer accounts:
  - [Google Play Console](https://play.google.com/console) (one-time $25 USD)
  - [Microsoft Partner Center](https://partner.microsoft.com) (one-time per account / visual studio sub)

---

## Mobile (Google Play / Android)

The web frontend is wrapped in a native Android shell using **Capacitor**.

### Tooling

```bash
# Java / JDK (version 17 recommended)
sudo apt install openjdk-17-jdk

# Android command-line tools + platform & build tools
export ANDROID_HOME=$HOME/Android/Sdk
# add SDK platform 35, build-tools 35.0.0, platform-tools
```

### Build the release APK / AAB

```bash
cd frontend
npm i
npm run build          # bundles web assets into dist/frontend
npx cap sync android   # copies web assets + config into android/

cd android
./gradlew assembleDebug        # debug APK
./gradlew bundleRelease        # release AAB  (what Google Play wants)
./gradlew assembleRelease      # release APK  (for sideloading)
```

### Signing

Google Play requires a signed release build. Generate a dedicated keystore and keep
it safe (never commit it):

```bash
keytool -genkey -v \
  -keystore delux-tpm-crm-release.keystore \
  -alias delux-tpm-crm \
  -keyalg RSA -keysize 2048 -validity 10000
```

Then configure the release signing in `android/app/build.gradle`:

```gradle
android {
    signingConfigs {
        release {
            storeFile file('delux-tpm-crm-release.keystore')
            storePassword System.getenv('KEYSTORE_PASSWORD')
            keyAlias 'delux-tpm-crm'
            keyPassword System.getenv('KEY_PASSWORD')
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

Set `KEYSTORE_PASSWORD` / `KEY_PASSWORD` as CI secrets (never hardcode).

### App icon

Replace the placeholder launcher icons in `android/app/src/main/res/`.
Provide square PNGs (at least 512x512, ideally 1024x1024) and run:

```bash
cd frontend && npx @capacitor/assets generate --android
```

### Upload to Google Play

1. In Google Play Console, create an app.
2. Under **Release → Production**, upload the `.aab` file from
   `frontend/android/app/build/outputs/bundle/release/`.
3. Google Play uses **App Signing** (Play manages the signing key; upload key is
   what you provide).
4. Complete the store listing (description, screenshots, category, content rating,
   data safety, privacy policy link).

> Note: the current Android build uses a local `API_BASE` default of
> `http://localhost:3001`. For production you must build the frontend with a
> reachable backend URL:
>
> ```bash
> VITE_API_BASE=https://api.your-domain.com npm run build && npx cap sync android
> ```

---

## Desktop (Microsoft Store / Windows)

The Electron app is packaged as **MSIX** (the format the Microsoft Store requires).

### Build the MSIX package

```bash
cd desktop
npm run build:msix   # electron-builder --win msix
```

Output: `desktop/dist/*.msix` (and `.msixupload` used by Partner Center).

### Signing

The Microsoft Store requires an MSIX signature. The build defaults to a
self-signed certificate (`createCertificate: true`) so the package builds
out of the box. Two options for actual publication:

1. **Upload with Partner Center** (recommended): submit the generated
   `.msixupload` and let Partner Center sign it after validation.
2. **Self/EV signing**: obtain a code-signing certificate, set
   `msix.certificateFile` / `certificatePassword` in `desktop/package.json`
   (or via `CSC_LINK` / `CSC_KEY_PASSWORD` env vars) and set
   `createCertificate: false`.

### Upload to Microsoft Store

1. In [Partner Center](https://partner.microsoft.com), add/select your app.
2. Under **Packages**, upload the `.msixupload` file.
3. Complete the store listing, pricing, age ratings, and privacy policy.

---

## CI

See `.github/workflows/ci.yml` for the CI pipeline. Add the secrets below in the
GitHub repo **Settings → Secrets and variables → Actions**:

| Secret               | Used for                                     |
| -------------------- | -------------------------------------------- |
| `KEYSTORE_PASSWORD`  | Android release signing                      |
| `KEY_PASSWORD`       | Android release signing                      |
| `MSIX_CERT_BASE64`   | (optional) Microsoft Store code-signing cert |
| `MSIX_CERT_PASSWORD` | (optional) MSIX cert password                |

The CI will then produce an Android **AAB** and Windows **MSIX** as release artifacts.
