# Rejection catalogue — every cause we have hit or pre-empted, and the check for each

Compiled 2026-09 from real launches of seven production apps: white-label fitness-studio apps,
a B2B logistics app, a field-ops app, an HR / workforce app and a multi-tenant shop-floor app
(Expo / React Native, both stores). `scripts/store/preflight.mjs` automates every row marked
**[auto]**; the rest are judgement checks the pipeline asks you to confirm before submitting.

**Real rejections on record:** fitness app A, Apple 1.0.1: 1.5, 3.2, 2.3.6 UGC (Aug 2026).
Fitness app B, Apple 1.1.0: 5.1.1(ii) (Sep 2026). Logistics app, Apple: 3.2 on first
submission (overturned); Play: "Privacy Policy link does not lead to the Privacy Policy page".
Everything else is a trap we caught before a reviewer did.

The app in brackets in the Store column is where the row was learned: **fitness**,
**logistics**, **workforce** or **shop-floor**.

---

## 1. Listing and metadata

| # | Store / guideline | Failure | Check |
|---|---|---|---|
| M1 | Apple **1.5** | "Support or Privacy URL … not functional" — typed in before the page existed. | **[auto]** every URL in store-config returns 2xx over HTTPS. Never type a URL into a console before it resolves. |
| M2 | Play + Apple 1.5 | Privacy policy covers the website/platform but never the **mobile app**. | **[auto]** rendered HTML contains "app" near "privacy"; human reads the page once. A grep of a JSON payload is not enough. |
| M3 | Play (logistics) | Privacy URL is a client-rendered SPA → crawler sees an empty shell. | **[auto]** `curl -sL <privacy-url>` contains a distinctive phrase from the policy. Pre-render to static HTML if not. Give stores the **trailing-slash** URL (no-slash form redirects). |
| M4 | Apple 5.1.1 | Placeholder / missing policy. | **[auto]** policy page names data collected, a contact, and deletion. |
| M5 | Apple **2.3.6** | Declaration names a feature the build does not ship. | Trace every declaration and listing claim to live code / tenant config, never the roadmap. |
| M6 | Apple 2.3.6 | Copy describes a path that is dead for *this* tenant (WhatsApp login with no sender). | Check tenant config, not the codebase. Never "coming soon". |
| M7 | Apple **4.2.6** | Listing copy shared across white-label clients. | **[auto]** diff description against sibling apps' listings: no shared sentence. Screenshots from *this* build. |
| M8 | Apple **2.3.1** | "Free" claim whose headline feature is paid. | **[auto]** site grep for "free" vs pricing. |
| M9 | Both | Policy silent on ID scanning / biometrics / background location the app collects. | **[auto]** policy mentions every sensitive type the code uses. |
| M10 | Both | Background location only in the policy, not the listing. | Description mentions it. |
| M11 | Apple Medical + Play Health | Client marketing (weight loss, medical claims) leaks into listing. | Keep programmes out; add "what this app does not do". |
| M12 | Play | Tags a reviewer can disprove; tag names that don't exist. | Pick from the fixed vocabulary; one true tag beats five. |
| M13 | Both | Screenshots from a debug build show test credentials / dev overlays. | Capture **Release** builds only. |
| M14 | Kids / Families | Child imagery pulls the app into Kids / Families review. | Interface-only, adult-facing shots. |
| M15 | Both | Real client / member data in listing, screenshots or console. | **[auto]** grep listing + OCR-free check: seed a fictional demo tenant; `forbiddenNames` in store-config. |
| M16 | Review risk | A shot shows an error banner / "No signal" / empty state. | Look at every shot (contact sheet). |
| M17 | Both (shop-floor) | Store title with a keyword suffix ("Name: Tagline") the owner didn't want; Apple and Play titles differ. | Title = `app.name` exactly on both stores unless intake says otherwise. |

## 2. Privacy and data declarations

