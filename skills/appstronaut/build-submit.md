# Build & Submit — commands per project type

Run the block matching `BUILD_TOOL` from detect.sh. Always **confirm with the user before `submit`/upload** (irreversible, outward-facing).

## Expo / EAS  (BUILD_TOOL=eas)
Prereqs: `npm i -g eas-cli`, `eas login`, `eas.json` present (detect.sh reads its submit creds).
```bash
# Simulator build for screenshots (installable on a booted sim/emulator):
eas build -p ios     --profile preview     # .app for simulator (set ios.simulator true in profile)
eas build -p android --profile preview     # .apk

# Production store builds:
eas build -p ios     --profile production   # .ipa  → App Store
eas build -p android --profile production   # .aab  → Play Store

# Submit (uses submit.production creds in eas.json):
eas submit -p ios     --latest             # needs appleId / ascAppId / appleTeamId
eas submit -p android --latest             # needs serviceAccountKeyPath + track

# CI / autonomous mode — avoid interactive prompts:
eas build  -p ios --profile production --non-interactive
```

### ⚠️ Validate the .ipa with Apple BEFORE `eas submit` (verified 2026-08-04)

`eas submit` does **not** surface Apple's rejection reasons. A binary Apple refuses prints
`Scheduled iOS submission` → `- Submitting` and then sits at **0% CPU indefinitely**. It
reads exactly like a slow upload. Two hours were lost to this; nothing ever reached
TestFlight, and the CLI never errored.

Download the artifact and validate it directly first — it fails in seconds with the real
reason:

```sh
xcrun altool --validate-app -f app.ipa -t ios \
  --apiKey <KEY_ID> --apiIssuer <ISSUER_ID>
```

altool reads the key from `~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8` — copy it
there first.

**The error that hit here, worth pre-empting:**

```
ERROR 90725: This app was built with the iOS 17.5 SDK. All iOS and iPadOS apps
must be built with the iOS 26 SDK or later, included in Xcode 26 or later.
```

EAS's **default** macOS build image ships an older Xcode than Apple's current minimum, so a
project that builds and runs perfectly still produces an **unuploadable** binary. The local
Xcode version tells you nothing — the cloud builder's is what matters. Fix in `eas.json`:

```json
"production": { "ios": { "image": "latest" } }
```

Check this at **Stage 3 (Build)**, not Stage 7 (Submit).

### ⚠️ Expo SDK major-upgrade traps (battle-tested 2026-08-04, SDK 51→53 / RN 0.79 / React 19)

A clean `tsc --noEmit` proves nothing here — every one of these only appeared on build or at
first render:

- **Nested duplicate React = crash at the first hook.** npm can nest a second `react` under a
  dependency (moti did it) → RN 0.79 dies with `Cannot read property 'useContext' of null` /
  "Invalid hook call" on every screen. Fix: `"overrides": { "react": "<exact version>" }` in
  package.json + clean reinstall, then verify:
  `find node_modules -path "*/node_modules/react/package.json"` must return nothing.
  If a project already HAS an overrides pin, it is load-bearing — carry it through the
  upgrade at the new version, don't drop it.
