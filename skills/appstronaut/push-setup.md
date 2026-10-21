# Push notifications and App ID capabilities

Run before the first store build of an app that sends push (expo-notifications, FCM, APNs) or
opens links from its website (associated domains / app links). Verified on Railintel,
2026-10-21. About 15 minutes; the human's part is two Terminal menus and one sign-in.

## What it needs

| Piece | Where it ends up | Who |
|---|---|---|
| App ID capabilities: Push Notifications, Associated Domains | Apple Developer → Identifiers | `apple-capabilities.mjs` |
| New App Store provisioning profile (Apple invalidates the old one when capabilities change) | local signing folder, or EAS remote on next build | `apple-capabilities.mjs --profile-out` |
| APNs push key (.p8) | EAS → iOS credentials → Push Key | human: `eas credentials -p ios` |
| Firebase project + Android app | Firebase console | browser (agent or human) |
| `google-services.json` | app root, `android.googleServicesFile` in app.json | browser download, then move into the app |
| FCM V1 service-account key | `~/Projects/Operations/credentials/google/<app>-fcm-service-account.json` and EAS | `fcm-key.sh`, then human: `eas credentials -p android` |
| `/.well-known/apple-app-site-association` and `assetlinks.json` served as JSON | the website | the web deploy |

## Order

1. **Apple** (no sign-in; uses the ASC team key):
   ```
   node scripts/store/apple-capabilities.mjs --bundle <bundle id>                       # look
   node scripts/store/apple-capabilities.mjs --bundle <bundle id> --apply \
        --profile-out <app>/.credentials/appstore.mobileprovision                       # do it
   ```
   Check the result: `security cms -D -i <profile> | plutil -extract Entitlements.aps-environment raw -o - -`
   prints `production`. Drop `--profile-out` when EAS manages credentials remotely.
2. **Firebase project** (console.firebase.google.com, signed in as the org account):
   - Add project, name = the app name. Untick Google Developer Program, Gemini and
     Google Analytics. Push does not need them, and Analytics would have to be declared
     in the privacy labels.
   - Add an Android app with the package name. Download `google-services.json` and move it
     into the app. Set `"googleServicesFile": "./google-services.json"` under `expo.android`.
   - It is public client config, so committing it is fine.
3. **FCM key**: `scripts/store/fcm-key.sh <project id> <app name>` (needs `gcloud auth login`
   once). The console's "Generate new private key" fails in a Workspace org; the script works
   around that for one project and restores the policy.
4. **EAS uploads.** These are interactive; the human runs them in Terminal:
   - `npx eas-cli credentials -p android`. Choose **production**, then **Google Service Account**,
     then **Manage your Google Service Account Key for Push Notifications (FCM V1)**, then
     **Set up a Google Service Account Key…**, then **[Upload a new service account key]**.
     When asked for the path, give the key from step 3.
   - `npx eas-cli credentials -p ios`. Choose **production**, then Team type
     **Company/Organization**, then enter the Team ID. If it opens the build-credentials menu,
     choose **Go back**. Then **Push Notifications: Manage your Apple Push Notifications Key**,
     then **Set up your project to use Push Notifications**.
     - An APNs key is team-wide. If the team already has one from another app, EAS reuses it
       and no Apple sign-in is needed. Otherwise it asks for the Apple ID and 2FA and creates one.
5. **Rebuild** the dev or store build. A build made before `google-services.json` and the new
   profile can't receive push. Then send one test alert to each platform.

## Gotchas (each one cost time on Railintel)

- **Agent permissions.**
  - In Claude Code auto mode, every Apple account change, key download and key move is
    refused, even after the owner says yes in chat.
  - Before starting, have the owner leave auto mode (each action becomes a one-click approval),
    or plan for them to run the scripts in Terminal.
  - The `!` shell shortcut does not work in the VS Code panel; use the Terminal app.
- **Browser tool.** Chrome downloads may not happen, and the tab group can reset mid-flow.
  Prefer the API and gcloud paths above; keep the browser for the Firebase project wizard.
- **Answering `eas credentials` from a script** with `expect` works but is fragile:
  - The menus take `\033[B` in some places and `\033OB` in others.
  - Keys sent while a menu is still loading are lost.
  - Inside a Tcl `proc`, add `global spawn_id`.
  - Two human Terminal runs are faster.
- **Associated domains** need the website to serve
  `/.well-known/apple-app-site-association` (no extension, JSON). A single-page app's catch-all
  returns `index.html` with a 200, which looks fine and isn't.
  Check: `curl -s https://<site>/.well-known/apple-app-site-association | head -c 40`.
- Never put the `.p8`, the FCM key or `dist.p12` in the repo. Keep them in
  `~/Projects/Operations/credentials` or the app's ignored `.credentials/` signing folder.