| # | Store / policy | Failure | Check |
|---|---|---|---|
| P1 | Apple App Privacy | Label contradicts the binary (e.g. "Data Not Collected" with camera/location). | Derive answers from code (Stage 2 profile); cite the file for each. |
| P2 | Play **Data safety** | Doesn't match Apple or the manifest — Play cross-checks. | **[auto]** Apple data types ⊆ Play data types (seen: Apple declared User ID, the Play draft missed User IDs). Per type: collected, not shared, not ephemeral, purpose App functionality (+ Account management for identity). "Required" = user cannot turn it off. |
| P3 | Play Data safety | Layout-shift mis-click ticked **Analytics**. | Screenshot-verify every click; never double-click. |
| P4 | Both | Over/under-declared analytics / crash data. | **[auto]** grep deps for firebase, sentry, segment, amplitude, appsflyer, facebook, bugsnag, datadog, posthog, mixpanel. |
| P5 | Apple Payment Info | In-app UPI / card entry not declared. | grep `upi_id\|bank_account\|ifsc\|card`. Gateway-hosted payment is out of scope. |
| P6 | Both Financial | Salary / wage / payroll not declared. | grep `salary\|wage\|payroll`. |
| P7 | Apple Sensitive (biometric) | Face template vs photo confused. | Check where matching runs; say so in notes. |
| P8 | Apple Location | Precise vs coarse. | ≥3 decimal lat/long = precise. |
| P9 | Apple | Optional-disclosure exemption taken wrongly. | Only for optional, non-primary, non-tracking data. |
| P10 | Apple Tracking / ATT | Mis-declared tracking. | First-party analytics ≠ tracking. |
| P11 | Both sharing | Gov-ID OCR sent to a third party undeclared. | Declare sharing; name the processor. |
| P12 | Play Financial features | Too broad an option. | Narrowest true option. |
| P13 | Play Health apps | Over-ticking medical boxes. | Only what the app actually does. |
| P14 | Play **Advertising ID** | Submit blocked: "Incomplete advertising ID declaration"; SDK merged `AD_ID` silently. | **[auto]** grep merged manifest for `com.google.android.gms.permission.AD_ID`; answer No only when absent. |
| P15 | Apple IDFA | Declared without ad SDK or vice versa. | Only with an ad/attribution SDK. |
| P16 | Apple Content Rights | "Yes" triggers a rights request. | No, unless licensed third-party media. OSS fonts/icons don't count. |
| P17 | Apple Regulated Medical Device | Asked of Health & Fitness apps. | No (unless it is one). |

## 3. Permissions

| # | Store / guideline | Failure | Check |
|---|---|---|---|
| X1 | Both | Permission declared but unreachable (dead screen). Play wants a video of a flow that doesn't exist. | **[auto]** list permissions from app.json + built Info.plist + merged manifest; for each, grep the source for the API that uses it and check the screen is registered in navigation. |
| X2 | Apple **5.1.1(ii)** | A library's default purpose string shipped ("Allow $(PRODUCT_NAME) to access your photos"). | **[auto]** grep `UsageDescription` in the **built** Info.plist; flag `$(PRODUCT_NAME)`, "Allow … to access", strings < 40 chars, or strings without an example. Fix in app.json plugins; needs a new binary. |
| X3 | Apple 5.1.1 | Hardware keys the app never uses (autolinked camera/mic). | **[auto]** each key maps to a call site; `cameraPermission: false` etc. |
| X4 | Apple | `prebuild --clean` regresses strings to `$(PRODUCT_NAME)`. | Keep every string in `app.json ios.infoPlist`; re-check the built plist. |
| X5 | Play background location | Highest-rejection feature. | Disclosure before OS prompt, usable after decline, demo video, ≤500-char justification, mentioned in listing. See `scripts/requirements/app-profile.md` §A. |
| X6 | Play foreground service | `FOREGROUND_SERVICE_LOCATION` needs its own declaration. | "User-initiated location sharing". |
| X7 | Play declaration video | Video doesn't match declaration text. | Record against production with the store demo login. |
| X8 | Play | "Unjustified permissions". | Same as X1. |
| X9 | Apple App ID | Capabilities ticked that aren't needed. | Tick nothing by default. |
| X10 | Play (shop-floor) | Expo template manifest carries `SYSTEM_ALERT_WINDOW`, `READ/WRITE_EXTERNAL_STORAGE`. | **[auto]** merged manifest; block them via `android.blockedPermissions`. |

## 4. Login and reviewer access

