# LUX Field — Mobile App

Capacitor wrap of the LUX Traffic Management web frontend for on-site crews.
View-only mode (plans, board, permits, checklists) plus site-photo capture that
uploads to the live web app and appears under the matching task card.

The app is a thin native shell around `frontend/dist` (`webDir: ../frontend/dist`).
It reuses the existing `api.js`, auth and branding — no duplicated business logic.

## API Base

The app talks to the deployed backend at `https://lux-official.netlify.app` by
default. To point it elsewhere set the `lux_api_base` key in localStorage (via the
login screen's dev tools) — the shell reads it in `frontend/src/main.jsx`.

## Prerequisites

- **Frontend deps** (first time only):
  ```bash
  cd ../frontend && npm install
  ```
- **Mobile deps**:
  ```bash
  cd mobile && npm install
  ```
- **Android**: JDK 17+ and Android SDK. On this machine:
  - JDK: Temurin 21 at `C:\Program Files\Eclipse Adoptium\jdk-21.0.12.8-hotspot`
  - SDK: `C:\Android\sdk` (set `ANDROID_HOME`; Gradle installs missing platforms)
- **iOS**: macOS with Xcode + CocoaPods (`pod install`). Not buildable on Windows.

## Build (web + sync)

```bash
npm run build
```

Runs the frontend build then `cap sync` (copies `frontend/dist` into the native
projects). Platform folders are committed but web assets are gitignored, so always
run `cap sync` after changing the frontend.

## Android

Build the debug APK:

```bash
npm run android:apk
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`

Install on a connected device (USB debugging enabled):

```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

Release builds:

```bash
cd android && gradlew assembleRelease
```

Sign with `mobile/android/app/*.jks` + a `key.properties` (see Android docs) before
distributing. Debug builds are signed with the default debug key.

## iOS

On a Mac:

```bash
cd mobile && npx cap sync
cd ios/App && pod install
cd ../../ && npx cap open ios
```

Set a unique bundle id in Xcode (Signing & Capabilities) and run on a device/simulator.
App Store distribution requires a paid Apple Developer account.

## Photo pipeline

Uploads go to `POST /api/photos` (Blob-backed, durable). Permissions enforced
server-side:

| Role | View | Upload | Delete |
|------|------|--------|--------|
| Client | yes | no | no |
| Staff | yes | yes | no |
| Manager+ | yes | yes | yes |

Photos appear in the web app under the TMP detail page and the Kanban card modal.
While offline, captures are queued in IndexedDB and flushed automatically when the
connection returns (see `frontend/src/lib/fieldStore.js`).

## Configuration

- `mobile/capacitor.config.json` — app id (`com.lux.traffic.field`), name (`LUX Field`),
  `webDir`, `androidScheme` (https), `allowMixedContent`.
- `frontend/src/main.jsx` — native API-base boot override.
- App icons / splash: replace `android/app/src/main/res/` and
  `ios/App/App/Assets.xcassets/` (then `cap sync`).