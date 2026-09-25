"""Capture Play screenshots on a running Android emulator — the same 7 screens as flow.yaml.

Maestro's Android driver does not start on this Mac's emulator, so this drives the app
with adb instead (appstronaut's android-screenshots-fallback recipe): uiautomator to read
the screen, ADBKeyboard to type, screencap for lossless PNGs.

  python3 store-assets/capture-android.py <serial> <label> <verify-heat-no>
  e.g.  python3 store-assets/capture-android.py emulator-5554 phone 3111

Needs: the release APK installed, `adb reverse tcp:4000 tcp:4000`, ADBKeyboard set as the
IME, the demo tenant freshly seeded, DEMO_USER / DEMO_PASS in the environment.
Read-only: opens screens and one sheet, never saves, approves or sends anything back.
"""
import os, re, subprocess, sys, time, xml.etree.ElementTree as ET

ADB = os.path.expanduser('~/Library/Android/sdk/platform-tools/adb')
PKG = 'com.acme.ops'
serial, label, verify_heat = sys.argv[1:4]
out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'android', label)
os.makedirs(out_dir, exist_ok=True)


def adb(*a):
    return subprocess.run([ADB, '-s', serial, *a], capture_output=True)


def nodes():
    adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml')
    xml = adb('exec-out', 'cat', '/sdcard/ui.xml').stdout.decode('utf-8', 'replace')
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return []
    found = []
    for n in root.iter('node'):
        text = n.get('text') or n.get('content-desc') or ''
        m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', n.get('bounds', ''))
        if text and m:
            x1, y1, x2, y2 = map(int, m.groups())
            found.append((text, (x1 + x2) // 2, (y1 + y2) // 2))
    return found


def find(pattern, index=0, timeout=30):
    rx = re.compile(pattern, re.S)
    deadline = time.time() + timeout
    while time.time() < deadline:
        hits = [n for n in nodes() if rx.fullmatch(n[0])]
        if len(hits) > index:
            return hits[index]
        time.sleep(1.5)
    raise SystemExit(f'[{label}] not found on screen: {pattern!r}')


def tap(pattern, index=0, timeout=30):
    _, x, y = find(pattern, index, timeout)
    adb('shell', 'input', 'tap', str(x), str(y))
    time.sleep(1.5)


def scroll_to(pattern, swipes=4):
    """Swipe up until `pattern` is on screen — uiautomator only reports visible nodes."""
    w, h = map(int, adb('shell', 'wm', 'size').stdout.decode().split()[-1].split('x'))
    for _ in range(swipes):
        if any(re.fullmatch(pattern, n[0], re.S) for n in nodes()):
            return
        adb('shell', 'input', 'swipe', str(w // 2), str(int(h * 0.7)), str(w // 2), str(int(h * 0.4)), '500')
        time.sleep(1.5)


def type_text(text):
    adb('shell', 'am', 'broadcast', '-a', 'ADB_INPUT_TEXT', '--es', 'msg', text)
    time.sleep(1)


def key(code):
    adb('shell', 'input', 'keyevent', str(code))
    time.sleep(1.5)


def shot(name, settle=4):
    time.sleep(settle)  # let lists and figures finish loading
    path = os.path.join(out_dir, f'{name}.png')
    with open(path, 'wb') as f:
        f.write(adb('exec-out', 'screencap', '-p').stdout)
    print(f'[{label}] {name}')


def demo_status_bar(on):
    """Android's System UI demo mode: 9:41, full battery and signal, no notifications."""
    demo = lambda *extra: adb('shell', 'am', 'broadcast', '-a', 'com.android.systemui.demo', *extra)
    if not on:
        demo('-e', 'command', 'exit')
        return
    adb('shell', 'settings', 'put', 'global', 'sysui_demo_allowed', '1')
    demo('-e', 'command', 'enter')
    demo('-e', 'command', 'clock', '-e', 'hhmm', '0941')
    demo('-e', 'command', 'battery', '-e', 'level', '100', '-e', 'plugged', 'false')
    demo('-e', 'command', 'network', '-e', 'wifi', 'show', '-e', 'level', '4')
    demo('-e', 'command', 'network', '-e', 'mobile', 'show', '-e', 'datatype', 'none', '-e', 'level', '4')
    demo('-e', 'command', 'notifications', '-e', 'visible', 'false')


# Sign in from a clean launch (force-stop, never `pm clear` — see the fallback recipe).
adb('shell', 'am', 'force-stop', PKG)
adb('shell', 'am', 'start', '-n', f'{PKG}/.MainActivity')
if not any(re.fullmatch('Melt Shop', n[0]) for n in nodes()):
    find('Sign in', timeout=60)                 # wait for the login screen
    tap('operator@example.com')
    type_text(os.environ['DEMO_USER'])
    tap('Password')                             # the hint; Android reports the label as "PASSWORD"
    type_text(os.environ['DEMO_PASS'])
    key(66)                                     # Enter submits from the password field
find('Melt Shop', timeout=60)
demo_status_bar(True)

shot('01_floor')

tap('Induction Furnace 1')
find('(?i)machine figures')
shot('02_heat_live')
key(4)                                          # Back

tap('Heats')
shot('03_heats')

tap('Approve')
find('Send back')
shot('04_approve')

tap(verify_heat)
find('(?i)machine figures')
shot('05_verify')

scroll_to('Correct')
tap('Correct')
shot('06_keypad', settle=2)
key(4)                                          # closes the sheet without saving
key(4)                                          # leaves the heat

tap('Floor')
tap('Moulding Line')
tap('Screw Compressor')
shot('07_machine')

demo_status_bar(False)