| # | Store / guideline | Failure | Check |
|---|---|---|---|
| L1 | Apple **2.1** / Play App access | Login wall with no way in. | Non-expiring full-access demo login in both consoles. |
| L2 | Apple 2.1 | "Unable to sign in with the credentials provided." | **[auto]** log in against the **production** API with the reviewer login right before submitting (`REVIEW_DEMO_PASSWORD` env). Re-seed first. |
| L3 | Both | Notes describe a flow that no longer exists (dead PIN). | Re-read pasted notes against the current login screen. |
| L5 | Both | OTP / SMS / magic-link / 2FA login can't be reviewed. | Fixed, always-valid demo OTP on production (code + deploy — raise at Stage 0). |
| L8 | Both | Production API not live / not HTTPS. | **[auto]** API base URL in the build is HTTPS and answers. **[auto]** no `localhost` / `10.0.2.2` / `http://` in the bundle config. |
| L9 | Apple | Reviewer stuck on a step that looks like a second password. | Explain it in notes. |
| L10 | Play Sign-in details | Expiring / incomplete entries. | One entry per role, permanent, no OTP. |
| L11 | Both | No real review contact. | Real name, phone, email (intake). |
| L12 | Both (shop-floor) | Demo data looks dead — live tiles "No signal", empty "today" figures. | Keep-alive for the demo collector on production; seed relative to "now"; capture during the tenant's daytime. |
| L13 | Apple (shop-floor) | Settings exposes a server-URL field the reviewer might change. | Notes: leave it at the default. |

## 5. Business model and payments

| # | Store / guideline | Failure | Check |
|---|---|---|---|
| B1 | Apple **3.1.1** | Paywall / price / subscribe UI in the iOS app. | **[auto]** grep app source for `subscribe\|upgrade\|pricing\|₹\|\$[0-9]\|buy now\|plan` in UI strings. |
| B2 | Apple 3.1.3 | Link-out to purchase from a buy context. | No pricing links in the app. |
| B3 | Apple **3.1.3(c)/(e)** | "Why isn't this IAP?" | Notes: enterprise service sold to organisations (c) / in-person service (e). |
| B4 | Apple agreements | Paid app without Paid Apps agreement. | Free apps need none. |
| B6 | Play | Free→paid irreversible. | Decide at create. |

## 6. Content and UGC

| # | Store / guideline | Failure | Check |
|---|---|---|---|
| C1 | Apple **2.3.6** | App has UGC but age rating says No. | Intake question + code grep for feeds/chat/comments. |
| C2 | Apple **1.2** | UGC without report, block, terms, moderation. | All four exist and are named in notes. |
| C3 | Apple age rating | Wrong tier. | Walk the questionnaire from the profile. |
| C5 | Play Families | Child band ticked. | 18+ unless the app is genuinely for children. |
| C6 | Play IARC | Required gate; needs Terms of Use acceptance. | **Human OK** before ticking the IARC Terms checkbox (it is an agreement). |

## 7. Build and binary

| # | Store / code | Failure | Check |
|---|---|---|---|
| D1 | Apple ERROR 90725 | Old iOS SDK in the EAS image. | `eas.json` production `ios.image: "latest"`; `xcrun altool --validate-app` before submit. |
| D2 | Apple icon | 1024 icon has alpha. | **[auto]** `sips -g hasAlpha` on the icon = no. Play 512 icon **needs** alpha. |
| D2b | Apple (shop-floor) | **App Store Connect has no icon upload** — the store icon is whatever 1024 AppIcon is inside the build. A stale or default Expo icon in the binary becomes the store icon. | Before uploading, open the build and look: `xcrun assetutil --info <App>.app/Assets.car` lists `AppIcon 1024×1024` for phone + pad; view `<App>.app/AppIcon60x60@2x.png` from the xcarchive. Android: `unzip -p app.aab 'base/res/mipmap-xxxhdpi-v4/ic_launcher.webp'` (the Play 512 listing icon is uploaded separately). |
| D3 | Apple 2.1 crash | Hook after early return crashed fresh installs. | Typecheck + `react-hooks/rules-of-hooks` lint; smoke-test a fresh install. |
| D4 | Crash | Nested duplicate `react`. | **[auto]** `find node_modules -path "*/node_modules/react/package.json"` below the top level → none. |
| D5 | EAS bundle failure | Transitive dep missing / gitignored build output. | `npx expo export --platform android` passes. |
| D10 | Wrong binary | `--auto-submit` to another app's record; env not reaching the cloud builder. | **[auto]** `eas.json` `ascAppId` = store-config `apple.appId`; env in the EAS profile. |
| D12 | Apple export compliance | Prompt every submit. | **[auto]** `ios.config.usesNonExemptEncryption: false` (or `ITSAppUsesNonExemptEncryption`). |
| D13 | Play | APK or unincremented versionCode. | AAB; `autoIncrement`. |
| D14 | Apple (shop-floor) | Store version string "1.0" vs build "1.0.0" — build won't attach. | **[auto]** ASC version string = app.json `version` (asc-fill sets it). |
| D15 | Quality (shop-floor) | Instanced static fonts all share one PostScript name → iOS renders every weight the same. | **[auto]** name-ID 6 unique per bundled font file. |
| D16 | Quality (shop-floor) | API response shape ≠ client expectation → blank figures in screenshots and in production. | Look at the contact sheet; figures must not be "—". |

