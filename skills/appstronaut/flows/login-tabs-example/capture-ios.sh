#!/usr/bin/env bash
# Capture App Store screenshots on each iOS simulator with store-assets/flow.yaml.
#   store-assets/capture-ios.sh <path/to/MyApp.app> [label ...]
# Labels: iphone-6.9 iphone-6.5 ipad-13 (default: all three).
# Needs: the local API on :4000 with the demo tenant freshly seeded (`pnpm seed:demo`),
# and DEMO_USER / DEMO_PASS in the environment (the supervisor login).
set -euo pipefail
cd "$(dirname "$0")"

APP="${1:?path to the Release-iphonesimulator MyApp.app}"; shift
LABELS=("${@:-iphone-6.9 iphone-6.5 ipad-13}")
: "${DEMO_USER:?}" "${DEMO_PASS:?}"

# Shot 5 needs a closed heat whose machine figures are still unchecked. Heat numbers move
# with every re-seed, so ask the API which one it is.
API="${API:-http://localhost:4000}"
token="$(curl -s "$API/api/auth/login" -H 'content-type: application/json' \
  -d "{\"email\":\"$DEMO_USER\",\"password\":\"$DEMO_PASS\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')"
VERIFY_HEAT="$(curl -s "$API/api/heats?status=closed&pageSize=50" -H "authorization: Bearer $token" | python3 -c '
import sys, json
d = json.load(sys.stdin); items = d["items"] if isinstance(d, dict) else d
src = lambda h: h.get("sourceFlags") or {}
print(next(h["heatNo"] for h in items
           if not h.get("verifiedFlags") and "machine" in src(h).values()))')"
echo "verify shot uses heat $VERIFY_HEAT"

device_for() {
  case "$1" in
    iphone-6.9) echo "iPhone 17 Pro Max" ;;   # 1320 x 2868
    iphone-6.5) echo "iPhone 14 Plus" ;;      # 1284 x 2778 — its own slot, not a rescale
    ipad-13)    echo "iPad Pro 13-inch" ;;    # 2064 x 2752
  esac
}

for label in ${LABELS[@]}; do
  name="$(device_for "$label")"
  udid="$(xcrun simctl list devices available | grep -F "$name (" | head -1 | grep -oE '[0-9A-F-]{36}')"
  echo ">> $label — $name ($udid)"
  xcrun simctl boot "$udid" 2>/dev/null || true
  xcrun simctl bootstatus "$udid" -b >/dev/null
  sleep 30   # a just-booted simulator drops keystrokes while it finishes starting up
  xcrun simctl status_bar "$udid" override --time "9:41" --batteryState charged --batteryLevel 100 \
    --cellularBars 4 --wifiBars 3 --dataNetwork wifi
  xcrun simctl install "$udid" "$APP"

  # Maestro only writes screenshots under its own run directory, so OUT stays relative
  # and the files are copied out afterwards.
  before="$(ls -d ~/.maestro/tests/*/ 2>/dev/null | tail -1)"
  notnow=""; [[ "$label" == ipad-13 ]] && notnow="43%,57%"   # iPad "Save Password?" → Not Now
  MAESTRO_DRIVER_STARTUP_TIMEOUT=300000 ~/.maestro/bin/maestro --device "$udid" test \
    -e APP_ID=com.acme.ops -e OUT="shots/$label" -e NOTNOW_AT="$notnow" -e VERIFY_HEAT="$VERIFY_HEAT" \
    -e DEMO_USER="$DEMO_USER" -e DEMO_PASS="$DEMO_PASS" flow.yaml || echo "  ! flow failed on $label"
  run="$(ls -d ~/.maestro/tests/*/ | tail -1)"
  [[ "$run" == "$before" ]] && { echo "  ! no new Maestro run"; continue; }

  mkdir -p "ios/$label"
  find "$run" -path "*takeScreenshot/shots/$label/*.png" ! -name '._*' -exec cp {} "ios/$label/" \;
  xcrun simctl shutdown "$udid"
  echo "  -> ios/$label: $(ls "ios/$label" | grep -vc "^\._" || true) shots"
done
