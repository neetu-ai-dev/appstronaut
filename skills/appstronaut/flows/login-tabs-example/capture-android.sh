#!/usr/bin/env bash
# Capture Play screenshots on each Android emulator in turn — one emulator at a time.
#   store-assets/capture-android.sh <path/to/app-release.apk> [label ...]
# Labels: phone (1080x1920) tablet (1440x2560, fills Play's 7" and 10" slots).
# Needs: the local API on :4000 with the demo tenant freshly seeded, DEMO_USER / DEMO_PASS,
# and ADBKeyboard's APK at ../.cache/ADBKeyboard.apk.
set -euo pipefail
cd "$(dirname "$0")"

APK="${1:?path to app-release.apk}"; shift
LABELS=("${@:-phone tablet}")
: "${DEMO_USER:?}" "${DEMO_PASS:?}"
SDK="$HOME/Library/Android/sdk"; ADB="$SDK/platform-tools/adb"; EMU="$SDK/emulator/emulator"
KEYBOARD="../.cache/ADBKeyboard.apk"

# One emulator at a time (low RAM), and adb targets emulator-5554 below — so never start
# while another is running, and always shut ours down, even when a capture fails.
if "$ADB" devices | grep -q '^emulator-'; then
  echo "an emulator is already running — stop it first (adb emu kill)" >&2; exit 1
fi
trap '"$ADB" -s emulator-5554 emu kill >/dev/null 2>&1 || true' EXIT

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

for label in ${LABELS[@]}; do
  avd="as_$label"
  echo ">> $label — $avd"
  rm -f "$HOME/.android/avd/$avd.avd/"*.lock
  "$EMU" -avd "$avd" -no-snapshot -no-audio -no-boot-anim -gpu host -memory 2048 >/dev/null 2>&1 &
  until [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 5; done
  sleep 20   # let the launcher settle before driving the UI
  "$ADB" install -r "$APK" >/dev/null
  "$ADB" reverse tcp:4000 tcp:4000 >/dev/null
  for k in window_animation_scale transition_animation_scale animator_duration_scale; do
    "$ADB" shell settings put global "$k" 0
  done
  "$ADB" shell settings put global hide_error_dialogs 1
  "$ADB" shell pm list packages | grep -q adbkeyboard || { "$ADB" install -r "$KEYBOARD" >/dev/null; sleep 5; }
  "$ADB" shell ime enable com.android.adbkeyboard/.AdbIME >/dev/null
  "$ADB" shell ime set com.android.adbkeyboard/.AdbIME >/dev/null

  python3 capture-android.py emulator-5554 "$label" "$VERIFY_HEAT" || echo "  ! capture failed on $label"

  # Play wants 24-bit PNGs; screencap writes RGBA.
  for f in "android/$label"/0*.png; do
    magick "$f" -background white -alpha remove -alpha off -define png:color-type=2 "$f"
  done
  "$ADB" emu kill >/dev/null 2>&1 || true
  while "$ADB" devices | grep -q emulator-5554; do sleep 2; done
  echo "  -> android/$label: $(ls "android/$label" | grep -vc '^\._' || true) shots"
done
