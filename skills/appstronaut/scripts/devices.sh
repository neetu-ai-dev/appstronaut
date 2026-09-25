#!/usr/bin/env bash
# devices.sh [ensure|list] — suggest + auto-create the virtual devices needed for store screenshots.
#   list   (default) print required vs existing + the .capture.env lines to use
#   ensure create any missing iOS simulators / Android AVDs (reuses suitable existing ones first)
#
# FUTURE-PROOF: picks the LARGEST current device of each class dynamically (Apple only requires the
# biggest screen and scales down). Apple's required size is whatever the newest iPhone Pro Max /
# largest iPad produce — so we detect the highest model available rather than hardcoding "6.5 inch".
# The skill should ALSO fetch Apple/Google's live screenshot-spec pages and reconcile (see SKILL.md).
set -uo pipefail
MODE="${1:-list}"
bold(){ printf "\033[1m%s\033[0m\n" "$1"; }
ok(){   printf "  \033[32m✓ %s\033[0m\n" "$1"; }
miss(){ printf "  \033[33m• missing: %s\033[0m\n" "$1"; }
info(){ printf "  %s\n" "$1"; }
IOS_LINE=""; AND_LINE=""

# ---------------- iOS ----------------
ios() {
  command -v xcrun >/dev/null || { info "(no xcrun — skip iOS)"; return; }
  bold "iOS simulators (largest iPhone + largest iPad — Apple scales down)"
  local avail dtypes runtime parts=""
  avail="$(xcrun simctl list devices available 2>/dev/null)"
  dtypes="$(xcrun simctl list devicetypes 2>/dev/null)"
  runtime="$(xcrun simctl list runtimes 2>/dev/null | grep -E 'iOS' | grep -v unavailable | tail -1 | grep -oE 'com\.apple\.CoreSimulator\.SimRuntime\.iOS[^ ]*')"

  # highest-numbered iPhone Pro Max available as a device type (biggest screen Apple requires)
  local iphone
  iphone="$(grep -oE 'iPhone [0-9]+ Pro Max' <<<"$dtypes" | awk '{print $2, $0}' | sort -n | tail -1 | cut -d' ' -f2-)"
  [[ -z "$iphone" ]] && iphone="$(grep -oE 'iPhone [0-9]+ Plus' <<<"$dtypes" | awk '{print $2,$0}' | sort -n | tail -1 | cut -d' ' -f2-)"
  [[ -z "$iphone" ]] && iphone="iPhone 11 Pro Max"   # last-resort fallback

  # largest iPad Pro available (prefer 13" > 12.9" > 11"); use the clean family name
  local ipad="" inch
  for inch in 13 12.9 11; do
    if grep -qE "iPad Pro ${inch}-inch" <<<"$dtypes"; then ipad="iPad Pro ${inch}-inch"; break; fi
  done
  [[ -z "$ipad" ]] && ipad="iPad Pro 13-inch"

  ios_slot() {  # label | device-type display name to match/create
    local label="$1" want="$2" found
    found="$(grep -F "$want" <<<"$avail" | head -1 | sed -E 's/ *\(.*//; s/^ *//')"
    if [[ -n "$found" ]]; then ok "$label → $found"; parts+="${found}::${label}; "; return; fi
    miss "$label ($want)"
    if [[ "$MODE" == "ensure" ]]; then
      local dtid; dtid="$(grep -F "$want" <<<"$dtypes" | head -1 | grep -oE 'com\.apple\.CoreSimulator\.SimDeviceType\.[^ )]*')"
      if [[ -n "$dtid" && -n "$runtime" ]] && xcrun simctl create "$want" "$dtid" "$runtime" >/dev/null 2>&1; then
        ok "created $want"; parts+="${want}::${label}; "
      else info "could not create $want"; fi
    fi
  }
  ios_slot "iphone" "$iphone"
  ios_slot "ipad"   "$ipad"
  [[ -n "$parts" ]] && IOS_LINE="IOS_SIMS=\"${parts%; }\""
}

# ---------------- Android ----------------
android() {
  local SDK="$HOME/Library/Android/sdk"
  local AVDM="$SDK/cmdline-tools/latest/bin/avdmanager"
  local SDKM="$SDK/cmdline-tools/latest/bin/sdkmanager"
  local EMU="$SDK/emulator/emulator"
  [[ -x "$EMU" ]] || { info "(no Android emulator — skip Android)"; return; }
  bold "Android AVDs (phone + 10\" tablet)"
  local have parts=""; have="$("$EMU" -list-avds 2>/dev/null)"
  local img=""
  [[ -x "$SDKM" ]] && img="$("$SDKM" --list_installed 2>/dev/null | grep -oE 'system-images;[^ ]+' | head -1)"
  [[ -z "$img" ]] && img="$(ls -d "$SDK"/system-images/*/*/* 2>/dev/null | head -1 | sed -E "s#$SDK/system-images/#system-images;#; s#/#;#g")"
  and_slot() {  # label | accept-regex over existing names | create-name | device def
    local label="$1" accept="$2" cname="$3" dev="$4" found
    found="$(grep -iE "$accept" <<<"$have" | head -1)"
    if [[ -n "$found" ]]; then ok "$label → $found"; parts+="${found}::${label}; "; return; fi
    miss "$label ($dev)"
    if [[ "$MODE" == "ensure" ]]; then
      if [[ -z "$img" ]]; then
        info "no system image installed. Run, then re-run ensure:"; info "  $SDKM \"system-images;android-34;google_apis;arm64-v8a\""; return; fi
      if [[ -x "$AVDM" ]] && echo "no" | "$AVDM" create avd -n "$cname" -k "$img" -d "$dev" --force >/dev/null 2>&1; then
        ok "created $cname (img $img)"; parts+="${cname}::${label}; "
      else info "could not create $cname (check: $AVDM list device)"; fi
    fi
  }
  and_slot "tablet" "tablet|tab|nexus 10|10\\.1" "as_tablet" "pixel_tablet"
  and_slot "phone"  "pixel|phone|nexus [56]|galaxy" "as_phone" "pixel_7"
  [[ -n "$parts" ]] && AND_LINE="AND_AVDS=\"${parts%; }\""
}

ios;     echo
android; echo
bold "→ .capture.env device lines:"
[[ -n "$IOS_LINE" ]] && info "$IOS_LINE"
[[ -n "$AND_LINE" ]] && info "$AND_LINE"
echo
info "NOTE: required pixel sizes change. Before capturing, fetch Apple + Google"
info "spec pages (links in scripts/requirements/*.md) and confirm the current set."
[[ "$MODE" != "ensure" ]] && { echo; bold "Run 'devices.sh ensure' to auto-create any missing devices."; }
exit 0
