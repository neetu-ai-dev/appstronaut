# Profile the app from its code — do this BEFORE writing REQUIREMENTS.md

Store requirements are not one-size-fits-all. A note-taking app and a workforce-tracking app
fill in wildly different declarations, and the wrong ones get you rejected. `detect.sh` finds
the *build tool*; this finds the *app*.

**Run these greps, then generate declaration guidance from what you actually find.** Do not
ask the user "does your app use location?" — they will say no and be wrong, because a library
declared it. Read the manifest and the code.

---

## Step 0 — the check that matters most

> ### ⚠️ Every declared permission must be reachable from a live code path.
>
> This is the single highest-value check in this document. A permission declared in the
> manifest but never requested by reachable code is worse than not having it:
> - Play demands a **written declaration plus a demo video** for sensitive permissions. You
>   cannot film a flow that doesn't exist.
> - Apple reviewers look for the feature. Not finding it is a rejection.
> - You end up writing review notes pointing at a screen that isn't in the navigator.

For each sensitive permission in the manifest, trace it to a screen the user can reach:

```sh
# 1. what is declared
grep -oE '"(android\.permission\.)?[A-Z_]+"' app.json | sort -u
grep -oE 'NS[A-Za-z]+UsageDescription|UIBackgroundModes' -A2 ios/*/Info.plist

# 2. what actually requests it
grep -rn "requestForegroundPermissions\|requestBackgroundPermissions\|startLocationUpdates\|Camera\|MediaLibrary\|Notifications" src/

# 3. THE STEP EVERYONE SKIPS — is that screen in the navigator?
grep -rn "ScreenName" src/nav.tsx || echo "❌ UNREACHABLE — dead code"
```

**Real case (2026-08-04):** an app declared `ACCESS_BACKGROUND_LOCATION`,
`FOREGROUND_SERVICE_LOCATION` and `UIBackgroundModes:[location]`. The only caller of
`startBackgroundShift` was `MyWorkScreen`, which `nav.tsx` had superseded and never
registered. A disclosure screen had been *built* for it and was equally unreachable. Caught
only at the "provide a video link" step, after review notes had already been written telling
Apple reviewers to open that screen.

Two honest exits — surface both:
1. **Remove the permissions.** Fastest, and correct if the feature genuinely isn't shipping.
2. **Wire the feature up.** Correct if it's a real selling point (check the marketing site).

---

## Step 1 — detect the app's character

| Grep | If found, it implies |
|---|---|
| `ACCESS_BACKGROUND_LOCATION`, `UIBackgroundModes.*location` | **Play: declaration + demo video.** Apple: prominent disclosure before the OS prompt. The highest-rejection-rate feature there is. See §A |
| `FOREGROUND_SERVICE_LOCATION` | Play: a *separate* foreground-service declaration on top of the location one |
| `Camera`, `ImagePicker`, `MediaLibrary` | Photos/Camera in both privacy forms; purpose strings on iOS |
| face/biometric descriptors, `face_desc`, embeddings | **Apple "Sensitive Info"** (biometric). Check whether matching runs *in the app* or server/web-side — a face *photo* is Photos, a face *template* is biometric |
| `advance`, `loan`, `EWA`, `repay`, `installment` | **Play → Financial features.** Tick the narrowest true option (e.g. *Earned wage advances*, not *Personal loan direct lender*) if the app only *records* what an employer pays. Expect a specialist reviewer |
| `upi_id`, `bank_account`, `ifsc`, `card` | Payment Info in both privacy forms — even if you never process a payment |
| `salary`, `wage`, `payroll` | "Other financial info" (Apple) / "Other financial info" (Play) |
| Aadhaar/PAN/SSN/passport OCR, ID scanning | Government-ID collection. If images go to a third-party API, that is **third-party sharing** and both the privacy policy and the store declarations must name every processor |
| No `firebase`/`sentry`/`segment`/`amplitude`/`appsflyer` in `package.json` | Usage Data, Diagnostics, Crash Data are honestly **"not collected"** — unusual, worth stating explicitly so the user doesn't over-declare |
| Login screen with no public signup path | **Apple Guideline 3.2** risk — see `account-setup.md`. Check whether signup really is open (can any phone/email create a tenant?) — if so, say so in review notes and invite the reviewer to try it. That single fact is the strongest 3.2 defence |
| OTP / magic-link / SSO-only login | A demo account is a **code change**, not a form field — the backend needs a fixed-code carve-out. Raise at Stage 0 |
| `supportsTablet: true` / `TARGETED_DEVICE_FAMILY = "1,2"` with no `useWindowDimensions`/breakpoints | Ships a stretched phone layout to tablets. iPad screenshots become mandatory *and* show the problem. Offer: drop tablet support, constrain max-width, or design real layouts |
| In-app purchase / subscribe / pricing UI | Apple 3.1.1. B2B SaaS sold outside the app is fine — but no paywall, price or buy-button may appear *inside* the app |

