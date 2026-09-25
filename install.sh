#!/usr/bin/env bash
# Install appstronaut for every coding agent on this Mac.
#   ./install.sh            user-level: ~/.claude/skills + ~/.agents/skills
#   ./install.sh --project  this project only: ./.claude/skills + ./.agents/skills
#   ./install.sh --copy     copy instead of symlink (default symlinks, so `git pull` updates it)
#
# ~/.claude/skills  → Claude Code (VS Code Copilot also reads it)
# ~/.agents/skills  → Codex CLI, Cursor, Gemini CLI, GitHub Copilot
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)/skills/appstronaut"
[[ -f "$SRC/SKILL.md" ]] || { echo "run this from the appstronaut repo" >&2; exit 1; }

BASE="$HOME"; MODE=link
for a in "$@"; do
  case "$a" in
    --project) BASE="$PWD" ;;
    --copy) MODE=copy ;;
    *) echo "unknown option: $a" >&2; exit 1 ;;
  esac
done

for dir in "$BASE/.claude/skills" "$BASE/.agents/skills"; do
  mkdir -p "$dir"
  dest="$dir/appstronaut"
  if [[ -L "$dest" || -e "$dest" ]]; then
    if [[ -L "$dest" && "$(readlink "$dest")" == "$SRC" ]]; then echo "✓ $dest (already linked)"; continue; fi
    mv "$dest" "$dest.bak.$(date +%s)"; echo "  moved old $dest aside"
  fi
  if [[ "$MODE" == copy ]]; then cp -R "$SRC" "$dest"; else ln -s "$SRC" "$dest"; fi
  echo "✓ $dest"
done

cat <<'EOF'

Installed. Start it from your app's repo:
  Claude Code   /appstronaut   (or: "get this app on both stores")
  Codex CLI     $appstronaut
  Cursor        /appstronaut
  Gemini CLI    ask for it; approve the skill when prompted
  Copilot       ask for it in agent mode
EOF
