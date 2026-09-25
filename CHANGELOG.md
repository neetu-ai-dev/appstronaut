# Changelog

## 1.1.0 — 2026-09-25

- **Works in any coding agent**: Claude Code, Codex CLI, Cursor, Gemini CLI and GitHub Copilot.
  The docs name capabilities (ask the user, fetch a page, drive the browser) and map them to
  each agent's tools.
- `install.sh` links the skill into `~/.claude/skills` and `~/.agents/skills` (`--project`, `--copy`).
- `AGENTS.md` for agents that open the repo itself.
- Shorter skill description, within the Agent Skills 1024-character limit.

## 1.0.0 — 2026-09-25

First public release.

- **Pipeline mode**: one round of intake questions, then the whole run is unattended. It stops
  only for passwords, agreements, 2FA and the final Submit.
- **Store API fillers** (Node 18+, zero dependencies):
  - `asc-fill.mjs` fills App Store Connect: app info, age rating, version, listing, price,
    availability, review details and screenshots.
  - `play-fill.mjs` fills Google Play: details, listing, images and data safety.
  - Both do a dry run by default.
- **`preflight.mjs`**: automated checks from the rejection catalogue. It covers URLs, the
  privacy page, permissions and purpose strings, icon alpha, font names, duplicate React,
  paywall strings, the production API and the reviewer login.
- **`release.mjs`**: one command that runs preflight, uploads the builds, fills both stores,
  attaches the build, and then submits (only if you opt in).
- **Rejection catalogue**: about 90 failure modes from real launches, each with its check.
- **Browser guide** for the console-only parts: creating the app records, App Privacy, and
  Play App content.
- **Screenshot rig**: Maestro for iOS simulators, an adb/uiautomator fallback for Android
  emulators, clean status bars, and a full worked example.

## 0.1.0 — 2026-06

- Project detection, device setup and Maestro screenshot capture for iOS and Android.
- Staged wizard docs for accounts, build, test and release.
