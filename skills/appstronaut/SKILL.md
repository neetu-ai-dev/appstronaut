---
name: appstronaut
description: Ship a mobile app to the iOS App Store and Google Play end to end. One round of intake questions, then it fills App Store Connect and Play Console through their APIs (browser only for the gaps), runs a rejection preflight built from real rejections, captures store screenshots on simulators/emulators, builds, uploads and (when asked) submits for review. Covers developer-account enrollment, app registration, TestFlight / Play testing and production release for Expo/EAS, React Native, Flutter and native iOS/Android. Stops only for passwords, agreements, 2FA and the final Submit. Use when the user wants to publish, prepare store screenshots or listings, gather store requirements, or fix a store rejection.
---

# appstronaut

A staged wizard to take a mobile app from **nothing → live on the stores**. You (the LLM) are the brain; thin scripts are the hands. `SKILL_DIR` = this file's directory.

## Works in any agent

This skill is plain markdown plus shell / Node scripts, so any coding agent that can run commands
can follow it (Claude Code, Codex CLI, Cursor, Gemini CLI, GitHub Copilot). Where it names a
capability, use your agent's equivalent:

| The skill says | Claude Code | Other agents |
|---|---|---|
| **ask the user** (intake, checkpoints) | `AskUserQuestion` | your question tool, else a numbered list in chat with the recommended answer first — then wait |
| **fetch a page** (live specs, fees) | `WebFetch` | your web / fetch tool, else `curl -sL <url>` |
| **drive the browser** (console-only steps) | Chrome (`claude --chrome`) | a Playwright / browser MCP server or computer-use tool, else hand the human `console-browser.md` as a click list |
| **run a script** | Bash | your shell tool |

Host: **macOS** (Xcode for iOS simulators and uploads; Android SDK for emulators). Node 18+ for
`scripts/store/`.

## Pipeline mode — "fill everything for me" (preferred)

When the user wants the stores set up end to end, run this pipeline instead of the staged
wizard. It asks questions **once**, then works unattended. Progress lives in
`<project>/store-assets/launch-state.json` (`{"stage": "…", "done": [...], "blocked": [...]}`)
so a restarted session resumes where it stopped.

```
A Intake ─▶ B Profile ─▶ C Preflight(setup) ─▶ D Assets ─▶ E API fill ─▶ F Browser fill ─▶ F2 Push ─▶ G Build ─▶ H Preflight(submit) ─▶ I Human handoff
```

| Stage | What runs | Reference |
|---|---|---|
| **A Intake** | One round of questions (≤12; see *Works in any agent*), pre-filled from the repo → `store-assets/store-config.json` | `intake.md` |
| **B Profile** | Derive permissions, SDKs, data types, tablet support, UGC, payments **from code** (never ask) → `declarations` in store-config; show the human once | `scripts/requirements/app-profile.md` |
| **C Preflight** | `node scripts/store/preflight.mjs --config …` — fix every FAIL before touching a console | `rejection-catalogue.md` |
| **D Assets** | Icons, feature graphic, listing copy (≤ limits), screenshots (Stage 5 below; one simulator at a time) | Stage 5, `android-screenshots-fallback.md` |
| **E API fill** | `asc-fill.mjs` then `play-fill.mjs` — dry run, read the plan, then `--apply` (`--screenshots`, `--images` to upload media) | `scripts/store/` |
| **F Browser fill** | Only what no API reaches: create both app records, App Privacy, Play category / App content / countries | `console-browser.md` |
| **F2 Push** | Only if the app sends push or opens website links: `apple-capabilities.mjs` (App ID capabilities + new profile), Firebase project + `google-services.json`, `fcm-key.sh`, then two `eas credentials` menus run by the human | `push-setup.md` |
| **G Build** | Store builds (EAS production or local), `altool --validate-app` for iOS | `build-submit.md` |
| **H Preflight** | `preflight.mjs --stage submit` — site, API and reviewer login must be live | `rejection-catalogue.md` |
| **I Release** | `node scripts/store/release.mjs --ipa … --aab …` — preflight gate → altool validate + upload → wait for processing → asc-fill/play-fill → attach build → **submit** (only with `--submit` or store-config `"autoSubmit": true`, set only when the owner asked for automatic submission) | `scripts/store/release.mjs` |
| **J Handoff** | One list for the human: passwords, agreements, the one-time Play first-release rollout | below |

