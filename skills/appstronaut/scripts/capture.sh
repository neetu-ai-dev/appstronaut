#!/usr/bin/env bash
# capture.sh — project-aware store screenshot capturer (driven by env or a config file).
# Output goes INTO the project: <PROJECT_DIR>/store-assets/{ios,android}/<label>/NN_*.png
#
# Usage:
#   capture.sh <project-dir> [ios|android|all]
#
# Config via env (the SKILL sets these after detect.sh), or a sourced file
# at <project-dir>/store-assets/.capture.env:
#   IOS_APP_ID, AND_APP_ID            bundle / package of the INSTALLED app
#   IOS_SIMS   "Name::label; Name::label"   (names from `xcrun simctl list devices`)
#   AND_AVDS   "Avd::label; Avd::label"     (names from `emulator -list-avds`)
#   FLOW       path to the Maestro flow yaml
#   DEMO_USER, DEMO_PASS              passed to the flow as ${USER}/${PASS}
set -euo pipefail

PROJECT_DIR="${1:-}"; MODE="${2:-all}"
[[ -z "$PROJECT_DIR" ]] && { echo "usage: capture.sh <project-dir> [ios|android|all]" >&2; exit 1; }
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"
OUTBASE="$PROJECT_DIR/store-assets"
mkdir -p "$OUTBASE"

# optional per-project config
[[ -f "$OUTBASE/.capture.env" ]] && { set -a; . "$OUTBASE/.capture.env"; set +a; }

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
ok()   { printf "\033[32m✓ %s\033[0m\n" "$1"; }
die()  { printf "\033[31m✗ %s\033[0m\n" "$1" >&2; exit 1; }
: "${FLOW:?set FLOW to a Maestro flow yaml}"

MAESTRO_ENV=()
[[ -n "${DEMO_USER:-}" ]] && MAESTRO_ENV+=(-e "USER=$DEMO_USER")
[[ -n "${DEMO_PASS:-}" ]] && MAESTRO_ENV+=(-e "PASS=$DEMO_PASS")

capture_ios() {
  [[ -z "${IOS_SIMS:-}" ]] && { echo "(no IOS_SIMS — skipping iOS)"; return; }
  command -v xcrun >/dev/null || die "xcrun not found (install Xcode)"
  local IFS=';'; read -ra _s <<< "$IOS_SIMS"; unset IFS
  for pair in "${_s[@]}"; do
    pair="$(echo "$pair" | xargs)"; [[ -z "$pair" ]] && continue
    local name="${pair%%::*}" label="${pair##*::}"
    bold ">> iOS  $name  ($label)"
    local udid; udid="$(xcrun simctl list devices available | grep -F "$name (" | head -1 | grep -oE '[0-9A-F-]{36}')"
    [[ -z "$udid" ]] && { echo "  ✗ no sim '$name' — create in Xcode; skipping"; continue; }
    xcrun simctl boot "$udid" 2>/dev/null || true; open -a Simulator || true
    until xcrun simctl list devices booted | grep -q "$udid"; do sleep 1; done; sleep 6
    local dest="$OUTBASE/ios/$label"; mkdir -p "$dest"
    MAESTRO_DRIVER_STARTUP_TIMEOUT=300000 maestro --device "$udid" test \
      ${MAESTRO_ENV[@]+"${MAESTRO_ENV[@]}"} -e "APP_ID=${IOS_APP_ID:?}" -e "OUT=$dest" "$FLOW" \
      || echo "  ⚠ flow errored on $name"
    xcrun simctl shutdown "$udid" 2>/dev/null || true
    ok "iOS $label → $dest"
  done
  osascript -e 'quit app "Simulator"' 2>/dev/null || true
}

capture_android() {
  [[ -z "${AND_AVDS:-}" ]] && { echo "(no AND_AVDS — skipping Android)"; return; }
  local EMU="$HOME/Library/Android/sdk/emulator/emulator"
  command -v adb >/dev/null || die "adb not found (install platform-tools)"
  local IFS=';'; read -ra _a <<< "$AND_AVDS"; unset IFS
  for pair in "${_a[@]}"; do
    pair="$(echo "$pair" | xargs)"; [[ -z "$pair" ]] && continue
    local avd="${pair%%::*}" label="${pair##*::}"
    bold ">> Android  $avd  ($label)"
    "$EMU" -avd "$avd" -no-snapshot-load -no-boot-anim >/tmp/store-shots-emu.log 2>&1 &
    local epid=$!
    until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 3; done
    sleep 5; adb shell input keyevent 82 2>/dev/null || true
    local dest="$OUTBASE/android/$label"; mkdir -p "$dest"
    maestro test ${MAESTRO_ENV[@]+"${MAESTRO_ENV[@]}"} -e "APP_ID=${AND_APP_ID:?}" -e "OUT=$dest" "$FLOW" \
      || echo "  ⚠ flow errored on $avd"
    adb emu kill 2>/dev/null || true; wait "$epid" 2>/dev/null || true
    ok "Android $label → $dest"
  done
}

case "$MODE" in
  ios) capture_ios ;;
  android) capture_android ;;
  all) capture_ios; capture_android ;;
  *) die "mode must be ios|android|all" ;;
esac
echo; ok "Done → $OUTBASE"
find "$OUTBASE" -name '*.png' | sort | sed 's/^/  /'
