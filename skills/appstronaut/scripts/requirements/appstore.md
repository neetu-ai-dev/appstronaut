# Apple App Store — Submission Requirements (App Store Connect)

Everything you must supply to ship an app. Two blocks: **(A) Screenshots/media** and **(B) Text & metadata**. Sizes verified for current App Store Connect (iOS/iPadOS 18 era, Xcode 26).

> **Sizes drift as Apple ships devices.** Before capturing, `WebFetch` the live spec and reconcile with the tables below (fallback): https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications/ — prefer the **largest** current iPhone/iPad; Apple scales down. `devices.sh` auto-picks the newest available models.

---

## A. Screenshots & media

### A.1 iPhone screenshots (REQUIRED)
Apple needs **one set at the largest size**; it auto-scales down to smaller iPhones.
Upload 1–10 per device size. JPEG or PNG, RGB, flattened (no alpha/transparency), 72 dpi.

**Re-verified against the live spec page 2026-07-25.** Corrected values below — the
previous 6.9"/11" figures in this file were stale, so trust this table over memory and
still re-check before a capture run.

| Display class | Device to simulate | Portrait px | Landscape px | Required? |
|---|---|---|---|---|
| 6.9" | iPhone 17 Pro Max / 16 Pro Max | **1260 × 2736 or 1290 × 2796 or 1320 × 2868** | transpose for landscape | one of 6.9/6.5 required |
| 6.5" | iPhone 11 Pro Max / XS Max / 14 Plus | **1284 × 2778** | 2778 × 1284 | one of 6.9/6.5 required |
| 6.3" | iPhone 16 Pro / 15 Pro | 1179 × 2556 | 2556 × 1179 | optional |
| 6.1" | iPhone 14 / 13 | 1170 × 2532 | 2532 × 1170 | optional |
| 5.5" | iPhone 8 Plus | 1242 × 2208 | 2208 × 1242 | legacy/optional |
| 4.7" | iPhone SE | 750 × 1334 | 1334 × 750 | legacy/optional |

> Minimum to pass review: a 6.5" **or** 6.9" set. Supplying the bigger one is enough — ASC scales it.
> Note the 6.9" portrait height (2736) is SHORTER than 6.5" (2778) — do not assume the
> larger display class always means more pixels, and do not "fix" a 1260 × 2736 capture.
>
> ⚠️ **Check for a stretched-phone iPad layout BEFORE capturing iPad shots.** If the app
> declares `TARGETED_DEVICE_FAMILY = "1,2"` but has no tablet adaptation in code (grep for
> `isTablet`, `useWindowDimensions`, breakpoints), the iPad build is one phone layout scaled
> up: full-width rows holding a few words, progress bars stretched ~2000px, a third of the
> screen empty below the content, a phone tab bar spanning the full width. Reviewers flag
> that dead space. Raise it with the user early and offer: drop iPad (`"1"`), constrain
> content to a centred max-width (~700), or design real tablet layouts. Do not judge from
> one screenshot — a stat-tile home screen fills the width and looks fine while list screens
> do not. Same applies to Android tablets, where Play wants ≥4 tablet screenshots.
>
> ⚠️ **Read the sizes off the CONSOLE, not off this doc or the spec page.** Verified
> 2026-08-03: an app record showed only an **iPhone 6.5" Display** slot accepting
> 1242 × 2688 / 1284 × 2778 — it did **not** accept the 6.9" captures the spec page blesses.
> **Hit again 2026-08-05 on an unrelated app record**, so treat it as the norm, not a
> one-off: *"6.5 is required"* is what the console tells users, whatever the spec page says.
> The spec page lists what Apple *supports*; the version's screenshot panel lists what *that
> record* will take. Before capturing anything, have the user open
> **App Store Connect → the version → Screenshots**, read the exact px values in the panel,
> and target those. Re-shooting a whole set because you trusted the docs is a wasted hour.
>
> **Cheapest insurance: capture 6.9" AND 6.5" in the same session.** A second pass costs one
> extra simulator and one flow re-run against an app bundle that is already built —
> `xcrun simctl get_app_container <booted-udid> <bundle-id> app` gives the installed `.app`,
> and `simctl install` puts it on the new device with no rebuild. Recipe:
> ```
> xcrun simctl create iphone-65 com.apple.CoreSimulator.SimDeviceType.iPhone-14-Plus \
>   com.apple.CoreSimulator.SimRuntime.iOS-26-5     # 1284 × 2778 natively
> xcrun simctl boot <new-udid> && xcrun simctl install <new-udid> <path-to.app>
> ```
> iPhone 14 Plus renders **1284 × 2778** natively; iPhone 11 Pro Max / XS Max give
> **1242 × 2688**. Both are legal 6.5" sizes — do not rescale a 6.9" capture into either,
> the aspect ratios differ (0.4602 vs 0.4621) and the squash is visible on text.
>
> **Re-verified 2026-08-03:** the 6.9" class accepts **all three** of 1260 × 2736,
> 1290 × 2796 and 1320 × 2868 — an earlier note here implied 1260 × 2736 was the only
> valid size. The iPhone 17 Pro Max simulator renders 1320 × 2868 natively, which is
> already legal; do not rescale it. Likewise the 13" iPad class accepts 2064 × 2752 or
> 2048 × 2732, and the iPad Pro 13" sim gives 2064 × 2752 natively.

