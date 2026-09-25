# Intake — ask everything once, then run unattended

The pipeline asks the human **one round of questions at the start** and never again, except
at the fixed human checkpoints (passwords, agreements, 2FA, final Submit — see SKILL.md).
Every answer lands in `<project>/store-assets/store-config.json`; every later stage reads that
file. Answers that can be derived from the code (permissions, SDKs, data collected, tablet
support) are **derived, not asked** — Stage 2's profile fills them in.

## Before asking: pre-fill from the repo

Run `bash SKILL_DIR/scripts/detect.sh <app-dir>` and read `app.json` / `package.json`, the
marketing site config, and any existing `store-assets/`. Pre-fill every question you can and
show the human your guess as the first (Recommended) option. If an earlier store-config.json
exists, only ask about blanks.

## The questions (three batches of up to 4)

Claude Code: `AskUserQuestion`, one call per batch. Other agents: their question tool if they have
one, otherwise post each batch as a numbered list with the recommended answer first and wait.

**Call 1 — identity (permanent choices first)**
1. **App name** — the exact store title on both stores. Default: `expo.name`. Warn that a
   keyword suffix ("Name: tagline") is the owner's choice, not ours.
2. **Bundle ID / package** — permanent on both stores. Offer the reverse of their domain
   (`in.<product>.app`) as Recommended.
3. **Countries** — all countries / home country only / a list.
4. **Accounts** — which Apple Developer + Play Console accounts (organisation or personal;
   personal Play accounts after 2023-11-13 trigger the 12-tester / 14-day rule).

**Call 2 — public contact and URLs**
5. **Support email** — must be an inbox of *this* product (another product's inbox is a 1.5 risk).
6. **Website domain** — the site hosting `/`, `/support/`, `/privacy/`, `/delete-account/`.
   If not live yet: record it, and the pipeline blocks submission (not setup) until it is.
7. **Review contact** — real first/last name + phone for Apple's App Review contact.
8. **Production API base URL** — what the store build talks to (HTTPS).

**Call 3 — business facts the code can't tell you**
9. **Who uses the app** — the public / a company's own staff / many companies' staff (B2B
   SaaS) / children. Drives 3.2 notes, target audience, Families.
10. **Money** — none / paid outside the app to organisations (3.1.3(c)) / in-person service
    (3.1.3(e)) / digital content (IAP required).
11. **Reviewer login** — the email(s) of the store reviewer account(s) on production, and how
    they are seeded. The **password is never recorded** — the human types it at Stage 9.
12. **Anything to never show** — real client / person names that must not appear in listings,
    screenshots or demo data (`forbiddenNames`).

Also collect (no question needed if already in the repo): listing copy files, the demo-data
seed command, screenshot device sets, category.

## store-config.json

Keep it in the app repo (it holds no secrets). Credentials are env-only:
`ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_FILE`, `PLAY_KEY_FILE`, `REVIEW_DEMO_PASSWORD`.

```jsonc
{
  "app": {
    "name": "Acme Ops",                // exact store title, both stores
    "bundleId": "com.acme.ops",         // = Android package
    "version": "1.0.0",                // = app.json expo.version; ASC version string is set to this
    "appDir": "app",                    // Expo project folder, relative to the repo root
    "tablet": true                      // derived: supportsTablet / tablet layout exists
  },
  "availability": { "countries": "all" },          // or alpha-3 codes: ["IND", "USA", ...] (Play console takes names)
  "urls": {
    "marketing": "https://acme.example/",
    "support": "https://acme.example/support/",
    "privacy": "https://acme.example/privacy/",
    "privacyChoices": "https://acme.example/delete-account/",
    "accountDeletion": "https://acme.example/delete-account/",
    "api": "https://api.acme.example"
  },
  "contact": {
    "email": "support@acme.example",
    "firstName": "", "lastName": "", "phone": "+1…"   // Apple App Review contact
  },
  "audience": "b2b-staff",               // public | own-staff | b2b-staff | children
  "money": "enterprise-outside-app",      // none | enterprise-outside-app | in-person-service | iap
  "forbiddenNames": ["Real Client Ltd"],  // never in listings, screenshots, demo data
  "reviewer": {
    "logins": [
      { "role": "Supervisor (full access)", "user": "supervisor@demo.acme.example" },
      { "role": "Operator", "user": "operator@demo.acme.example" }
    ],
    "notesFile": "listing/reviewer-notes.md"        // "## Apple …" and "## Google Play …" sections
  },
  "apple": {
    "appId": "1234567890",               // filled once the record exists (browser step)
    "sku": "ACME-OPS-IOS-001",
    "primaryLocale": "en-GB",
    "listingFile": "listing/apple.md",    // "## Subtitle", "## Promotional text", "## Description", "## Keywords" fenced blocks
    "primaryCategory": "BUSINESS",
    "secondaryCategory": "PRODUCTIVITY",
    "contentRights": "DOES_NOT_USE_THIRD_PARTY_CONTENT",
    "copyright": "© 2026 Acme Software Ltd",
    "releaseType": "MANUAL",
    "ageRating": {},                      // overrides; every other question answered NONE / false
    "screenshots": {                      // ASC display type → folder of 01_*.png … (upload order)
      "APP_IPHONE_67": "ios/iphone-6.9",
      "APP_IPHONE_65": "ios/iphone-6.5",
      "APP_IPAD_PRO_3GEN_129": "ios/ipad-13"
    }
  },
  "play": {
    "appId": "4970000000000000000",  // Play developer-console app id
    "defaultLanguage": "en-IN",
    "listingFile": "listing/google.md",   // "## Short description", "## Full description" fenced blocks
    "category": "BUSINESS",
    "icon": "play-icon-512.png",
    "featureGraphic": "feature-graphic-1024x500.png",
    "screenshots": {
      "phoneScreenshots": "android/phone",
      "sevenInchScreenshots": "android/tablet",
      "tenInchScreenshots": "android/tablet"
    }
  },
  "declarations": {                       // derived at Stage 2, confirmed by the human once
    "dataTypes": ["name", "email", "userId", "otherUserContent"],
    "tracking": false, "ads": false, "advertisingId": false,
    "ugc": false, "financialFeatures": false, "health": false,
    "accountDeletion": "request-route"   // in-app | request-route
  }
}
```

Paths inside `apple` / `play` / `reviewer` are relative to the folder holding store-config.json.
