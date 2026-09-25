# Google Play Store — Submission Requirements (Play Console)

Two blocks: **(A) Graphics/screenshots** and **(B) Text & metadata + release data**. Sizes verified for current Play Console.

> **Specs drift.** Before capturing, `WebFetch` the live graphic-asset spec and reconcile with below (fallback): https://support.google.com/googleplay/android-developer/answer/9866151

---

## A. Graphics & screenshots

**Re-verified against the live spec page 2026-07-25.** The tablet numbers in this file
were stale (they said 320–3840 and framed tablets as conditional); corrected below.

### A.1 Phone screenshots (REQUIRED)
- **Minimum 2**, up to 8. JPEG or 24-bit PNG, **no alpha**, ≤ 8 MB each.
- Each side: **320 px – 3840 px**.
- Max dimension ≤ **2×** the min dimension (so no extreme aspect).
- **Recommended 1080 × 1920** (portrait).

### A.2 Tablet screenshots — TWO SEPARATE REQUIRED SLOTS

**Verified against the live console 2026-08-04.** The Play Console shows **7-inch** and
**10-inch** as two distinct required uploads, not one combined "tablet" item. Their pixel
ranges differ:

| Slot | Min count | Each side | Aspect |
|---|---|---|---|
| 7-inch tablet | **4** | **320 – 3,840 px** | 16:9 or 9:16 |
| 10-inch tablet | **4** | **1,080 – 7,680 px** | 16:9 or 9:16 |

JPEG or 24-bit PNG, no alpha, ≤ 8 MB each, up to 8 per slot.

**Use 1080 × 1920 for both.** It is ≥320 and ≥1,080 on both sides and is exactly 9:16, so a
single capture run fills both slots. Produce two folders (`tablet7/`, `tablet10/`) with the
same files — a folder named per slot is what stops the user hunting mid-upload.

> ⚠️ **Do not use 1200 × 1920 or 1600 × 2560** (both were recommended here previously).
> They are 1:1.6, **not** 16:9 or 9:16, and violate the aspect rule on the same page that
> states it.

> ⚠️ **Capture on a tablet-density AVD, not a phone one.** 1080 × 1920 at ~213 dpi (tvdpi)
> shows the content density a real 10-inch tablet does; the same pixels at 420 dpi is just a
> big phone. Set `hw.lcd.density=213` in the AVD's `config.ini`.

> ⚠️ **A 1440 × 2560 tablet AVD may be unusable on a laptop.** With software GPU it starved
> SystemUI into repeated "isn't responding" ANRs that blocked every Maestro run. 1080 × 1920
> with `hw.ramSize=3072` booted and captured cleanly, and satisfies both slots anyway.

### A.3 App icon (REQUIRED)
- **512 × 512 px**, 32-bit PNG with alpha.
- ≤ 1 MB.

### A.4 Feature graphic (REQUIRED)
- **1024 × 500 px**, PNG or JPEG, no alpha.
- Shown at top of listing; required even if no promo video.

### A.5 Promo video (OPTIONAL)
- A YouTube URL (not a file upload).

---

## B. Text & metadata

### B.1 Store listing (localizable)
| Field | Limit | Notes |
|---|---|---|
| App name / Title | 30 chars | |
| Short description | 80 chars | shown first, above the fold |
| Full description | 4000 chars | main copy |

### B.2 Categorization & contact
- **App category** (Apps vs Games) + category type.
- **Tags** (up to ~5).
- **Contact details**: email (required), phone + website (optional).
- **External marketing** opt-in (optional).

### B.3 Store settings
- **App / package name** (e.g. com.acme.ops) — permanent once published.
- **Default language**.

---

## C. App content / policy declarations (REQUIRED — gates publishing)
All under **Policy → App content** in Play Console:
- **Privacy Policy URL** (required). ⚠️ Must be a **static, crawler-readable** page — the policy text must be present in the raw HTML with **JavaScript disabled**. A client-rendered **SPA route** (React/Vue/etc.) serves an empty shell to Google's bot → the rejection *"Privacy Policy link does not lead to the Privacy Policy page."* Verify with `curl -sL <url> | grep -i "data we collect"` (or similar) — if no policy text comes back, pre-render it to static HTML (or use a plain `.html` page) before submitting. Same risk on Apple. See SKILL.md Stage 6.
- **Ads** — does the app contain ads?
- **App access** — if login-gated, provide **demo credentials/instructions** for reviewers.
- **Content rating** — IARC questionnaire → rating.
- **Target audience & content** (age groups, designed-for-families?).
- **Data safety** form — what data collected/shared, encryption in transit, deletion. (Play's equivalent of Apple privacy label.)
- **Government apps / Financial / Health** declarations if applicable.
- **News app** declaration if applicable.
- **Ads / COVID / etc.** as prompted.

## D. Release data
- **Signed app bundle (.aab)** — App Bundle required for new apps (not .apk).
- **App signing** — enroll in Play App Signing.
- **versionCode** (int, must increment) + **versionName** (string).
- **Release track**: internal / closed / open testing / production.
- **Release notes** per language.
- **Countries/regions** availability.
- **Pricing** (free/paid).

---

## E. Pre-submission checklist
- [ ] 2–8 phone screenshots (≥320px/side, ≤2× ratio, rec. 1080×1920)
- [ ] 7" + 10" tablet screenshots if targeting tablets
- [ ] 512² icon PNG (alpha ok)
- [ ] 1024×500 feature graphic
- [ ] title ≤30, short ≤80, full ≤4000
- [ ] Privacy Policy URL live
- [ ] Data safety form complete
- [ ] Content rating questionnaire done
- [ ] App access demo login (if auth-gated)
- [ ] Target audience set
- [ ] Signed .aab uploaded, versionCode incremented
- [ ] Countries + pricing set