---

## Step 2 — derive the answers, don't ask for them

Generate the actual per-field answers from what you found, and cite the file that proves each
one. Users misremember their own apps; the code doesn't.

Worked example (workforce attendance + payroll app):

| Field | Answer | Evidence |
|---|---|---|
| Precise Location | Collected, linked, not tracking | `attendance.lat/lng` in schema |
| Photos | Collected, linked | selfie punch in `CheckInScreen` |
| Payment Info | Collected | `staff.upi_id` written from `StaffFormScreen` |
| Other Financial Info | Collected | `wage`, `loans`, `advance_requests` |
| Sensitive Info (biometric) | **Not** collected | face matching is web-only — comment in `KioskScreen.tsx` |
| Usage Data / Diagnostics | **Not** collected | no analytics SDK in `package.json` |
| Tracking | **No**, everywhere | no ad/attribution SDK; no data broker |

---

## §A — background location, the full checklist

If background location survives Step 0, all of this is required:

1. **A disclosure screen that appears BEFORE the OS permission prompt**, in plain language,
   stating what is collected, when, who sees it, and that declining is fine. The app must
   stay usable after declining.
2. **It must be reachable.** See Step 0.
3. **A demo video** (unlisted YouTube) showing: sign in → navigate to the control → the
   disclosure appears → decline → app still works. A human at Google watches it.
4. **A written justification** naming **one** feature and explaining *why foreground-only
   would not work*. Vague answers ("to track attendance") get rejected; concrete constraints
   ("a delivery driver cannot keep the app open for a six-hour shift") pass. Play caps this
   at **500 characters** — draft to the limit.
5. **Foreground-service declaration** if `FOREGROUND_SERVICE_LOCATION` is declared. For a
   user-flipped switch, the right option is **User-initiated location sharing**, not
   "Background location updates".
6. **Listing text** should mention it too — both stores expect background-location use
   disclosed in the description, not only the privacy policy.

Employee/workforce tracking draws extra **stalkerware scrutiny**. Emphasise: staff-initiated,
optional, employer-scoped, stops when the shift ends, never sold or shared.

---

## Step 3 — sanity-check the marketing site against the app

Cheap, and catches real problems:

```sh
curl -sL https://<site>/ | grep -oiE "free[^<]{0,60}"
curl -sL https://<site>/pricing | grep -oE '₹[0-9,]+|\$[0-9]+|/forever'
curl -sL https://<site>/privacy | grep -ci "background location\|selfie\|biometric"
```

Look for:
- **A "free" claim whose headline feature is paid.** Found exactly this: the hero said "FREE
  UP TO 10 STAFF" while selfie+GPS — the thing the whole listing advertises — was on the paid
  tier. That is a Guideline 2.3.1 metadata problem *and* a one-star-review generator.
- **A privacy policy that doesn't mention what the app collects.** If the app does ID scanning
  or biometrics and the policy is silent, that gap is a rejection on both stores.
- **Store metadata URLs that don't resolve.** `curl -o /dev/null -w '%{http_code}'` every URL
  going into the listing.