### A.2 iPad screenshots (REQUIRED if app supports iPad)
| Display class | Device to simulate | Portrait px | Landscape px |
|---|---|---|---|
| 13" | iPad Pro 13" (M4) | 2064 × 2752 | 2752 × 2064 |
| 12.9" | iPad Pro 12.9" (older) | 2048 × 2732 | 2732 × 2048 |
| 11" | iPad Pro 11" | **1488 × 2266** | 2266 × 1488 |
| 10.5" | iPad Pro 10.5" | 1668 × 2224 | 2224 × 1668 |
| 9.7" | iPad 9.7" | 1536 × 2048 | 2048 × 1536 |

> Minimum: a 13" (or 12.9") set. 1–10 images.

### A.3 App icon
- 1024 × 1024 px, PNG, RGB, **no alpha, no transparency, no rounded corners** (Apple rounds it).
- Usually pulled from the build's asset catalog; can also be set in ASC.

> **Check this, don't assume it.** Expo/RN project icons are very often saved as RGBA, and
> Apple rejects the 1024² icon for an alpha channel. Read PNG colour-type byte 25:
> `2` = RGB (fine), `6` = RGBA (will be rejected), `3` = palette, `0`/`4` = grey.
> ```bash
> python3 -c "print(open('assets/icon.png','rb').read()[25])"
> ```
> If it returns 6, flatten onto the brand background — never onto default black, which
> ruins any icon with a transparent margin:
> ```python
> from PIL import Image
> src = Image.open('assets/icon.png').convert('RGBA')
> out = Image.new('RGB', (1024, 1024), '#YOURBRANDHEX')   # match adaptiveIcon.backgroundColor
> out.paste(src, (0, 0), src); out.save('store-assets/ios/app-icon-1024.png')
> ```
> Android is the opposite: the Play 512² icon is 32-bit PNG **with** alpha, so don't
> flatten that one. Look at the flattened result before uploading.

### A.4 App preview videos (OPTIONAL)
- Up to 3 per device size. 15–30 s. Same pixel dims as screenshots for that size.
- H.264/HEVC, .mov/.mp4/.m4v.

---

## B. Text & metadata

### B.1 App information (localizable)
| Field | Limit | Notes |
|---|---|---|
| App name | 30 chars | shown under icon |
| Subtitle | 30 chars | one-line summary |
| Promotional text | 170 chars | editable without new build |
| Description | 4000 chars | main marketing copy |
| Keywords | 100 chars | comma-separated, no spaces needed |
| Support URL | URL | required |
| Marketing URL | URL | optional |
| Privacy Policy URL | URL | **required** — must be crawler-readable static HTML, NOT a JS-only SPA route (see note below) |

### B.2 General app data
- **Primary category** + optional secondary category.
- **Age rating**: multi-step questionnaire → rating. **Tiers are 4+ / 9+ / 13+ / 16+ / 18+**
  (verified 2026-08-03 — 12+ and 17+ were retired; "Unrated" exists but cannot ship on the
  App Store). Steps: *In-App Controls* (parental controls, age assurance) → *Capabilities*
  (web access, UGC, social media, messaging, advertising) → *Mature Themes* → *Medical &
  Wellness* → *Sexuality & Nudity* → *Violence* → *Chance-Based Activities*.
  Escalators worth knowing: **social media features → 13+**, **unrestricted web access →
  16+**, **real-money gambling → 18+**, *frequent* (vs infrequent) profanity/horror/violence
  raises the tier, and graphic sexual content or prolonged graphic violence → **Unrated**.
  The old "does your app share precise location with other users?" question no longer
  exists — location is declared in **App Privacy**, not here.
- **Bundle ID** (e.g. com.acme.ops) — must match the build.

### B.3 Registering the App ID (developer.apple.com → Identifiers)
- **Description** is an internal label only — never shown to users, editable later. ASCII
  only: no `@ & * "`, and avoid em dashes. Write "and", not "&".
- **Bundle ID: Explicit**, reverse-domain. **Permanent** — never renameable or reusable
  once used, so match `app.json` / `Info.plist` exactly on the first try.
- **Capabilities: usually tick NOTHING.** Common trap: background location is *not* an App
  ID capability — it is the `UIBackgroundModes` key in Info.plist. Camera, photo library,
  and location need no entitlement at all. Only enable capabilities that genuinely need
  one: Push Notifications, Sign in with Apple, App Groups, HealthKit, Associated Domains.