## 8. Screenshots and assets

| # | Store | Failure | Check |
|---|---|---|---|
| S1 | Apple | 6.5" slot rejects 6.9" pixels. | Capture both natively (iPhone 17 Pro Max 1320×2868, iPhone 14 Plus 1284×2778). Never rescale. |
| S2 | Apple | Stretched phone layout on iPad. | Real tablet layout, or `supportsTablet: false`. |
| S3 | Play tablet quality | Tablet renders the phone layout (breakpoint above the AVD's dp width). | AVD dp width ≥ app tablet breakpoint (1440 px @ 280 dpi = 823 dp). |
| S4 | Play | 7" and 10" are separate slots, ≥4 shots each, 9:16 or 16:9. | One 1440×2560 (or 1080×1920) set fills both. |
| S5 | Play | Phone 2–8 shots, 9:16, longest ≤ 2× shortest, **no alpha**, ≤8 MB; feature graphic 1024×500 no alpha; icon 512² with alpha ≤1 MB. | **[auto]** dimensions, aspect, alpha, size. `adb screencap` writes RGBA — flatten. |
| S6 | Apple | Wrong sizes. | **[auto]** 6.9: 1260×2736 / 1290×2796 / 1320×2868; 6.5: 1284×2778 / 1242×2688; iPad 13: 2064×2752 / 2048×2732. |
| S7 | Quality | Skeletons, IME overlay, ANR, splash, real clock, notification icons. | Contact sheet review; iOS `simctl status_bar override`; Android System UI demo mode. |
| S8 | Both (shop-floor) | Screenshots uploaded in the wrong order — dragging several files at once into App Store Connect shuffled them (shot 5 landed first). The first 2–3 shots are what search results show. | Upload via API (`asc-fill --screenshots`, `play-fill --images` keep file order 01→07), or after a drag-and-drop re-check the order in the console and drag to fix. |
| S9 | Apple | Capturing a 6.9" set nobody uses, or skipping the 6.5" slot the record actually shows. | Fill the slot the version page shows (often only **6.5" Display**; Apple scales it for larger iPhones). A 6.9" set only matters if "View All Sizes in Media Manager" asks for it. Capture both only when unsure — it costs one extra simulator pass. 1–10 shots per device on Apple, 2–8 on Play; 5–7 covering each main screen once is the sweet spot. |

## 9. B2B and enterprise

| # | Store / guideline | Failure | Check |
|---|---|---|---|
| E1 | Apple **3.2** (fitness) | Reviewer got the owner/staff login → "internal business tool". | Consumer apps: member login first. |
| E2 | Apple **3.2** (logistics) | Login-only B2B app read as one company's internal tool. | Notes: commercial multi-tenant product, many organisations, who uses it, no IAP. Fallback: Unlisted / Custom App. |
| E3 | Apple 4.2.6 | Publishing on clients' behalf. | Say so in notes + distinct copy. |
| E4 | Play identity | D-U-N-S mismatch. | Exact legal name/address. |

## 10. Account deletion

| # | Store / guideline | Failure | Check |
|---|---|---|---|
| A1 | Apple **5.1.1(v)** | No deletion route (apps that create accounts). | In-app route + web URL; admin-provisioned B2B: request route, and never claim automatic erasure that doesn't exist. |
| A2 | Both | Delete URL not live / not crawlable. | **[auto]** `curl -sL <delete-url>` contains "delete". |
| A3 | Play | "Users can request deletion" = Yes with a URL. | Match reality. |

---

## Submission mechanics that block or waste time (not rejections)

**Apple**
- **App record creation and App Privacy are not in the public API** — browser only.
- **App Review Information** (sign-in, notes, contact) in the web UI only appears inside "Add for Review", which needs a build. The API (`appStoreReviewDetails`) sets it on the version without a build — use `asc-fill.mjs`.
- ASC ignores programmatically-set values in the web UI: focus + one real key. Version field drops characters on fast typing.
- App ID description: ASCII only.
- Withdrawn version → 409: rename the editable entry.
- Builds can never be deleted from a record — check `ascAppId` before `--auto-submit`.
- `eas submit` hangs silently on Apple refusals — `altool --validate-app` first.
- The ASC API `PATCH reviewSubmissions {submitted:true}` **is** the Submit button.
- "Automatically release" was found selected — set `releaseType: MANUAL`.

**Google Play**
- **Draft-app rule:** a never-published app only accepts `status: draft` releases.
- App **creation**, category, privacy URL, Ads, IARC, target audience, App access, Advertising ID, government/financial/health and country selection are **console only**.
- **Hidden chain:** Sign-in details (App access) → Target audience → Data safety final Save.
- Main store listing: normal **Save** is blocked until icon, feature graphic and screenshots exist — "Save as draft" (or fill images via the API).
- Play Console pages freeze under memory pressure (Chrome renderer "wedged"): restart Chrome, close other tabs.
- Modals swallow the first click; deep links `/app-content`, `/tags`, `/tracks/production` bounce.
- `eas submit` leaves Google's placeholder release notes.
- Service account: invite the SA email under Users and permissions (the API-access page is gone); Workspace orgs block key creation — create the SA in a personal GCP project; permissions take 5–10 min.
- Personal accounts created after 2023-11-13 need a 12-tester / 14-day closed test. Organisation accounts don't.

**Keys, quotas, signing (Sept 2026)**
- **Play service account on a draft app** needs the app-level **"Edit and delete draft apps"** permission
  on top of release + store-presence ones — without it every edit fails at `:validate` with "The caller
  does not have permission" even though reads work. Account-level permissions cover only published
  apps. Grant per app: Users and permissions → the SA → App permissions → Add app → 7 boxes (view app
  info, edit draft apps, release to production, release to testing, manage testing tracks, manage store
  presence, manage policy declarations). Propagation can take from minutes to hours.
- **EAS free build quota** runs out mid-month ("You've reached your included build credits"). A failed
  attempt still creates remote credentials (Android keystore) — keep them. Fall back to
  `eas build --local` (Android worked first time).
- **Local iOS signing with two same-named distribution certs**: if the login keychain holds an
  "Apple Distribution: <Team>" cert that differs from the one in EAS's profile, `eas build --local`
  fails with *"Provisioning profile … doesn't include signing certificate"* (Xcode matches by name).
  Don't create another cert (Apple allows only 2–3 per team, shared by every app). Instead create an
  `IOS_APP_STORE` profile for the **Mac's** cert via the ASC API (`POST /v1/profiles`), install it in
  `~/Library/MobileDevice/Provisioning Profiles/<uuid>.mobileprovision`, set manual signing on the app
  target only (not Pods) and `xcodebuild archive` + `-exportArchive` with `method: app-store-connect`.
  Compare certs: `security find-certificate -c "Apple Distribution: …" -p | openssl x509 -noout -serial`.
- **Placeholders in reviewer notes**: notes files are written with `<OPERATOR_EMAIL>` / `<PASSWORD — entered by human>`
  placeholders and an instruction line at the top meant for the human. Before notes go into a console, strip
  the instruction line and replace every `<…>` placeholder (refuse to upload while any remain). Lead with the
  login that sits in the Sign-in fields.
- **Reviewer notes pasted into the wrong store**: Apple's App Review notes ended up with the 461-char
  Play "App access" text. Apple needs its own section (the 3.2 / who-uses-it defence).
  Check with an API read (`appStoreReviewDetail.notes` length) after the human fills the form.
- **Screenshot order** can be fixed after the fact: `PATCH /v1/appScreenshotSets/{id}/relationships/appScreenshots`
  with the screenshot ids in the wanted order.

**Browser automation (Claude in Chrome)**
- File upload can be blocked by the extension ("needs a desktop-app update") → upload images via the store APIs, or hand the human a drag list.
- Agreement / Terms checkboxes (IARC, Developer Program Policies) are the human's call — ask first.

## Verify live before trusting (these drift)

Fees, thresholds, pixel sizes, button labels (WebFetch the official pages); the app record's own
screenshot slots; Google's closed-test numbers and the account type; Apple age-rating questions;
the EAS image vs Apple's minimum SDK; the Play service-account flow; tenant feature flags; demo
credentials on production; listing URLs; production API; every console field after saving; the
generated Info.plist after every native dependency change.
