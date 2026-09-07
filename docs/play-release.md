# Google Play Release — LUX Field (com.lux.traffic.field)

Email: ausgreekdev@gmail.com

## 1) Privacy policy — DONE
- Public URL: `https://lux-official.netlify.app/privacy` (no login, `App.jsx:117`)
- Source: `frontend/src/pages/Privacy.jsx:1` updated 2026-09-07 with `ausgreekdev@gmail.com`, Data Safety, permissions.
- After deploy, verify `curl https://lux-official.netlify.app/privacy` returns 200 (not 401).
- Set this URL in Play Console → Policy → Privacy policy.

## 2) Android build — READY (needs JDK 17+ on your Windows)
- Permissions: `mobile/android/app/src/main/AndroidManifest.xml:16` now `INTERNET, ACCESS_NETWORK_STATE, CAMERA, ACCESS_COARSE_LOCATION, ACCESS_FINE_LOCATION, READ_MEDIA_IMAGES` + `uses-feature camera not required`.
- Version: `mobile/android/app/build.gradle:10` `versionCode 5` / `versionName 1.2.4` (bumped from 1/1.0)
- Signing: `mobile/android/app/upload.p12` (PKCS12, pass Delux123, alias upload) + `mobile/android/app/key.properties` (gitignored, see `.gitignore:25`). Generated via `openssl pkcs12 -export` — **replace with real JKS via keytool on Windows before production**:
  ```bat
  keytool -genkeypair -alias upload -keyalg RSA -keysize 2048 -validity 9125 -keystore mobile\android\app\upload.jks
  # then update key.properties: storeFile=upload.jks
  ```
  **BACKUP `upload.jks/p12` + passwords forever — loss = cannot update app.**
- Build on Windows (JDK 21 at `C:\Program Files\Eclipse Adoptium\jdk-21.0.12.8`):
  ```bat
  cd mobile && npm install
  npm run build  :: builds frontend/dist + cap sync
  cd android && gradlew bundleRelease
  :: output: android/app/build/outputs/bundle/release/app-release.aab
  ```

## 3) Play assets — in `play-assets/`
- Feature graphic `1024x500` ✅, phone screenshots `1080x1920` ×2 (placeholders) — replace with real device shots before submit.
- Icon: `mobile/android/app/src/main/res/mipmap-*` already has.

## 4) Console checklist (play.google.com/console)
1. Create app → `com.lux.traffic.field`, `LUX Field`, App type: App, Category: Business/Productivity.
2. Store listing: short desc (80ch), full desc, `ausgreekdev@gmail.com`, website `https://lux-official.netlify.app`, privacy URL above, graphics (feature + screenshots + 512 icon).
3. Content rating: IARC questionnaire → Everyone (field tools, no mature content).
4. Data Safety: declare `Email, Name` (account), `Photos, Location` (optional foreground, geotag), `No third-party sharing`, `Encrypted in transit/at rest`, `No tracking`. Link privacy policy. Map matches `Privacy.jsx`.
5. App content: Target audience 18+, no ads, no health/children.
6. Upload `app-release.aab` to **Internal testing** → add `ausgreekdev@gmail.com` tester → promote to **Closed** → **Production** after review.

## 5) Post-build note
- No Java on this server, so `gradlew bundleRelease` must run on your Windows. The `upload.p12` here is valid PKCS12 for local testing; for Play, prefer `upload.jks` via `keytool` and keep Play App Signing enabled on first upload.

