# Worked example — a B2B shop-floor app (Sept 2026)

A complete, working screenshot rig for an Expo app with a login, a tab bar and a
supervisor-only tab. Copy the folder into `<project>/store-assets/`, then change:

- `flow.yaml` — the screen labels / accessibility labels you tap, and what each shot shows.
- `capture-android.py` — the same seven steps for the adb driver (Android labels come back
  in caps where the app uses `textTransform: uppercase`).
- `capture-ios.sh` — simulator names per label, and the iPad "Not Now" point for the
  save-password system dialog.
- Both capture scripts ask the API for a record in the right state for shot 5 (a closed record
  with unchecked figures) because demo data is re-seeded relative to "now". Replace with
  whatever state your hero shot needs, or drop it.

Run one device at a time; see the Environment notes in SKILL.md.