**Human checkpoints — the only times the pipeline stops:**
1. Permanent identifiers (bundle ID, app name) — confirmed in intake, never re-asked.
2. Anything that accepts terms on the user's behalf (IARC, Developer Program Policies, Paid Apps).
3. Passwords, 2FA, logins — the pipeline never types a password; `REVIEW_DEMO_PASSWORD` is
   typed by the human into their own shell if they want `asc-fill` to set it.
4. The final Submit for review — unless the owner has asked for automatic submission, recorded
   as `"autoSubmit": true` in store-config; then `release.mjs` submits when (and only when) the
   submit-stage preflight is fully green. Google's one-time rule still applies to a brand-new
   app: the first AAB is uploaded and the first release rolled out in Play Console by hand.

**Credentials** (env only, never in repo or config): `ASC_KEY_ID`, `ASC_ISSUER_ID`,
`ASC_KEY_FILE`, `PLAY_KEY_FILE`. Keys already on this machine for other apps in the same team
usually work across apps — ask the human before using them (agents with a permission guard
may block reading key files until the human allows it).

**Machine constraints** (laptops with little free RAM/disk — see Environment notes): one simulator/emulator at a time,
never alongside a build; check free disk first; exFAT project drives must build from an APFS copy.

---

## First: pick a mode (staged wizard)
Ask the user up front:
- **Interactive (default)** — at each stage, present **options** (do it / skip / I already did this / explain more) and wait. Confirm before anything irreversible or outward-facing (purchases, submits, uploads).
- **Autonomous** — run straight through, stopping ONLY for things you genuinely can't do: entering passwords/2FA, paying fees, identity verification, final "submit to review" confirmation. Announce each stage as you go.

Then find the user's position on the roadmap and start at the right stage (don't redo done work):

```
0 Accounts ─▶ 1 Detect ─▶ 2 Requirements ─▶ 3 Build ─▶ 4 Test ─▶ 5 Screenshots ─▶ 6 Store content ─▶ 7 Production
```

> **Consoles change.** The reference docs are a June-2026 baseline; the **screenshot and
> graphic-asset specs in `scripts/requirements/*.md` were re-verified 2026-07-25** and three
> values had drifted (iPhone 6.9" is 1260 × 2736 not 1320 × 2868; iPad 11" is 1488 × 2266;
> Play wants min 4 tablet shots at 1080–7680px). Everything else is still baseline. Before
> quoting any fee, threshold, pixel size, or button label, fetch the official page
> linked in the doc and reconcile. Tell the user if something drifted — and when you find
> drift, **write the correction back into the reference doc** so the next run starts right.

---

## Stage 0 — Accounts & app registration
Read `SKILL_DIR/account-setup.md`. **Ask first: "Do you have an Apple Developer and/or Google Play account?"**
- **No** → guide enrollment. State cost plainly: **Apple 99 USD/year**, **Google 25 USD one-time**. Branch **Individual vs Organization** (orgs need a **D-U-N-S** number; Google org is mandatory for finance/health/VPN/gov apps). Apple needs **2FA**.
- **Yes** → guide app registration (Apple: register Bundle ID → create App Store Connect record; Google: Create app → package name → Play App Signing).
- **Flag the two big blockers early:**
  - Google **personal** account created after 2023-11-13 → **mandatory closed test, 12 testers / 14 continuous days** before production. An **Organization** account skips this.
  - Orgs: D-U-N-S can take days (Apple) to ~30 days (Google) — start it now.

**App ID registration traps** (details in `scripts/requirements/appstore.md` §B.3):
- **Description** is an internal label. ASCII only — no `@ & * "`, no em dashes.
- **Bundle ID is permanent.** Explicit, reverse-domain, matching `app.json` exactly.
- **Tick no capabilities by default.** Background location is NOT an App ID capability —
  it's the `UIBackgroundModes` Info.plist key. Camera/location/photos need no entitlement.
- EAS projects can skip this stage: `eas build -p ios` registers the App ID itself.

**If the app requests background location, say so at Stage 0, not Stage 6.** It is usually
the single biggest review risk (bigger than screenshots or metadata): Google requires a
written declaration **plus a demo video** of the in-app disclosure, and workforce/employee
tracking draws extra stalkerware scrutiny on both stores. The app must show a plain-language
disclosure *before* the OS prompt and stay usable if the user declines. That is code work —
surface it while there is still time to build it.

**Options to offer:** [Enroll now · I have an account · Explain individual vs org · Skip — app already registered]

---

