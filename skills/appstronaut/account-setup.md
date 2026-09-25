# Stage 0 — Developer accounts & app registration (from zero)

> **Consoles change. VERIFY LIVE before quoting fees/steps to the user.** Fees, thresholds, and button labels below were accurate **June 2026** (sources at bottom). Before walking a user through, the agent should fetch the relevant official page (linked) and reconcile — treat this doc as a baseline, not gospel. Flag anything that drifted.

Decide first: **does the user already have a developer account?**
- **No account** → Path A (enroll), then Path B (register app).
- **Has account** → skip to Path B.
Ask which store(s): Apple, Google, or both.

---

## APPLE — App Store

### A. Enroll (no account yet)
1. **Apple Account + 2FA** (required). Create at `account.apple.com`; turn on two-factor auth (trusted phone + device). 2FA is mandatory for the Developer Program.
2. **Apple Developer Program — $99 USD/year** (local currency).
   - **Individual / sole proprietor:** seller = your legal name. No D-U-N-S. Enroll via the **Apple Developer iPhone app** (Account → Enroll) or web; pay immediately; usually active <24h.
   - **Organization:** seller = legal entity name. Needs a **D-U-N-S Number** (free, via Apple's D-U-N-S lookup; allow up to ~5 business days + 2 for Apple), a real legal entity (no DBAs), work email on the org domain, a live website, and enroller with binding authority. Enroll on **web**; pay **only after** Apple verifies (days to ~2 weeks).
   - **India:** enrollment is **app-only** (individual or org).
   - Fee waivers exist for nonprofits / education / government.

### B. Register the app (have account)
Role needed: Account Holder / Admin / App Manager.
1. **Bundle ID** — developer.apple.com → **Certificates, Identifiers & Profiles** → **Identifiers** → **+** → **App IDs** → **App**. Enter description + explicit reverse-DNS Bundle ID (e.g. `com.acme.ops`), enable needed Capabilities → Register. **Must match the build; cannot change after first upload.**
2. **App record** — **App Store Connect** → **Apps** → **+** → **New App**: Platform, Name (≤30 chars, unique), Primary Language, Bundle ID, SKU (internal, permanent). Create → status "Prepare for Submission".
3. **Agreements/Business** — Free apps: Free agreement is automatic, **no banking/tax needed**. Paid/IAP: Account Holder signs **Paid Apps** agreement + completes **tax** (US form for all) + **banking**.
4. **Then** build → upload (Xcode/Transporter/EAS) → first build processes 15–60 min.

### Compliance gates (before submit)
Age Rating questionnaire (2025 revision adds 13+/16+/18+ on iOS 26+) · **App Privacy** data answers + privacy-policy URL · **Export compliance** (`ITSAppUsesNonExemptEncryption=false` in Info.plist if HTTPS-only) · **demo account** (non-expiring login + steps) in App Review Information.

### ⚠ Guideline 3.2 — B2B / multi-tenant SaaS (very common first-submission rejection)
If the app is **login-only with no public in-app signup** (org resolves the account, staff are
invited), Apple frequently rejects the **first** submission under **3.2.0 Business** assuming it's
an *internal tool for one organization* → "use custom/unlisted distribution, not the public App
Store." This is **overturnable** for genuinely open multi-tenant SaaS. **Pre-empt it** — don't wait
for the rejection:
- In **App Review Information → Notes**, state up front: open multi-tenant platform, ANY business can
  sign up (give the web signup URL), each is a separate tenant, comparable to Slack/Salesforce/SAP.
  Answer Apple's 5 standard questions proactively (single-org? / limited group? / public features /
  how accounts are obtained / who pays).
- Provide a **non-expiring demo account with full access** (a login wall with no way in is also a
  separate **2.1** rejection).
- **Fallback if pushed:** Unlisted app (public link, unsearchable) or Custom App via Apple Business
  Manager — but the open-SaaS argument usually wins; don't switch unless forced.

