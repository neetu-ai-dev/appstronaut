# AGENTS.md

This repo is **appstronaut**, an agent skill that ships mobile apps to the App Store and Google
Play. The skill itself is `skills/appstronaut/SKILL.md`. Read it and follow it when the user
wants to publish an app, prepare store screenshots or listings, or fix a store rejection.

- Install for all agents: `./install.sh` (links into `~/.claude/skills` and `~/.agents/skills`).
- Tool names in the skill map to your own tools: see "Works in any agent" in SKILL.md.
- Host: macOS. Store scripts need Node 18+ and no npm install.

Working on the repo itself:
- Never add client names, app/team/cert IDs, real emails or local paths. Examples use
  "Acme Ops", `com.acme.ops`, `acme.example`.
- New rejection lessons go in `skills/appstronaut/rejection-catalogue.md` (one row: guideline,
  what failed, the check that catches it).
- Commits carry the human author only, with no AI co-author trailer.