## Stage 1 — Detect the project
```
bash SKILL_DIR/scripts/detect.sh <project-dir>
```
Parse the `KEY=VALUE` output (TYPE, BUILD_TOOL, APP_NAME, VERSION, IOS_APP_ID, AND_APP_ID, SUPPORTS_TABLET, EAS submit creds). If anything's blank or `TYPE=unknown`, read app.json / Info.plist / build.gradle / pubspec.yaml yourself — **you are the detector; the script is a fast first pass.**

---

## Stage 2 — Requirements

### 2a. Profile the app from its CODE first — read `scripts/requirements/app-profile.md`

`detect.sh` finds the build tool. It does **not** tell you what kind of app this is, and the
declarations differ enormously: a workforce-tracking app with background location, wage
advances and ID scanning fills in a completely different set from a note-taking app. Getting
these wrong is the main cause of rejection.

Do **not** ask the user "does your app use location / collect photos / handle money?" — they
will answer from memory and be wrong, because a library declared it or a half-built feature
still ships the permission. Grep the manifest and the source, then derive the answers and
cite the file that proves each one.

> ⚠️ **The single highest-value check: is every declared permission reachable from live code?**
> Trace each sensitive permission to a screen that is actually registered in the navigator.
> A permission declared but unreachable is worse than absent — Play demands a demo video of a
> flow that doesn't exist, and Apple reviewers hunt for a feature that isn't there. Verified
> 2026-08-04: an app declared background location whose only caller lived on a screen the
> navigator had superseded; caught at the "provide a video link" step, after review notes had
> already told Apple to open it.

`app-profile.md` has the greps, a table mapping each finding to the declarations it triggers,
the full background-location checklist, and a marketing-site cross-check (a "free" claim whose
headline feature is paid is a Guideline 2.3.1 problem).

### 2b. Then write REQUIREMENTS.md
Read `SKILL_DIR/scripts/requirements/appstore.md` + `playstore.md`. Write `<project-dir>/store-assets/REQUIREMENTS.md`: pre-fill detected values, list what the user must still provide (description, keywords, privacy URL, demo login, feature graphic…), split **APPLE** / **GOOGLE**, with exact screenshot pixel sizes. Surface blanks now so they can gather them while builds run.

**Sizes change — verify live.** Those pixel sizes are a baseline. Fetch Apple's screenshot-specifications page + Google's graphic-asset specs (URLs at the top of each requirements doc) and reconcile before locking a size set. `devices.sh` (Stage 5) already targets the **largest current device** per class — the robust default, since Apple scales down from the biggest.

---

## Stage 3 — Build
Read `SKILL_DIR/build-submit.md` for exact commands per `BUILD_TOOL`. Three build purposes:
- **Local native dev build** (test the real app on a local simulator/emulator — "install the native app", "don't use Expo Go"): `npx expo run:ios` / `run:android`. Builds the project's own `.app`/`.apk` with local Xcode/Android SDK, installs, launches. First build ~8–15 min (compiles all Pods). See build-submit.md → *Local native dev build* for the Expo Go vs native vs EAS table.
- **Test/preview build** (installing on devices + screenshots, no local toolchain): EAS `--profile preview` (sim/internal), or `xcrun simctl install` / `adb install`.
- **Production build** (store upload): EAS `--profile production` → `.ipa` / `.aab`.

> **Red-screen on launch at a reanimated import (`Exception in HostFunction`)?** It's a `babel-preset-expo` major mismatch with the installed Expo SDK. Fix: `npx expo install --fix` then restart with `--clear`. Full diagnosis in build-submit.md.

**Options:** [Build native for a local sim · Build production now · Build preview for testing first · I already have a build · Explain EAS profiles]

> Confirm before kicking a production build if the user is on metered EAS minutes. EAS builds run in the cloud (~10–25 min); poll or wait for the link.

---

## Stage 4 — Test
Read `SKILL_DIR/testing-release.md` (testing tracks for both stores).
- **iOS → TestFlight:** upload build → Internal Testing (no review) → add testers by email.
- **Android → closed/internal test:** internal testing (≤100 testers, clears in hours). **First AAB upload to a track is what unlocks the App content / policy sections in Play Console** — do this before expecting those menus.
- **Branch:** Google **personal** account → must complete the **12-tester / 14-day** closed test before production is available. **Org** account → testing is optional; can go straight to production.

**Options:** [Set up TestFlight · Set up Play closed test · Skip — going straight to production (org only) · Explain the 12/14 rule]

---

## Stage 5 — Screenshots

