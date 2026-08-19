#!/usr/bin/env python3
"""
Live edge-case matrix for the Color Timer Clock desklet, driven through
Cinnamon's org.Cinnamon.Eval DBus method against the running session.

Requires the desklet to be installed and enabled (it grabs the live object
by UUID). Every settings value and timer/chrono state this script touches is
restored on exit, including on failure. ReloadXlet is used between
persistence checks; the desklet is re-added by Cinnamon automatically.

Usage:  python3 dev-tools/live-test-color-desklet.py
"""
import atexit
import signal

# SIGTERM (e.g. a test-runner timeout) must still restore settings: route it
# through sys.exit so the atexit hook runs instead of killing the process.
signal.signal(signal.SIGTERM, lambda *_: sys.exit(1))
import json
import os
import re
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cinnamon_eval import ev  # noqa: E402

DESKLET = "cinnamon-color-timer-clock-desklet@curbsoftware"
LOG = os.path.expanduser("~/.xsession-errors")

passed = 0
failures = []
suite_name = ""

P = (
    'let D=imports.ui.deskletManager.get_object_for_uuid("%s","%s");'
    % (DESKLET, DESKLET)
)
CA = (
    'let CA=imports.ui.deskletManager.desklets["%s"].cardActions;'
    % DESKLET
)


def suite(name):
    global suite_name
    suite_name = name
    print("\n• " + name)


def check(label, condition, detail=None):
    global passed
    if condition:
        passed += 1
        print("  ✓ " + label)
    else:
        failures.append(f"{suite_name} / {label}" + (f" -- {detail}" if detail else ""))
        print("  ✗ " + label + (f" -- {detail}" if detail else ""))


def js(code, soft=False):
    """Eval JS in Cinnamon; raises on JS exception unless soft."""
    ok, value = ev(P + CA + code)
    if not ok:
        if soft:
            return None
        raise RuntimeError("JS error: " + value)
    return json.loads(value) if value else None


def card(kind, expr):
    return js(f"D._cards.filter(function(c){{return c.kind==='{kind}'}})[0].{expr}")


def bg_of(kind):
    style = card(kind, "actor.get_style()") or ""
    m = re.search(r"background-color: ([^;]+);", style)
    return m.group(1) if m else None


def bg_rgb(kind):
    """Background color as (r, g, b) ints; None when unstyled."""
    bg = bg_of(kind)
    if not bg:
        return None
    m = re.match(r"rgba\((\d+), (\d+), (\d+),", bg)
    return tuple(int(g) for g in m.groups()) if m else None


def ramp_now():
    """The default clock ramp color at the current second, recomputed so
    time advancing between checks cannot flake the comparison."""
    return tuple(js(
        "now=new Date(); pos=now.getHours()*3600+now.getMinutes()*60+now.getSeconds();"
        "CA.evaluate(CA.normalizeSchedule(D.clockSchedule, CA.DAY_SECONDS).stops,"
        "pos, {wrap:true, smooth:true}).slice(0,3)"))


def near(actual, expected, tol=3):
    return (actual is not None and expected is not None and
            all(abs(a - e) <= tol for a, e in zip(actual, expected)))


def settle(seconds=0.7):
    time.sleep(seconds)


def reload_xlet():
    subprocess.run(
        ["gdbus", "call", "--session", "--dest", "org.Cinnamon",
         "--object-path", "/org/Cinnamon", "--method", "org.Cinnamon.ReloadXlet",
         DESKLET, "DESKLET"],
        capture_output=True, check=True)
    settle(2.0)


def log_size():
    with open(LOG, "rb") as fh:
        return len(fh.read())


def new_log_errors(since):
    with open(LOG, "rb") as fh:
        fh.seek(since)
        text = fh.read().decode("utf-8", "replace")
    return [line for line in text.splitlines()
            if "js error" in line.lower() or "logerror" in line.lower()]


# ---------------------------------------------------------------------- #
# Original state capture + restore
# ---------------------------------------------------------------------- #

orig = {
    "clock_schedule": js("JSON.stringify(D.clockSchedule)"),
    "width": js("D.width"),
    "settings_path": js("D.settings.file.get_path()"),
}
with open(orig["settings_path"]) as f:
    orig_settings_text = f.read()


@atexit.register
def restore():
    try:
        with open(orig["settings_path"], "w") as f:
            f.write(orig_settings_text)
        js("D.settings.remoteUpdate('clock-schedule',''); true", soft=True)
        settle(0.5)
        js("D._timer.phase='stopped'; D._timer.endMs=0; D._timer.remainingMs=0;"
           "D._timer.durationSec=D._timerDurationFromSettings(); D._persistTimer();"
           "D._chrono.phase='stopped'; D._chrono.startMs=0; D._chrono.accumMs=0;"
           "D._persistChrono(); D._updateAll(); true", soft=True)
    except Exception:  # noqa: BLE001
        print("WARNING: state restore failed", file=sys.stderr)


log_start = log_size()

# ---------------------------------------------------------------------- #
# Suites
# ---------------------------------------------------------------------- #

suite("load")
check("desklet object found", js("!!D") is True)
check("three cards by default", js("D._cards.length") == 3)
check("header set", js("D._header_label.get_text()") == "Color Timer Clock")

