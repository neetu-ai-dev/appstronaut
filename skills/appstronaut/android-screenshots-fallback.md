# Android emulator screenshots — when Maestro/`capture.sh` fails

`scripts/capture.sh` drives screenshots with **Maestro**. On a slow / resource-starved
Mac emulator Maestro often **can't read the React Native view tree at all** (every
selector "not found" though the screen is correct) or its driver times out
(`Maestro Android driver did not start up in time`). When that happens, fall back to
**uiautomator (read) + ADBKeyboard (type) + screencap (capture) + fixed coords (nav)**.
This recipe got a full phone + 7"/10" tablet set after Maestro failed completely.

## 0. Make the emulator usable (do ALL of these before capturing)
```bash
EMU="$HOME/Library/Android/sdk/emulator/emulator"
"$EMU" -avd <AVD> -gpu host -memory 4096 -netdelay none -netspeed full \
       -no-snapshot-load -no-boot-anim &        # -gpu host is much faster on Apple Silicon
until [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; do sleep 3; done
adb shell settings put global hide_error_dialogs 1          # stop "System UI isn't responding" ANR popups that block taps
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
adb shell settings put global private_dns_mode off          # see DNS note below
```
**Gotchas, each of which silently breaks a run:**
- **No network at all** (`ping: connect: Network is unreachable`) — a qemu boot glitch. Fix: kill emulator, `rm -f ~/.android/avd/<AVD>.avd/*.lock`, `adb kill-server && adb start-server`, cold-reboot. (Stale `.lock` also causes *"Running multiple emulators with the same AVD"* FATAL.)
- **DNS fails but IPs work** (`ping 8.8.8.8` ok, `ping host.com` = unknown host) — happens when the **host's DNS server is IPv6**; the emulator NAT can't forward it. Fix: `settings put global private_dns_mode off` (then names resolve). `-dns-server 8.8.8.8` alone does NOT fix it.
- A **prod-API build hangs on the splash** if the emulator has no internet (auth boot never completes). Verify `adb shell ping -c1 <api-host>` resolves *before* expecting login.

## 1. Reliable text input — ADBKeyboard, NOT `adb shell input text`
`adb shell input text` **drops/reorders characters** on a slow emulator (you'll see garbled emails). Install ADBKeyboard once and type via broadcast:
```bash
curl -sL https://github.com/senzhk/ADBKeyBoard/raw/master/ADBKeyboard.apk -o /tmp/ADBKeyboard.apk
adb install -r /tmp/ADBKeyboard.apk
adb shell ime enable com.android.adbkeyboard/.AdbIME
adb shell ime set    com.android.adbkeyboard/.AdbIME
# type into the focused field (fields usually autoFocus, so no tap needed):
adb shell am broadcast -a ADB_INPUT_TEXT --es msg "admin@example.com"
adb shell am broadcast -a ADB_CLEAR_TEXT                     # clear a field
```

## 2. Reading the screen — uiautomator, with caveats
```bash
adb shell uiautomator dump && adb pull /sdcard/window_dump.xml /tmp/ui.xml
```
- **The dump is STALE during the RN splash→login transition** — it returns the *splash* tree (`v1.0.0`, app name) even though the screen visually shows login. So `wait_for("Email")` fails forever. **Always confirm the real screen with `adb exec-out screencap -p` (a picture), not the dump,** during transitions. uiautomator IS reliable on *stable* screens (dashboard, lists) — use it there to read element `bounds` for tapping.
- Parse `bounds="[x1,y1][x2,y2]"` from nodes whose `text`/`content-desc` matches; tap the center. RN tab/sidebar items expose `"<icon-glyph>, Label"` (e.g. `, Requests`) — match the `, Label` tail by regex, anchored to the left edge (`cx<400`) for a sidebar.

## 3. Navigation — fixed coords for stable chrome
The bottom dock / left sidebar doesn't move, so once you've read its coords from one good dump, **tap them as constants** (avoids re-dumping, which is flaky under rapid calls). Read a dynamic item (a list row) with one fresh dump, tap, then **wait ~7s before screencap** so two-pane / detail content finishes loading (a short wait captures skeleton loaders).

## 4. Login that won't relaunch into a splash hang
- Use **`am force-stop`** then `am start -n <pkg>/.MainActivity` — **NOT `pm clear`**. `pm clear` wipes data and the fresh auth-revalidation hangs on the splash over a slow network.
- Submit two-step forms by their keyboard action, not by tapping buttons (avoids racing the auto-advance): with ADBKeyboard, `am broadcast -a ADB_EDITOR_CODE --ei code 5` = IME_ACTION_NEXT, `--ei code 2` = IME_ACTION_GO. Essential on **landscape tablets**, where the IME goes **fullscreen "extract" mode** and covers the whole app — you can't see/tap the form, but the broadcasts still drive it. The final screenshots (dashboard/nav, no focused field) render clean.

## 5. Capture
```bash
adb exec-out screencap -p > shot.png      # native-resolution lossless PNG — sharp, never blurred
```
- Phone (`wm size` may show an Override like 1080×1920) → 1080×1920 is fine for Play (9:16, FHD).
- Tablet renders **landscape** with the sidebar (a great tablet shot) at the panel's native res (e.g. 2560×1600, 16:10).
- **Play 7" and 10" tablet slots take identical dimensions** — capture one tablet set and copy it into both `tablet-7in/` and `tablet-10in/`.
- Images >2000px can't be viewed inline by the agent — `sips -Z 1500 big.png --out view.png` to inspect, but **keep the full-res original** for upload.

## 6. Sanity
After each shot, look at it. Watch for: skeleton/grey loaders (waited too short), the empty "Select a request" pane (row tap missed), the IME fullscreen-extract overlay (you're mid-text-entry), or a stale splash (transition not done).