### ⚠ B2B SaaS payment model (3.1.1 In-App Purchase)
Selling access to a B2B SaaS to **organizations** does NOT require Apple IAP **as long as nothing is
sold inside the app**. The safe model (Slack/Salesforce): app is **free to download**, end users pay
nothing in-app, the org pays a **web/sales subscription off the App Store**. Hard rules: **no
purchase / paywall / "subscribe" / "upgrade" / pricing-with-buy-button inside the iOS app**, and
don't link out to a purchase page from a buy context (3.1.3). "Charge first, then grant access" is
fine for the *business* — just keep all of it outside the app and hand reviewers a demo login.

**Review:** Apple cites "90% < 24h"; real new-app first submissions ~24–72h. Top rejection: 2.1 completeness (crashes, missing demo login, dead links), 5.1.1 privacy (no policy / no account deletion).

---

## GOOGLE — Play Store

### A. Register (no account yet)
1. **Google Account + 2-Step Verification**, then `play.google.com/console/signup`, accept the Distribution Agreement.
2. **One-time $25 fee** (not annual). No prepaid cards.
3. **Account type — Personal vs Organization** (hard to change later):
   - **Organization:** **D-U-N-S Number required** (mandatory). Org name + address must **exactly match** the Dun & Bradstreet record or verification fails. D-U-N-S can take up to ~30 days — start early. Org is **mandatory** for finance/health/VPN/government apps.
   - **Personal:** legal name + address from a Google Payments profile; may need gov ID + card in your legal name.
4. **Identity verification** — verify email + phone (OTP), keep operational. Plan **1–4 weeks** end-to-end for a new org (D-U-N-S is the long pole).

### ⚠ New personal-account testing requirement
Personal accounts **created after 2023-11-13** must run a **closed test: ≥12 testers opted-in ≥14 continuous days** before applying for production (was 20, lowered to 12 on 2024-12-11). Does NOT apply to organizations or older accounts. Keep all 12+ enrolled the whole window or the clock resets. Then Dashboard → **Apply for production** (3 sections) → ~7-day review.

### B. Create the app (have account)
1. Play Console → **Create app**: name (≤30), default language, app/game, free/paid (free→paid can't change after publish), accept policy + export declarations.
2. **Package name** (e.g. `com.acme.ops`) is fixed in the `.aab` and **permanent** once uploaded.
3. **Play App Signing** — enroll (Google holds the signing key, recommended) at first release.

### App content gates (block release until done)
Main store listing (icon 512², feature graphic 1024×500, screenshots ≥2) · **App access** (demo login or "no restrictions") · Ads declaration · **Content rating** (IARC questionnaire) · Target audience · **Data safety** form (mandatory, must match behavior) · **Privacy policy URL** · Government/Financial declarations if applicable.

### Release
**`.aab` mandatory** (no APK for new apps). Tracks: **internal** (≤100 testers, clears in hours) → **closed** → **open** → **production**. Add release notes, countries, pricing (paid needs merchant profile).

**Review:** new apps / new accounts ~3–7 days; internal builds in hours; established-account updates often <24h. Top rejections: bad Data safety form, missing demo login, no privacy URL, unjustified permissions, D-U-N-S/identity mismatch.

---

## Sources (verify live — consoles drift)
- Apple enrollment: https://developer.apple.com/help/account/membership/program-enrollment/
- Apple D-U-N-S: https://developer.apple.com/help/account/membership/D-U-N-S/
- Apple create app: https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/
- Apple age rating: https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/
- Apple review: https://developer.apple.com/distribute/app-review/
- Google get started: https://support.google.com/googleplay/android-developer/answer/6112435
- Google account type: https://support.google.com/googleplay/android-developer/answer/13634885
- Google testing requirement: https://support.google.com/googleplay/android-developer/answer/14151465
- Google release: https://support.google.com/googleplay/android-developer/answer/9859348
- Google D-U-N-S policy: https://android-developers.googleblog.com/2023/07/boosting-trust-and-transparency-in-google-play.html