suite("schedule paint")
check("clock card paints the default ramp",
      near(bg_rgb("clock"), ramp_now()),
      f"painted {bg_rgb('clock')!r}, want ~{ramp_now()!r}")
check("inline style carries the transition duration",
      "transition-duration" in (card("clock", "actor.get_style()") or ""))
check("timer card stopped paints the remaining-300s stop",
      bg_of("timer") is not None)
check("chronometer stopped paints the elapsed-0 stop",
      bg_of("chrono") is not None)

suite("external schedule edit is picked up")
# Faithful settings-window simulation: the daemon writes the file out of
# band, then fires remoteUpdate.
with open(orig["settings_path"]) as f:
    data = json.load(f)
data["clock-schedule"]["value"] = [{"hour": 0, "minute": 0, "color": "#ffffff"}]
with open(orig["settings_path"], "w") as f:
    json.dump(data, f, indent=4)
js("D.settings.remoteUpdate('clock-schedule','')")
settle()
check("white-only schedule repaints the clock card",
      bg_of("clock") == "rgba(255, 255, 255, 1.00)", repr(bg_of("clock")))
check("white card gets dark adaptive text",
      "rgba(17, 17, 17, 0.92)" in (card("clock", "actor.get_style()") or ""))

suite("reset survives an unrelated settings change")
js("D.resetSchedules()")
check("reset paints the default ramp again",
      near(bg_rgb("clock"), ramp_now()), repr(bg_rgb("clock")))
check("bound schedule property is live (defaults after reset)",
      json.loads(js("JSON.stringify(D.clockSchedule)")) ==
      [{"hour": 6, "minute": 0, "color": "#f4433c"},
       {"hour": 12, "minute": 0, "color": "#9c27b0"},
       {"hour": 18, "minute": 0, "color": "#3949ab"}])
js(f"D.settings.setValue('width', {int(orig['width']) + 20});"
   "D.settings.remoteUpdate('width','')")
settle()
check("unrelated width change does not revert the reset",
      near(bg_rgb("clock"), ramp_now()), repr(bg_rgb("clock")))
check("width change applied", js("D.width") == int(orig["width"]) + 20)

suite("timer pause-at-expiry guard")
js("D._timer.durationSec=2; D._timer.phase='running';"
   "D._timer.endMs=Date.now()-100; D._timer.remainingMs=2000;"
   "D._persistTimer(); true")
js("D._onControl('timer','toggle')")
check("pause after endMs expires, not strands at Paused/00:00",
      js("D._timer.phase") == "expired")
check("expired title", card("timer", "_title.get_text()") == "Time is up")
check("expired value", card("timer", "_value.get_text()") == "00:00")
check("expired pseudo-class",
      card("timer", "actor.get_style_pseudo_class()") == "expired")

suite("timer state machine")
js("D._onControl('timer','reset'); D._onControl('timer','toggle')")
js("D._onControl('timer','toggle')")
check("run -> pause", js("D._timer.phase") == "paused")
check("pause freezes remaining > 0", js("D._timer.remainingMs") > 0)
check("paused sub-label", card("timer", "_sub.get_text()") == "Paused")
js("D._onControl('timer','toggle')")
check("pause -> resume", js("D._timer.phase") == "running")
js("D._timer.phase='running'; D._timer.endMs=Date.now()+300;"
   "D._persistTimer(); true")
time.sleep(1.5)
check("tick expiry transition", js("D._timer.phase") == "expired")
check("expiry persisted",
      json.loads(js("JSON.stringify(D.settings.getValue('timer-state'))"))
      ["phase"] == "expired")

suite("timer +/-60s gating")
js("D._onControl('timer','reset'); D._onControl('timer','plus');"
   "D._onControl('timer','plus')")
check("plus works while stopped", js("D._timer.durationSec") == 420)
js("D._onControl('timer','toggle'); D._onControl('timer','plus')")
check("plus ignored while running", js("D._timer.durationSec") == 420)

suite("chronometer state machine")
js("D._onControl('chrono','toggle')")
time.sleep(1.2)
js("D._onControl('chrono','toggle')")
accum = js("D._chrono.accumMs")
check("pause folds the running stretch into accumMs",
      800 <= accum <= 3000, str(accum))
check("chrono paused", js("D._chrono.phase") == "paused")

suite("persistence across reload")
js("D._onControl('timer','reset'); D._timer.durationSec=300;"
   "D._onControl('timer','toggle')")
end_ms = js("D._timer.endMs")
reload_xlet()
check("running timer survives reload", js("D._timer.phase") == "running")
left = js("D._timer.endMs") - js("Date.now()")
check("endMs intact within the duration",
      0 < left <= 310000, f"{left}ms left of 300s")
js("D._timer.phase='running'; D._timer.endMs=Date.now()-1000;"
   "D._persistTimer(); true")
reload_xlet()
check("running-past-end restores as expired", js("D._timer.phase") == "expired")

suite("log noise")
errs = new_log_errors(log_start)
check("no new JS errors during the run", errs == [], "; ".join(errs[:3]))

# ---------------------------------------------------------------------- #
# Summary
# ---------------------------------------------------------------------- #

print("\n" + "=" * 60)
if failures:
    print(f"{passed} passed, {len(failures)} FAILED:")
    for f in failures:
        print("  - " + f)
    sys.exit(1)
print(f"All {passed} checks passed.")
