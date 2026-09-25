#!/usr/bin/env bash
# detect.sh <project-dir>
# Auto-detect a mobile project's type + metadata. Prints KEY=VALUE lines (eval-able).
# Types: expo | bare-rn | flutter | native-ios | native-android | unknown
# Best-effort: an LLM driver should fill/override anything blank.
set -euo pipefail
DIR="${1:-.}"
DIR="$(cd "$DIR" && pwd)"
PY="$(command -v python3 || true)"

emit() { printf '%s=%q\n' "$1" "${2:-}"; }
jget() { # jget <file> <python-expr over `d`>  -> value or empty
  [[ -n "$PY" && -f "$1" ]] || return 0
  "$PY" - "$1" "$2" <<'EOF' 2>/dev/null || true
import json,sys
try:
    d=json.load(open(sys.argv[1]))
    v=eval(sys.argv[2],{"d":d})
    print(v if v is not None else "")
except Exception:
    pass
EOF
}

TYPE=unknown
NAME= VERSION= BUILD= IOS_ID= AND_ID= SUPPORTS_TABLET=true
BUILD_TOOL= SUBMIT_IOS_APPLEID= SUBMIT_IOS_ASCID= SUBMIT_IOS_TEAM= SUBMIT_AND_TRACK=

has() { [[ -e "$DIR/$1" ]]; }

# ---- Expo (managed or prebuilt) ----
if has app.json && [[ -n "$(jget "$DIR/app.json" 'd.get("expo")')" ]]; then
  TYPE=expo; BUILD_TOOL=eas
  F="$DIR/app.json"
  NAME="$(jget "$F" 'd["expo"].get("name")')"
  VERSION="$(jget "$F" 'd["expo"].get("version")')"
  IOS_ID="$(jget "$F" 'd["expo"].get("ios",{}).get("bundleIdentifier")')"
  AND_ID="$(jget "$F" 'd["expo"].get("android",{}).get("package")')"
  st="$(jget "$F" 'd["expo"].get("ios",{}).get("supportsTablet")')"; [[ "$st" == "False" ]] && SUPPORTS_TABLET=false
  if has eas.json; then
    E="$DIR/eas.json"
    SUBMIT_IOS_APPLEID="$(jget "$E" 'd.get("submit",{}).get("production",{}).get("ios",{}).get("appleId")')"
    SUBMIT_IOS_ASCID="$(jget "$E" 'd.get("submit",{}).get("production",{}).get("ios",{}).get("ascAppId")')"
    SUBMIT_IOS_TEAM="$(jget "$E" 'd.get("submit",{}).get("production",{}).get("ios",{}).get("appleTeamId")')"
    SUBMIT_AND_TRACK="$(jget "$E" 'd.get("submit",{}).get("production",{}).get("android",{}).get("track")')"
  fi

# ---- Flutter ----
elif has pubspec.yaml; then
  TYPE=flutter; BUILD_TOOL=flutter
  NAME="$(grep -E '^name:' "$DIR/pubspec.yaml" | head -1 | sed 's/name:[[:space:]]*//')"
  ver="$(grep -E '^version:' "$DIR/pubspec.yaml" | head -1 | sed 's/version:[[:space:]]*//')"
  VERSION="${ver%%+*}"; [[ "$ver" == *+* ]] && BUILD="${ver##*+}"
  AND_ID="$(grep -rhE 'applicationId' "$DIR/android/app/build.gradle" 2>/dev/null | head -1 | grep -oE '"[^"]+"|'\''[^'\'']+'\''' | tr -d '"'\''' || true)"

# ---- Bare React Native ----
elif has package.json && [[ -n "$(jget "$DIR/package.json" 'd.get("dependencies",{}).get("react-native")')" ]]; then
  TYPE=bare-rn; BUILD_TOOL=native
  NAME="$(jget "$DIR/package.json" 'd.get("name")')"
  AND_ID="$(grep -rhE 'applicationId' "$DIR/android/app/build.gradle" 2>/dev/null | head -1 | grep -oE '"[^"]+"' | tr -d '"' || true)"
  IOS_ID="$(grep -rhE 'PRODUCT_BUNDLE_IDENTIFIER' "$DIR/ios"/*.xcodeproj/project.pbxproj 2>/dev/null | head -1 | sed -E 's/.*= *([^;]+);/\1/' | tr -d ' "' || true)"

# ---- Native iOS ----
elif ls "$DIR"/*.xcodeproj >/dev/null 2>&1 || ls "$DIR"/*.xcworkspace >/dev/null 2>&1 || ls "$DIR"/ios/*.xcodeproj >/dev/null 2>&1; then
  TYPE=native-ios; BUILD_TOOL=xcodebuild
  IOS_ID="$(grep -rhE 'PRODUCT_BUNDLE_IDENTIFIER' "$DIR"/*.xcodeproj/project.pbxproj 2>/dev/null | head -1 | sed -E 's/.*= *([^;]+);/\1/' | tr -d ' "' || true)"

# ---- Native Android ----
elif has build.gradle || has settings.gradle || has app/build.gradle; then
  TYPE=native-android; BUILD_TOOL=gradle
  AND_ID="$(grep -rhE 'applicationId' "$DIR"/app/build.gradle "$DIR"/build.gradle 2>/dev/null | head -1 | grep -oE '"[^"]+"' | tr -d '"' || true)"
fi

emit PROJECT_DIR "$DIR"
emit TYPE "$TYPE"
emit BUILD_TOOL "$BUILD_TOOL"
emit APP_NAME "$NAME"
emit VERSION "$VERSION"
emit BUILD_NUMBER "$BUILD"
emit IOS_APP_ID "$IOS_ID"
emit AND_APP_ID "$AND_ID"
emit SUPPORTS_TABLET "$SUPPORTS_TABLET"
emit SUBMIT_IOS_APPLEID "$SUBMIT_IOS_APPLEID"
emit SUBMIT_IOS_ASCID "$SUBMIT_IOS_ASCID"
emit SUBMIT_IOS_TEAM "$SUBMIT_IOS_TEAM"
emit SUBMIT_AND_TRACK "$SUBMIT_AND_TRACK"
