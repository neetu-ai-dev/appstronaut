# Console steps no API reaches — browser

Stage F of the pipeline. Everything else is filled by `asc-fill.mjs` / `play-fill.mjs`; do those
first so the browser work is short. Answers come from `store-config.json` → `declarations`.
Record every answer in `store-assets/CONSOLE-WALKTHROUGH.md` as you go.

## Running the browser part

- Needs a browser the agent can drive, signed in as the human: Claude Code with Chrome
  (`claude --chrome` or `/chrome`), a Playwright / browser MCP server in Codex, Cursor, Gemini
  CLI or Copilot, or any computer-use tool. No browser tool? Hand the human this file and the
  store-config as a click list; every answer below is written so a person can follow it.
- One tab per console; close everything else in that Chrome window. Play Console pages are
  heavy — on a low-RAM Mac the renderer wedges ("every screenshot/read injection times out").
  Recovery: stop, have the human quit the browser completely, reopen, resume from the walkthrough.
  Don't hammer a frozen tab (20 failed attempts taught nothing).
- **File uploads may be blocked** by the browser tool ("needs a desktop-app update"). Never plan
  on browser uploads: images go through `asc-fill --screenshots` / `play-fill --images`, or a
  drag-and-drop list for the human.
- Screenshot-verify every click. Play modals swallow the first click and layout shifts
  mis-tick boxes (once silently ticked Analytics). ASC ignores programmatically-set values —
  real clicks and one real keystroke per field; type version strings one character at a time.
- **Agreement checkboxes are the human's** — IARC Terms of Use, Developer Program Policies, US
  export laws, Paid Apps. Ask ("agree to IARC?"), then tick. Creating a Play app requires two
  standard declarations; the human's go-ahead for "create the app" covers those two only.

## Apple

1. **Register the bundle ID** — `asc-fill --only bundle --apply` does this. Browser fallback:
   developer.apple.com → Identifiers → + → App IDs → App → Explicit, description ASCII only,
   **no capabilities**. Permanent.
2. **Create the app record** (no public API): App Store Connect → Apps → + → New App →
   iOS, name = `app.name`, primary language, bundle ID, SKU, Full Access. Native `<select>`s
   need typeahead + a real click. Record the app id (URL) into store-config `apple.appId`.
3. **App Privacy** (no public API): Privacy Policy URL + User Privacy Choices URL → Get
   Started → "Yes, we collect data" → tick exactly `declarations.dataTypes` (Contact Info:
   Name, Email; Identifiers: User ID; User Content: Other User Content …) → for each: purpose
   App Functionality (identity types also count as account management), **linked to the user:
   yes**, **tracking: no** → re-verify every tick by scrolling back up → Save → **Publish**.
4. Everything else on Apple — categories, content rights, age rating, price, availability,
   version string, listing text, copyright, manual release, review contact + notes + demo
   login, screenshots — is `asc-fill.mjs`. In the web UI, App Review Information only appears
   inside "Add for Review", which needs a build; the API sets it without one.
5. Never click "Add for Review" / "Submit for Review" — that's checkpoint 4.

## Google Play

Order matters — Play's App content is a dependency graph:
`Sign-in details (App access) ──▶ Target audience ──▶ Data safety (final Save)`.

1. **Create app** (no API): name = `app.name`, default language (`play.defaultLanguage`; the
   language dropdown's typeahead mis-selects — scroll and click), App, Free, tick the two
   declarations (human-approved). Record the app id.
2. **Main store listing** — text and graphics are `play-fill.mjs`. If done in the browser: the
   normal Save is blocked until icon, feature graphic and screenshots exist → **Save as draft**.
3. **Store settings** — category (`play.category`), contact email, website. Tags: fixed
   vocabulary; leave empty rather than pick one a reviewer can disprove.
4. **App content**, in order:
   1. Privacy policy URL (`urls.privacy`; Play warns if it can't reach it — a warning, but
      review will fail until the site is live).
   2. Ads → `declarations.ads`.
   3. Content rating (IARC) → category "All other app types", answer from the profile,
      email `contact.email`. **Stops at the IARC Terms checkbox for the human's OK.**
   4. Government apps, Financial features, Health → from declarations.
   5. Advertising ID → `declarations.advertisingId` (mandatory for Android 13+; blocks Submit
      if left unset). Confirm the merged manifest has no `AD_ID` first (preflight P14).
   6. Data safety through step 4, **Save as draft**: collection yes, encrypted in transit yes,
      account creation (admin-provisioned B2B: "My app does not allow users to create an
      account" → "Through employment, or enterprise accounts"), deletion request route,
      data types = the **same set as Apple's App Privacy** (Play cross-checks — a real
      first draft missed User IDs), each: collected, not shared, not ephemeral, required,
      purposes App functionality (+ Account management for identity).
   7. **App access** — human-only (passwords): "All or some functionality is restricted",
      one entry per reviewer login from `reviewer.logins`, instructions from the notes file.
   8. Target audience → unlocks after App access; 18+ unless the app is for children.
   9. Data safety → final Save.
5. **Countries** — Production → Countries/regions → add per `availability.countries`. No
   release needed. Never create or roll out a release here — the first AAB goes up as a
   **draft** (`play-release.mjs --status draft`), and Send for review is checkpoint 4.

## Hand-off list (write it at the bottom of CONSOLE-WALKTHROUGH.md)

Numbered, in order, only what the human must do: agreements awaiting OK, App access
passwords, Target audience + Data safety final save, any images the APIs couldn't upload,
domain/API go-live, reviewer login seeded on production, final Submit on both stores.