**5a. Ensure the virtual devices exist (auto).** The required set is the largest current iPhone (6.9" class — `devices.sh` targets iPhone 17 Pro Max) + iPad Pro 13" for iOS, and a phone + 10" tablet for Android. **Also capture a 6.5" set (iPhone 14 Plus, 1284 × 2778).** The spec page says 6.9" scales down to cover 6.5"; real app records seen 2026-08-03 and 2026-08-05 exposed a **6.5"-only slot that rejects 6.9" pixels**, so the "largest is enough" rule is not safe on its own. The second pass is nearly free — reuse the installed `.app` via `simctl get_app_container` + `simctl install`; see `requirements/appstore.md` §A.1. Run:
```
bash SKILL_DIR/scripts/devices.sh list      # show required vs existing
bash SKILL_DIR/scripts/devices.sh ensure    # create any missing (reuses suitable existing AVDs/sims first)
```
It prints ready-made `IOS_SIMS=…` / `AND_AVDS=…` lines — copy them straight into `.capture.env`. If Android has **no system image**, it prints the one-line `sdkmanager` command to install one (a multi-GB download — get user consent before running it in interactive mode).

**5b. Capture.** The app must be **installed** on each device (from Stage 3: `eas build --profile preview` then `xcrun simctl install` / `adb install`). Write the per-app Maestro flow (`<project>/store-assets/flow.yaml`, start from `SKILL_DIR/flows/example.yaml`, use `tapOn:"Label"` not coordinates, inject `${USER}`/`${PASS}`), write `<project>/store-assets/.capture.env`, then:
```
bash SKILL_DIR/scripts/capture.sh <project-dir> all      # or ios | android
```
Saves to `<project>/store-assets/{ios,android}/<label>/NN_*.png`. Verify dims (`file *.png`). Boots ONE device at a time, shuts each down.

> **Maestro failing on the Android emulator?** (every selector "not found", driver startup timeout, ANR popups, garbled typing, stuck on splash, or no network) — that's a slow/starved emulator, not your flow. Read **`android-screenshots-fallback.md`** and switch to the uiautomator + ADBKeyboard + screencap + fixed-coords recipe. It also covers the emulator-DNS/IPv6 fix, the `pm clear`→splash-hang trap, and the landscape-tablet fullscreen-IME workaround. iOS sims are reliable with Maestro; this is an Android-emulator-only fallback. Capture the **largest** device per class (Apple scales down); for Play, the same tablet set fills both 7" and 10" slots.

**Options:** [Capture all · iOS only · Android only · I'll provide my own screenshots]

> **Declaration demo VIDEO (Play background-location etc.) — same rig, one extra trick**
> (battle-tested 2026-08-04): run `xcrun simctl io <udid> recordVideo --codec h264 out.mp4`
> in the background while a paced Maestro flow drives the REAL flow (point metro/the build at
> the PRODUCTION API and sign in with the actual store demo login — reviewers compare against
> the declaration text). Maestro has no sleep step; pace holds with
> `extendedWaitUntil: {visible: "zz-never", timeout: 5000, optional: true}`. Expect ~20–35s of
> dead recording at the head (Maestro driver init) — find where action starts
> (`ffmpeg -ss N -frames:v 1`) and trim: `ffmpeg -ss <cut> -i in.mp4 -c:v libx264 -crf 18 out.mp4`.
> Upload unlisted to YouTube; one video satisfies both the background-location and
> foreground-service prompts.

---

## Stage 6 — Store content (gates publishing)
> **White-label / per-client builds?** Keep a private companion pack (a separate skill or doc outside this repo) with the constants that carry across every client build: account of record, demo-tenant reviewer logins, UGC + Data-safety answers, pricing/IAP stance, the reviewer note. Use it for the values; use the steps below for the mechanics. Never put client credentials in this skill.
>
> **Login-only B2B / multi-tenant SaaS?** High risk of a first-submission **Guideline 3.2** rejection (Apple assumes an internal one-org tool). Pre-empt in App Review notes + supply a non-expiring demo login. Payment must stay **outside** the app (no IAP). Full playbook in `account-setup.md` → "Guideline 3.2" + "B2B SaaS payment model".
> The other first-submission risk for these apps is **Guideline 4.2 (minimum functionality)**:
> a login wall in front of read-only lists from the web product was rejected in Oct 2026. Ship
> real native features in 1.0 (push, biometric unlock, quick actions, offline) and name them at
> the top of the review notes. See `rejection-catalogue.md` E5.
>
> **Phone-OTP / SMS login? The demo account is a CODE change, not a form field.** Reviewers
> cannot receive the user's SMS, so "demo phone + we'll text you a code" is unreviewable and
> is rejected on both stores. The backend must provision a demo number whose OTP is **fixed
> and always valid** (and seeded with realistic data so every screen has content). Raise this
> at Stage 0 — it needs server work and a production deploy, so it is on the critical path,
> not a Stage 6 checkbox. Same applies to email-magic-link and 2FA-gated logins.
>
> **Reviewers use the PRODUCTION backend.** If the API host isn't live and serving HTTPS, the
> app fails review no matter how complete the metadata is. When the backend or its DNS is
> still pending, say plainly that builds can be prepared but submission must wait — don't let
> the user burn a rejection (and Apple's review queue) on an unreachable API.
>
> **Privacy Policy URL must be crawler-readable.** If the marketing/legal site is a client-rendered SPA (React/Vue/Next-CSR/etc.), the privacy route serves an **empty shell** to store crawlers with JS off → Google rejects with *"Privacy Policy link does not lead to the Privacy Policy page"* (and Apple can flag it too). **Always verify:** `curl -sL <privacy-url> | grep -i "<a distinctive phrase from the policy>"` — if nothing returns, the page is JS-only. Fix by pre-rendering it to **static HTML** (e.g. generate `public/legal/<slug>/index.html` from the policy source) or serving a plain `.html` page, then point the store field at that URL. Note trailing-slash: a static `…/privacy/index.html` is canonical at `…/privacy/` (the no-slash form 302/308-redirects) — give the store the trailing-slash form to avoid redirect-sensitive checks.

From REQUIREMENTS.md, complete in each console (these BLOCK release):
- **Apple:** Age Rating, App Privacy + privacy-policy URL, Export compliance, demo account/review notes, screenshots upload, description/keywords/support URL, (Paid Apps: agreement+tax+banking).
- **Google:** Main store listing (icon 512², feature graphic 1024×500, screenshots), App access (demo login), Ads, Content rating (IARC), Target audience, Data safety, Privacy policy, Gov/Financial declarations.

---

## Stage 7 — Production release & submit
Read the production section of `SKILL_DIR/testing-release.md`.
- **iOS:** attach processed build to the version → complete all sections → **Add for Review → Submit**. EAS: `eas submit -p ios --latest`.
- **Android:** **Production → Create release** → upload/promote `.aab` → release notes → countries → **review & roll out** (staged rollout optional). EAS: `eas submit -p android --latest` (needs the Play service-account JSON; first AAB often must be uploaded manually once).
- **CONFIRM with the user before submitting** (outward-facing, starts review). Review: Apple ~24–72h, Google ~3–7 days for new apps.

**Options:** [Submit to review now · Staged rollout % · Hold — not ready · Promote from testing track]

### 7b. API-driven submission — skip the consoles entirely (battle-tested 2026-08-04)

Both stores are fully scriptable with zero npm deps; `SKILL_DIR/scripts/store/` is the working
implementation (`lib.mjs` has the ES256/RS256 JWT signing, DER→raw conversion and the Play edit
lifecycle; `release.mjs` chains them). Use those rather than rewriting.

- **iOS (App Store Connect API, needs only the ASC .p8 key):** create `appStoreVersions` →
  PATCH newest `VALID` build onto it → PATCH `whatsNew` per localization → POST
  `reviewSubmissions` + `reviewSubmissionItems` + PATCH `submitted:true`. That last PATCH IS
  the "Submit for review" button — gate it behind explicit confirmation.
- **Android (androidpublisher v3, needs a service-account JSON):** POST edit → upload bundle →
  PUT track with release + notes → `:validate` (free dry-run) or `:commit`.
  **Draft-app rule:** a never-published app rejects `status:"completed"` with *"Only releases
  with status draft may be created on draft app"* — use `status:"draft"`; the first real
  rollout happens once in the console, then `completed` works forever.
- **Play service account — the setup is the trap, not the API.** Two things killed a
  real attempt: (1) every pre-2024 guide routes through Play Console's REMOVED "API access"
  linking page — the current flow is just *invite the SA email under Users and permissions*
  like a human teammate; (2) Google Workspace orgs enforce
  `iam.disableServiceAccountKeyCreation` by default (Secure-by-Default), so the JSON-key
  button fails with no explanation. **Fix: create the SA in a personal-gmail GCP project** —
  no org, no policy; Play never links to the project, it only sees the invited email. Enable
  androidpublisher API in that project. Account-level release permissions cover every current
  and future app with one invite. Expect 5–10 min permission propagation ("caller does not
  have permission" right after invite = wait, don't redo).
- **What stays console-only on Play:** permission-declaration forms + demo-video link (persist
  per app after first submission) and the first-ever AAB upload for a brand-new app.
- **Verify version numbers from the store's response, not your filename** — EAS
  `autoIncrement` burns a versionCode on FAILED builds too, so the artifact you download may
  be N+1 from what you expect.

---

## Environment notes (macOS, verified on real launches)
- Screenshot driver is **Maestro** (`~/.maestro/bin/maestro`), NOT idb (idb broken on Python 3.14). One flow drives iOS sims + Android emulators.
- First iOS Maestro run compiles its XCUITest driver (~2–3 min once); `capture.sh` sets `MAESTRO_DRIVER_STARTUP_TIMEOUT=300000`.
- Build ONE device at a time; script shuts each down. Kill stray `qemu-system` / Simulator if a run aborts.
- EAS = cloud builds, no local Xcode/Android Studio needed. Build numbers via `autoIncrement` / `appVersionSource: remote`.
- **`error: exportArchive Copy failed` / "Error packaging up the application"** on an iOS export (local `eas build --local`, fastlane gym, `xcodebuild -exportArchive`): Homebrew's rsync 3.x is ahead of `/usr/bin/rsync` in PATH and Xcode's export breaks on it. The archive itself is fine. Rerun with `PATH="/usr/bin:$PATH"` (check with `which -a rsync`).
- **EAS free plan out of cloud builds**: `eas build --local` uses the same remote/local credentials and needs no credits (Android SDK + JDK 17 for Android; Xcode + fastlane for iOS).
- **exFAT project drives** (external SSDs formatted for Mac + Windows): macOS writes `._*` AppleDouble files beside every file a build creates — CocoaPods reads them as podspecs, Gradle's instrumentation/dex steps crash on them. Build from an APFS copy (`rsync -a --exclude node_modules --exclude ios --exclude android --exclude '._*'` into the scratchpad, `pnpm install --frozen-lockfile` hardlinks from the store). Android emulator images can't live on exFAT either (the snapshot lock hangs forever).
- **Disk**: an emulator needs ~7.4 GB free on the internal disk regardless of `-partition-size`; a Release iOS build ~3 GB DerivedData. Check `df -h /private/tmp` first; ask before clearing caches (`~/.gradle/caches`, CocoaPods, npm).
- **`/tmp` (and most agents' scratch folders) is wiped on reboot** — keep built `.apk`/`.ipa` and helper APKs somewhere durable (e.g. the project's gitignored `.cache/`).
- **Maestro 2.10**: `takeScreenshot` refuses paths outside its own run directory — pass a relative `OUT` and copy from `~/.maestro/tests/<run>/…/takeScreenshot/`. iOS: the "Save Password?" prompt appears late after sign-in (wait up to 8 s, tap "Not Now"); on iPad it's a system dialog Maestro can't read — tap by point. Tiles expose one accessibility label ("Name, Status, …"), not child text — match on that. `hideKeyboard` is unreliable; submit with `pressKey: Enter`. Fresh-booted sims drop keystrokes — sleep 30 s after boot and wrap sign-in in a retry that asserts the typed email.
- **Maestro on Android emulators** often never starts its driver → use the adb recipe (`android-screenshots-fallback.md`): `am start -n <pkg>/.MainActivity` (monkey is unreliable), uiautomator only lists on-screen nodes (swipe to reach below-the-fold buttons), Android reports text-transformed labels in caps, screencap PNGs are RGBA (flatten for Play), System UI demo mode for a 9:41 status bar. Size AVDs for Play's 9:16 (phone 1080×1920 @420; tablet 1440×2560 @280 so the dp width clears the app's tablet breakpoint).
- **Clean status bars**: iOS `xcrun simctl status_bar <udid> override --time 9:41 --batteryState charged --batteryLevel 100`; Android `am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0941` (after `settings put global sysui_demo_allowed 1`).
- **Postgres after a reboot**: postgresql@16 and @17 race for port 5432; a stale `postmaster.pid` pointing at a reused PID blocks one of them. Check which DB actually holds the data before "fixing" anything.

## Safety
- Confirm before purchases, `eas submit`, store uploads, or "Submit to review" — all outward-facing/irreversible.
- NEVER store real production passwords in `.capture.env` — use demo accounts; `store-assets/` is gitignored.
- Don't reset or regenerate any credentials without explicit user approval.