- You can skip manual registration entirely on EAS projects — `eas build -p ios` registers
  the App ID on first run. Manual and EAS paths converge; don't do both and expect two IDs.
- **SKU** — internal unique string.
- **Version** (e.g. 1.0.0) + **build number**.
- **Copyright** (e.g. "2026 Acme Software Ltd").
- **Contact info** for review (name, phone, email).
- **Demo account** (username + password) if app needs login — REQUIRED for reviewers. Must be **non-expiring** with full access; a login wall with no way in = automatic **2.1** rejection.
- **Review notes** — anything reviewers must know. **For login-only B2B / multi-tenant SaaS:** pre-empt a **Guideline 3.2** rejection here — state it's an open multi-tenant platform any business can sign up for (give the signup URL), comparable to Slack/Salesforce, and that billing is a web subscription with **no in-app purchase**. See `account-setup.md` → "Guideline 3.2" + "B2B SaaS payment model".

### B.3 App Privacy ("nutrition label") — REQUIRED
Filled in ASC under **App Privacy**. Flow, verified 2026-08-03:

1. **Gate question** — "Do you or your third-party partners collect data from this app?"
   Answering **No** publishes a "Data Not Collected" label and ends the flow. Only answer No
   for a genuinely offline app — a label that contradicts the binary's entitlements
   (location, camera, contacts) is a rejection, and a serious one.
2. **Data-type grid** — tick every type collected. Categories: Contact Info · Health &
   Fitness · Financial Info · Location · Sensitive Info · Contacts · User Content ·
   Browsing History · Search History · Identifiers · Purchases · Usage Data · Diagnostics ·
   Surroundings · Body · Other Data.
3. **Per type** — linked to the user? used for tracking? purpose (App Functionality,
   Analytics, Product Personalization, Third-Party Advertising, Developer's Advertising,
   Other).

**Definitions that decide ticks** (quote them back to the user rather than paraphrasing):
- **Payment Info** — "form of payment, payment card number, or bank account number." Carve-out
  only if payment info is entered *outside* your app and the developer never has access. A
  payment handle the user types into your form (UPI ID, wallet ID) **is** collected.
- **Other Financial Info** — "salary, income, assets, debts." Payroll apps always tick this.
- **Sensitive Info** — includes **biometric data**. Check whether face/fingerprint matching
  actually runs *in the app* vs a web console or server; a face *photo* is Photos or Videos,
  a face *template/descriptor* is biometric. Getting this wrong in either direction is bad.
- **Precise vs Coarse Location** — precise = lat/long at ≥3 decimal places. Apps storing raw
  GPS tick Precise; tick Coarse too if `ACCESS_COARSE_LOCATION` is declared.
- **Other Data** — "any other data types not mentioned." The home for domain records with no
  Apple category (attendance/employment records, inventory, case notes).
- **Search History** — only if you *store* what was searched; an unlogged in-app filter box
  is not collection.
- **Tracking** — narrow: linking with third-party data for advertising, or sharing with a
  data broker. First-party analytics is *not* tracking. Answering No everywhere also means
  **no ATT prompt is required**.

**Verify against the code, not the user's memory.** Grep `package.json` for analytics/ads/
crash SDKs (`firebase`, `sentry`, `segment`, `amplitude`, `appsflyer`, `facebook`, …) — if
there are none, Usage Data and Diagnostics are honestly "not collected", which is unusual
and worth stating. Then read the schema for what is actually persisted.

**The optional-disclosure carve-outs rarely apply.** Data is exempt only when collection is
"not part of your app's primary functionality" AND optional per-use AND non-tracking. The
regulated-financial-services carve-out is for institutions operating under a GLBA/GDPR
privacy notice, not any app that touches money.

### B.4 Pricing & availability
- Price tier (or Free).
- Territory availability.

### B.5 Encryption / compliance
- Export-compliance answer (ITSAppUsesNonExemptEncryption in Info.plist or ASC prompt).
- **Content Rights** (App Information, required): one question — "Does your app contain,
  show, or access third-party content?" Answer **No** unless the app displays media you
  licensed from someone else (music, video, books, film clips, another company's marks).
  Open-source fonts/icon sets in your own UI are **not** third-party content for this
  question. Answering Yes makes Apple ask for rights documentation.
- IDFA usage declaration (only if you ship an ad/attribution SDK).

---

## C. Pre-submission checklist
- [ ] 6.9" or 6.5" iPhone screenshots (1–10)
- [ ] 13" iPad screenshots if iPad-supported
- [ ] 1024² icon, no alpha
- [ ] name ≤30, subtitle ≤30, keywords ≤100, description ≤4000
- [ ] Support URL + Privacy Policy URL live
- [ ] Age rating questionnaire done
- [ ] Demo login provided (if auth-gated)
- [ ] App Privacy answered
- [ ] Price + territories set
- [ ] Build uploaded via Xcode/Transporter, attached to version