- **Transitive deps become real deps.** `expo-font` imports `expo-asset`; without it listed,
  local dev works but the EAS **Bundle JavaScript** phase fails ("Unknown error" — the detail
  is in the build's web logs, reproduce locally with `npx expo export --platform android`).
- **RN 0.79's fmt 11.0.2 won't compile under Xcode 26** (`FMT_STRING … consteval … not a
  constant expression`, 5 errors in `format-inl.h`). `-DFMT_USE_CONSTEVAL=0` does NOT work —
  fmt's base.h redefines the macro unconditionally. Working fix: force the fmt pod to C++17
  in a `post_install` hook (flips fmt's own version-guard chain):
  ```ruby
  installer.pods_project.targets.each do |t|
    t.build_configurations.each { |c| c.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17' } if t.name == 'fmt'
  end
  ```
- **`expo prebuild --clean` destroys hand-made native fixes silently:** custom Podfile blocks
  (like the fmt one above) are regenerated away, and any Info.plist string not sourced from
  `app.json ios.infoPlist` regresses to the `$(PRODUCT_NAME)` placeholder Apple flags
  (`NSLocationAlwaysUsageDescription` did exactly this). Put every usage string in app.json;
  re-apply Podfile blocks after every prebuild. Kill an unwanted mic string via the camera
  plugin: `"microphonePermission": false`.
- **exFAT working drives shed AppleDouble files** — a `._MyApp.xcodeproj` next to the real
  one makes CocoaPods fail with "Could not automatically select an Xcode project". Before
  pod install on an exFAT volume: `find ios -name "._*" -delete`.
- **Stale `ios/Pods` + `ios/build` survive `prebuild --clean`** (gitignored, so untouched) and
  poison the new-RN build — remove both before the first post-upgrade `pod install`.
- **Bare-workflow icon lives in the asset catalog, NOT `assets/icon.png`.** With `ios/`
  checked in, EAS builds the native project as-is: fixing `assets/icon.png` (e.g. stripping
  the alpha channel Apple rejects) does nothing until the same file replaces
  `ios/<App>/Images.xcassets/AppIcon.appiconset/*.png`. Verify inside the built artifact:
  `unzip -p app.ipa 'Payload/*.app/AppIcon60x60@2x.png' | sips -g hasAlpha -`.
- After the upgrade, smoke-test the REAL flows on a sim build (login → main screen → the
  permission-critical flow → tab nav), not just launch — and re-verify the store-review
  path end-to-end before rebuilding for the stores.

### `eas build --local` — when the EAS cloud free tier is exhausted (build on this machine, $0)
The "free limit reached" the user hits is the **EAS cloud build quota**, NOT Expo itself. `--local` runs the same build on the user's machine and **does not consume the quota** — same `eas.json`, same EAS-managed signing (no manual keystore/cert juggling). Use it whenever: quota is out, the user refuses to pay, or they want a fully local pipeline but keep EAS credential management.
```bash
eas build --local -p android --profile production   # → .aab on disk (macOS/Linux)
eas build --local -p ios     --profile production   # → .ipa (macOS only — needs Xcode)
eas credentials                                     # one-time: EAS generates+stores keystore / iOS certs
```
- Requires local toolchain: Xcode **+ fastlane** (iOS — `eas build --local` shells out to fastlane for archive/sign; missing it fails with `spawn fastlane ENOENT`, install via `brew install fastlane`), Android SDK + Java 17 (Android). Native dirs may be gitignored (CNG) — `--local` prebuilds in a temp dir, so hand-edits to `ios/`/`android/` are still wiped by `expo prebuild`; let `eas credentials` own signing instead of editing `build.gradle`.
- **`--auto-submit` / `-s` does NOT work with `--local`** — fails immediately with *"Auto-submits are not yet supported when building locally"* (and the CLI exits **0** despite no build running — don't trust the exit code, grep the log). Always **two-step it**: `eas build --local … --output <path>` then `eas submit -p ios --path <path>` (or upload by hand).
- Use **`--output /abs/path/Name-<version>-build<N>.ipa`** to drop the artifact where you want with a versioned name. Get `<N>` first via `eas build:version:get -p ios` (the remote buildNumber; `autoIncrement` makes the build `N+1`).
- First Play upload must be manual anyway — see below.
- Trade-off vs cloud: you own the toolchain + build time; you skip the quota and the per-build wait queue.

#### When `eas build --local` for iOS can't import the signing cert (macOS keychain bug) — fastlane fallback (battle-tested 2026, macOS 26)
On some Macs `eas build --local -p ios` dies in **Prepare credentials** with *"Distribution certificate with fingerprint … hasn't been imported successfully"* — EAS writes its managed `.p12` to a temp keychain but `security` validation finds no codesigning identity. A CLI bump does NOT fix it (reproduced on eas-cli 19 and 20). The EAS-managed cert simply won't import locally. **Don't keep retrying — each attempt burns a buildNumber. Switch to a fully local fastlane archive that mints its own distribution credentials via the ASC API key:**

1. **Don't use `xcodebuild` automatic signing for the archive** — it tries to create an **iOS App *Development*** profile, which Apple refuses unless the team has ≥1 **registered device** (`error: Your team has no devices from which to generate a provisioning profile`). App Store **distribution** profiles need no device. Force *distribution manual* signing instead.
2. **fastlane Fastfile** (`ios/fastlane/Fastfile`) — device-free, ASC-key auth, creates its own dist cert + App Store profile:
   ```ruby
   lane :appstore do
     key = app_store_connect_api_key(key_id: "<KEYID>", issuer_id: "<ISSUER>", key_filepath: "<abs>/asc-key.p8")
     cert(api_key: key, development: false, team_id: "<TEAM>")          # Apple Distribution cert → local keychain (no device)
     sigh(api_key: key, app_identifier: "<bundleid>", team_id: "<TEAM>") # App Store profile (no device)
     update_code_signing_settings(use_automatic_signing: false, path: "<App>.xcodeproj",
       profile_name: lane_context[SharedValues::SIGH_NAME], code_sign_identity: "Apple Distribution",
       team_id: "<TEAM>", targets: ["<App>"])
     build_app(workspace: "<App>.xcworkspace", scheme: "<App>", configuration: "Release",
       export_method: "app-store", output_directory: "/tmp/export",
       export_options: { signingStyle: "manual", provisioningProfiles: { "<bundleid>" => lane_context[SharedValues::SIGH_NAME] } })
   end
   ```
   `cert(development:false)` creates a NEW Apple Distribution cert if the team's existing one's private key isn't in the local keychain (it won't be, if prior builds were EAS-cloud) — fine as long as under the 2–3 dist-cert limit.
3. **Entitlements mismatch after sigh** — `expo prebuild` can emit `ios/<App>/<App>.entitlements` with `keychain-access-groups = <bundleid>` (NO team prefix) and `aps-environment = development`. The freshly-minted App Store profile then rejects the archive: *"Provisioning profile … doesn't match the entitlements file's value for the keychain-access-groups entitlement."* **Fix the entitlements file** (it's gitignored/CNG, so the edit is per-build): keychain group → `$(AppIdentifierPrefix)<bundleid>`, and `aps-environment` → `production`. Re-run the lane.
4. **Version/build number** — with a pure-xcodebuild/fastlane path EAS's `appVersionSource: remote` + `autoIncrement` do NOT apply. Set `CFBundleShortVersionString` + `CFBundleVersion` directly in Info.plist (`PlistBuddy -c "Set :CFBundleVersion <N>"`); pick `<N>` > the last *uploaded* build (failed EAS attempts still bump the remote counter but upload nothing).
5. **Submit the resulting `.ipa`** with `eas submit -p ios --path <ipa> --profile production --non-interactive` (reuses `submit.production.ios` ASC creds) — `eas submit` works even when `eas build --local` couldn't.

Notes:
- `appVersionSource: remote` + `autoIncrement` handle build/version numbers — bump `version` in app.json per release; build number auto-increments.
- Cloud builds take ~10–25 min; the CLI prints a build URL you can poll.
- **Android submit gotcha — the "API access" page is GONE (verified 2026).** Google removed *Play Console → Setup → API access*. Service accounts are now created in **Google Cloud Console** (IAM & Admin → Service Accounts → create → Manage keys → Add key → JSON) and linked in **Play Console → Users & permissions → Invite new user** (paste the SA `client_email`, grant *Release to testing tracks* + *Manage production releases*). Enable the **Google Play Android Developer API** on the Cloud project. Regardless of the SA, the **very first** `.aab` for a package must be uploaded **manually** via the Console UI (Internal testing) before the Play API / `eas submit` will accept builds.
- **Org-policy blocker `iam.disableServiceAccountKeyCreation`** (common on Google Workspace accounts under Secure-by-Default): JSON key creation is denied org-wide; the "Manage policy" override is greyed out unless the user holds **Organization Policy Administrator** at the org node. Don't rabbit-hole on elevating that role. **Workaround: create the service account + JSON key under a personal @gmail.com Cloud project ("No organization" → no inherited policy), then invite that SA's email into Play Console** — Play grants access by email and does not care which org the SA lives in. Or skip the SA entirely and upload manually (no key needed for the first release).
- iOS `eas submit` uploads to App Store Connect; you still press **Submit to Review** in ASC (or via the version page).

### Headless / autonomous EAS from an agent (no interactive TTY) — battle-tested
Running `eas build` from a tool/agent shell (no real TTY) means EAS auto-selects **non-interactive** mode and these bite:

1. **First iOS build of a NEW EAS project FAILS at credentials** with *"Distribution Certificate is not validated for non-interactive builds. Run this command again in interactive mode."* The very first credential setup (cert + provisioning profile) needs an interactive session — `--non-interactive` can't bootstrap it, and env vars alone don't either. **Fix: give it a pseudo-TTY and feed Enter to accept defaults:**
   ```bash
   { while true; do printf '\n'; sleep 1; done } | script -q /dev/null \
     npx eas-cli build --platform ios --profile production --auto-submit
   ```
   `script -q /dev/null <cmd>` (macOS) allocates a pty so EAS runs *interactive*; the newline feeder answers prompts. Plain `yes y |` does NOT work for the select-style prompts (push-key / cert reuse) — use bare newlines (selects the highlighted default). Reused certs/profiles persist on EAS, so **subsequent builds run fully non-interactive**.
2. **Use an App Store Connect API key for Apple auth (no 2FA).** Set before the build so EAS authenticates + manages certs headlessly:
   ```bash
   export EXPO_ASC_API_KEY_PATH="$PWD/.credentials/asc-key.p8" \
          EXPO_ASC_KEY_ID=XXXXXXXXXX EXPO_ASC_ISSUER_ID=<uuid> \
          EXPO_APPLE_TEAM_ID=XXXXXXXXXX EXPO_APPLE_TEAM_TYPE=COMPANY_OR_ORGANIZATION
   ```
   The `.p8` from EAS-managed keys isn't re-downloadable; reuse one the user already has (same Apple account works across apps) or generate a fresh ASC API key (Admin role). Mirror it in `eas.json` → `submit.production.ios` (`ascApiKeyPath`/`ascApiKeyId`/`ascApiKeyIssuerId` + `ascAppId`, `appleTeamId`) for `--auto-submit`.
3. **iOS Push profile error** — *"Provisioning profile … doesn't include the Push Notifications capability / aps-environment"*. The app uses `expo-notifications` (declares `aps-environment`) but the **App ID never had Push enabled**, so every profile lacks it. The blind Enter-feed mis-answers the push-key select, so EAS doesn't enable it. **Enable Push directly via the ASC API, then rebuild** (EAS sees the profile is "no longer valid" and regenerates it with push):
   ```bash
   # JWT (ES256) from the .p8, then enable PUSH_NOTIFICATIONS on the bundle id
   TOKEN=$(python3 -c "import jwt,time;print(jwt.encode({'iss':'<ISSUER>','iat':int(time.time()),'exp':int(time.time())+1000,'aud':'appstoreconnect-v1'},open('.credentials/asc-key.p8').read(),algorithm='ES256',headers={'kid':'<KEYID>'}))")
   BID=$(curl -s "https://api.appstoreconnect.apple.com/v1/bundleIds?filter%5Bidentifier%5D=com.you.app" -H "Authorization: Bearer $TOKEN" | python3 -c "import json,sys;print(json.load(sys.stdin)['data'][0]['id'])")
   curl -s -X POST https://api.appstoreconnect.apple.com/v1/bundleIdCapabilities -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -d "{\"data\":{\"type\":\"bundleIdCapabilities\",\"attributes\":{\"capabilityType\":\"PUSH_NOTIFICATIONS\"},\"relationships\":{\"bundleId\":{\"data\":{\"type\":\"bundleIds\",\"id\":\"$BID\"}}}}}"
   ```
   (Note: Python.org Python may fail TLS to Apple — sign the JWT in Python but make the HTTPS calls with `curl`.)
4. **pnpm/yarn MONOREPO build fails at "Install dependencies"** — EAS runs `pnpm install --frozen-lockfile`; any lockfile↔package.json drift errors out fast (~60–90s). **Reproduce locally first:** `pnpm install --frozen-lockfile` (same command EAS runs). Common cause here: an aborted `npx expo run:ios`/`prebuild` in a monorepo **mis-detected the project and injected `expo`/`react`/`react-native` into a *sibling* package.json** (e.g. the backend's), desyncing the lockfile. Remove the bogus deps, `pnpm install`, re-verify frozen, rebuild. Always run prebuild with `--no-install` to avoid dep mutation: `npx expo prebuild --platform android --no-install`.
5. **Skip the per-submit export-compliance question:** add `ios.infoPlist.ITSAppUsesNonExemptEncryption: false` to app.json (true for HTTPS-only apps).
6. **Read a failed build's real error** (the CLI only says "Unknown error. See logs…"). The dashboard URL needs auth; fetch the signed log URL via GraphQL with the local session token:
   ```bash
   TOK=$(python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/.expo/state.json')))['auth']['sessionSecret'])")
   curl -s -X POST https://api.expo.dev/graphql -H "Content-Type: application/json" -H "expo-session: $TOK" \
     -d '{"query":"query($id:ID!){builds{byId(buildId:$id){status error{message} logFiles artifacts{applicationArchiveUrl}}}}","variables":{"id":"<BUILD_ID>"}}'
   ```
   `logFiles[0]` is a signed GCS URL (curl it directly); `applicationArchiveUrl` is the `.ipa`/`.aab`/`.apk` download. Poll `status` (IN_QUEUE → FINISHED/ERRORED) instead of holding the CLI.

### Local native dev build on a simulator (no Expo Go, no cloud)
For *testing the real app locally* — when the user says "install the native app on the simulator" or "don't run it through Expo Go" — build the project's own native binary with the local toolchain instead of EAS. Requires Xcode + CocoaPods (iOS) / Android Studio SDK (Android) on the machine. There are three distinct ways to get an Expo app onto a simulator; pick by what the user asked for:

| Method | Command | What runs | Use when |
|--------|---------|-----------|----------|
| Expo Go | `npx expo start --ios` | JS in the **Expo Go** sandbox app | quick JS-only check; no custom native modules |
| **Local native build** | `npx expo run:ios` | the project's **own** `.app` (debug), JS from Metro | testing the real app / custom native modules; "install native app" |
| EAS preview | `eas build -p ios --profile preview` | standalone sim `.app` from the cloud | no local Xcode, or sharing a build |

```bash
# iOS — build + install + launch the native debug app on a booted simulator:
npx expo run:ios --device "<SIM_UDID_or_name>"   # omit --device to pick interactively / default sim
# Android equivalent:
npx expo run:android --device <emulator_name>
```
`expo run:ios` runs `pod install` (incremental), `xcodebuild` (debug), installs the `.app`, and launches it. **First build is slow (~8–15 min)** — it compiles every Pod (React core, expo-modules-core, reanimated, screens…). Rebuilds are fast. It still starts Metro for the JS bundle; bundle id comes from `app.json` → `expo.ios.bundleIdentifier`. Boot the sim first (`xcrun simctl boot <udid>; open -a Simulator`) and pass its UDID.

**Critical gotcha — Expo SDK / babel-preset-expo version mismatch (causes `Exception in HostFunction`).** If the app red-screens on launch at a `react-native-reanimated` import with `Uncaught Error … Exception in HostFunction: <unknown>`, the cause is almost always that `babel-preset-expo` resolved to the **wrong major** for the installed Expo SDK (e.g. a `^55` caret pulling babel-preset-expo 55 into an SDK 54 project). Reanimated 4's worklets babel plugin (shipped via `babel-preset-expo` + `react-native-worklets`) then never transforms the worklets → the native side throws. Fix:
```bash
npx expo install --fix      # realigns babel-preset-expo, expo-router, expo-updates, etc. to the installed SDK
npx expo start --clear      # or expo run:ios — MUST clear Metro cache so stale babel output is dropped
```
Verify with `node -e "console.log(require('./node_modules/babel-preset-expo/package.json').version)"` — its major must match the Expo SDK major.

**Forcing a reload after a cache-clear:** Expo Go / a running dev build can keep showing a stale error overlay. Terminate and reopen rather than trusting hot-reload:
```bash
xcrun simctl terminate <udid> host.exp.Exponent        # Expo Go (bundle id host.exp.Exponent)
xcrun simctl terminate <udid> <your.bundle.id>         # a native dev build
xcrun simctl openurl <udid> "exp://127.0.0.1:8081"     # reopen via the dev URL
```
Confirm the result with `xcrun simctl io <udid> screenshot /tmp/x.png` and look at it — a successful launch shows the app's first screen, not a red LogBox.

## Flutter  (BUILD_TOOL=flutter)
```bash
flutter build ipa            # iOS → build/ios/ipa/*.ipa (then upload via Transporter or:)
xcrun altool --upload-app -f build/ios/ipa/*.ipa -u <appleId> -p <app-specific-pw>
flutter build appbundle      # Android → build/app/outputs/bundle/release/app-release.aab
# Upload .aab via Play Console UI or fastlane supply.
```

## Bare React Native / Native iOS  (BUILD_TOOL=native | xcodebuild)
```bash
# Archive + export IPA:
xcodebuild -workspace ios/App.xcworkspace -scheme App -configuration Release \
  -archivePath build/App.xcarchive archive
xcodebuild -exportArchive -archivePath build/App.xcarchive \
  -exportPath build -exportOptionsPlist ios/ExportOptions.plist
xcrun altool --upload-app -f build/App.ipa -u <appleId> -p <app-specific-pw>
```

## Native Android / Bare RN Android  (BUILD_TOOL=gradle)
```bash
cd android && ./gradlew bundleRelease   # .aab at app/build/outputs/bundle/release/
# Upload via Play Console or: fastlane supply --aab <path> --track production
```

## Manual store steps (no CLI — do in the web console)
Both stores gate publishing on these; pull specifics from `store-assets/REQUIREMENTS.md`:
- **Apple (App Store Connect):** age rating questionnaire, App Privacy (data) answers, export compliance, pricing+territories, demo login for review, screenshots upload, description/keywords.
- **Google (Play Console):** Data safety form, content rating (IARC), target audience, app access (demo login), privacy policy URL, feature graphic (1024×500), screenshots upload, countries+pricing, release notes.
