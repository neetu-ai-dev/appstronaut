# Testing & Production Release (both stores)

> June-2026 baseline. Verify live (consoles drift). Numbers like the 12-tester rule change — re-check the linked pages.

The normal path is **test track → production**, never straight to production for a first release (and Google *forces* it for personal accounts).

---

## APPLE — TestFlight → App Store

### Testing (TestFlight)
1. Upload a build (EAS `eas submit -p ios --latest`, or Xcode/Transporter). It appears in **App Store Connect → TestFlight** after ~5–30 min processing + an export-compliance answer.
2. **Internal Testing** — add up to 100 **Users** (team members with an ASC role). **No App Review** needed. Instant. Best for first checks.
3. **External Testing** — up to 10,000 testers by email/public link, but the **first external build needs a quick Beta App Review** (hours–a day).
4. Testers install the **TestFlight** app → accept invite → install your app.

### Production (App Store)
1. On the app's **version page**, attach the processed **Build**.
2. Complete all gates (Stage 6): Age Rating, App Privacy, Export compliance, screenshots, description/keywords, **demo account** in App Review Information.
3. **Add for Review → Submit to App Review.** (EAS only uploads the build; final submit is in ASC or via `eas submit` + manual submit.)
4. Review ~24–72h. On approval choose **automatic** or **manual** release, or **phased release** (7-day gradual rollout to % of users).

---

## GOOGLE — Testing tracks → Production

### Tracks (promote upward)
| Track | Audience | Review | Use |
|---|---|---|---|
| Internal testing | ≤100 testers (email list) | minutes–hours | first upload, fast iteration |
| Closed testing | chosen testers / groups | yes | the **12-tester / 14-day** requirement runs here |
| Open testing | public opt-in | yes | wider beta |
| Production | everyone in chosen countries | ~3–7 days (new) | live |

### ⚠ Gotchas that trip everyone
- **The first `.aab` uploaded to ANY track is what UNLOCKS the "App content" / policy sections** in the Play Console sidebar. If those menus are missing, upload an AAB to Internal testing first.
- **Personal account (created after 2023-11-13):** must run a **closed test with ≥12 testers opted-in for ≥14 continuous days**, then **Dashboard → Apply for production** (3 sections) → ~7-day review. Keep all 12 enrolled the whole window or the 14-day clock resets. **Organization accounts are exempt.**
- **EAS Android submit** needs a **Google Play service-account JSON**. The old *Setup → API access* page is **removed (2026)** — now create the SA in **Google Cloud Console** (IAM & Admin → Service Accounts → Manage keys → JSON) and invite its email under **Play Console → Users & permissions**. Workspace orgs may block key creation (`iam.disableServiceAccountKeyCreation`) — create the SA under a personal-Gmail Cloud project instead. The **very first** AAB must still be uploaded manually via the Console UI before the API/`eas submit` works, so the SA is optional until you want to automate.

### Create a release
1. **Testing → Internal/Closed → Create new release** → upload `.aab` (Play App Signing handles signing) → add **release notes** → **Save → Review release → Start rollout**.
2. Add testers (email list or Google Group); share the opt-in link.
3. When ready: **Production → Create new release** → **promote** the tested build (or upload a new `.aab`) → choose **countries** + **staged rollout %** → **review & roll out**.

---

## Build format reminders
- **iOS:** `.ipa`, signed with a Distribution cert + provisioning profile (EAS or Xcode manage these).
- **Android:** **`.aab` mandatory** for new apps (no APK). For sideload-testing only, a `.apk` from `--profile preview` is fine to `adb install`.

## Decision shortcuts
- "Org account, just ship it" → can skip closed testing; still must complete all App content gates + upload one AAB.
- "Personal account, first app" → plan the 12/14 closed test into the timeline (≥2 weeks before production).
- "Just want testers fast" → iOS Internal TestFlight / Android Internal testing — both near-instant, no full review.

## Sources (verify live)
- Apple TestFlight: https://developer.apple.com/help/app-store-connect/test-a-beta-version/overview-of-testflight/
- Apple submit/release: https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/overview-of-submitting-for-review/
- Google testing tracks: https://support.google.com/googleplay/android-developer/answer/9845334
- Google personal-account testing rule: https://support.google.com/googleplay/android-developer/answer/14151465
- Google release rollout: https://support.google.com/googleplay/android-developer/answer/9859348
