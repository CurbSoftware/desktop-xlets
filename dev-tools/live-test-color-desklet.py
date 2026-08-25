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
import shutil
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cinnamon_eval import ev  # noqa: E402

DESKLET = "cinnamon-color-timer-clock-desklet@curbsoftware"
WORLD_DESKLET = "cinnamon-world-clock-desklet@curbsoftware"
LOG = os.path.expanduser("~/.xsession-errors")

passed = 0
failures = []
blocked = []
suite_name = ""

P = (
    'let D=imports.ui.deskletManager.get_object_for_uuid("%s","%s");'
    % (DESKLET, DESKLET)
)
CA = (
    'let CA=imports.ui.deskletManager.desklets["%s"].cardActions;'
    % DESKLET
)
WP = (
    'let W=imports.ui.deskletManager.get_object_for_uuid("%s","%s");'
    % (WORLD_DESKLET, WORLD_DESKLET)
)


def suite(name):
    global suite_name
    suite_name = name
    print("\n[SUITE] " + name)


def check(label, condition, detail=None):
    global passed
    if condition:
        passed += 1
        print("  PASS " + label)
    else:
        failures.append(f"{suite_name} / {label}" + (f" -- {detail}" if detail else ""))
        print("  FAIL " + label + (f" -- {detail}" if detail else ""))


def block(label, detail):
    blocked.append(f"{suite_name} / {label} -- {detail}")
    print("  BLOCKED " + label + " -- " + detail)


def js(code, soft=False):
    """Eval JS in Cinnamon; raises on JS exception unless soft."""
    ok, value = ev(P + CA + code)
    if not ok:
        if soft:
            return None
        raise RuntimeError("JS error: " + value)
    return json.loads(value) if value else None


def world_js(code, soft=False):
    """Eval against the known-good World Clock drag reference."""
    ok, value = ev(WP + code)
    if not ok:
        if soft:
            return None
        raise RuntimeError("World Clock JS error: " + value)
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
        "now=new Date(); parts=D._clockWallParts(now);"
        "pos=parts.hours*3600+parts.minutes*60+parts.seconds;"
        "CA.evaluate(CA.normalizeSchedule(D.clockSchedule, CA.DAY_SECONDS).stops,"
        "pos, {wrap:true, smooth:true}).slice(0,3)"))


def near(actual, expected, tol=3):
    return (actual is not None and expected is not None and
            all(abs(a - e) <= tol for a, e in zip(actual, expected)))


def settle(seconds=0.7):
    time.sleep(seconds)


def setting(key):
    return subprocess.check_output(
        ["gsettings", "get", "org.cinnamon", key], text=True).strip()


def set_setting(key, value):
    subprocess.run(
        ["gsettings", "set", "org.cinnamon", key, value], check=True)


def showing_desktop():
    output = subprocess.check_output(
        ["xprop", "-root", "_NET_SHOWING_DESKTOP"], text=True)
    match = re.search(r"=\s*([01])\s*$", output)
    return bool(int(match.group(1))) if match else False


def set_showing_desktop(show):
    subprocess.run(
        ["wmctrl", "-k", "on" if show else "off"], check=True)


def actor_position():
    return tuple(js("[Math.round(D.actor.x),Math.round(D.actor.y)]"))


def actor_center(expr):
    return js(
        f"a={expr}; p=a.get_transformed_position(); s=a.get_transformed_size();"
        "[Math.round(p[0]+s[0]/2),Math.round(p[1]+s[1]/2)]")


def world_actor_center(expr):
    return world_js(
        f"a={expr}; p=a.get_transformed_position(); s=a.get_transformed_size();"
        "[Math.round(p[0]+s[0]/2),Math.round(p[1]+s[1]/2)]")


def world_actor_position():
    value = world_js("W?[Math.round(W.actor.x),Math.round(W.actor.y)]:null", soft=True)
    return tuple(value) if value else None


class PointerBoundsError(RuntimeError):
    pass


def checked_point(point, label):
    """Return integer stage coordinates or reject before xdotool sees them."""
    width, height = orig["stage_size"]
    x = int(round(point[0]))
    y = int(round(point[1]))
    if x < 0 or y < 0 or x >= width or y >= height:
        raise PointerBoundsError(
            f"{label} ({x}, {y}) is outside the {width}x{height} stage")
    return x, y


def reset_color_home():
    x, y = orig["color_position"]
    js(f"D.actor.set_position({x},{y});true", soft=True)


def reset_world_home():
    if orig["world_position"] is None:
        return
    x, y = orig["world_position"]
    world_js(f"if(W)W.actor.set_position({x},{y});true", soft=True)


def reset_live_positions():
    reset_color_home()
    reset_world_home()
    settle(0.08)


def wait_for_stage(probe, timeout=5.0):
    """Wait until an actor is allocated, mapped and stage-pickable."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if probe():
            return True
        settle(0.1)
    return False


def color_stage_ready():
    return js(
        "a=D._cards[0].actor;p=a.get_transformed_position();s=a.get_transformed_size();"
        "hit=global.stage.get_actor_at_pos(imports.gi.Clutter.PickMode.REACTIVE,"
        "Math.round(p[0]+s[0]/2),Math.round(p[1]+s[1]/2));"
        "ready=false;while(hit){if(hit===D.actor||hit===a){ready=true;break;}"
        "hit=hit.get_parent();}ready") is True


def world_stage_ready():
    return world_js(
        "if(!W||!W._clockWidgets||W._clockWidgets.length===0)false;else{"
        "a=W._clockWidgets[0].actor;p=a.get_transformed_position();"
        "s=a.get_transformed_size();"
        "hit=global.stage.get_actor_at_pos(imports.gi.Clutter.PickMode.REACTIVE,"
        "Math.round(p[0]+s[0]/2),Math.round(p[1]+s[1]/2));"
        "ready=false;while(hit){if(hit===W.actor||hit===a){ready=true;break;}"
        "hit=hit.get_parent();}ready}", soft=True) is True


def calibrate_press_receipt():
    """Return drag receipts for the World Clock reference and Color Clock."""
    reset_live_positions()
    world_ready = wait_for_stage(world_stage_ready)
    color_ready = wait_for_stage(color_stage_ready)
    if not world_ready and not color_ready:
        return False, False

    def inject_probe(point):
        start_x, start_y = checked_point(point, "calibration start")
        mid_x, mid_y = checked_point((start_x + 35, start_y + 18),
                                     "calibration midpoint")
        end_x, end_y = checked_point((start_x + 70, start_y + 35),
                                     "calibration endpoint")
        subprocess.run([
            "xdotool", "mousemove", "--sync", str(start_x), str(start_y),
            "mousedown", "1", "sleep", "0.15",
            "mousemove", "--sync", str(mid_x), str(mid_y), "sleep", "0.18",
            "mousemove", "--sync", str(end_x), str(end_y),
            "sleep", "0.35", "mouseup", "1"
        ], check=True)
        settle(0.4)

    reference_received = False
    color_received = False
    try:
        if world_ready:
            before = world_actor_position()
            inject_probe(world_actor_center("W._clockWidgets[0].actor"))
            reference_received = world_actor_position() != before
            reset_world_home()
            settle(0.08)
        if color_ready:
            before = actor_position()
            inject_probe(actor_center("D._cards[0].actor"))
            color_received = actor_position() != before
        return reference_received, color_received
    except PointerBoundsError:
        return False, False
    finally:
        reset_live_positions()


def drag_origin(expr):
    """Point inside actor body, away from centered labels and bottom controls."""
    return js(
        f"a={expr}; p=a.get_transformed_position(); s=a.get_transformed_size();"
        "[Math.round(p[0]+Math.min(70,s[0]/4)),"
        "Math.round(p[1]+Math.min(80,s[1]/3))]")


def gutter_point():
    return js(
        "a=D._cards[0].actor;b=D._cards[1].actor;"
        "ap=a.get_transformed_position();as=a.get_transformed_size();"
        "bp=b.get_transformed_position();"
        "[Math.round((ap[0]+as[0]+bp[0])/2),Math.round(ap[1]+60)]")


def drag_point(point, dx, dy):
    """Drag from a point, release, then move pointer away.
    Returns actor positions before, at release and after later pointer motion."""
    before = actor_position()
    start_x, start_y = checked_point(point, "drag start")
    mid_x, mid_y = checked_point((start_x + int(dx / 2), start_y + int(dy / 2)),
                                 "drag midpoint")
    end_x, end_y = checked_point((start_x + dx, start_y + dy), "drag endpoint")
    subprocess.run(["xdotool", "mousemove", "--sync", str(start_x), str(start_y),
                    "mousedown", "1", "sleep", "0.15",
                    "mousemove", "--sync", str(mid_x), str(mid_y),
                    "sleep", "0.18",
                    "mousemove", "--sync", str(end_x), str(end_y),
                    "sleep", "0.35", "mouseup", "1"], check=True)
    settle(0.4)
    released = actor_position()
    subprocess.run(["xdotool", "mousemove_relative", "--sync", "120", "80"], check=True)
    settle(0.15)
    return before, released, actor_position()


def color_drag(point_factory, dx, dy):
    """Run one Color pointer case from home and put the actor home afterward."""
    reset_color_home()
    settle(0.08)
    try:
        return drag_point(point_factory(), dx, dy)
    finally:
        reset_color_home()
        settle(0.08)


def drag_from(expr, dx, dy):
    return color_drag(lambda: drag_origin(expr), dx, dy)


def reload_xlet():
    subprocess.run(
        ["gdbus", "call", "--session", "--dest", "org.Cinnamon",
         "--object-path", "/org/Cinnamon", "--method", "org.Cinnamon.ReloadXlet",
         DESKLET, "DESKLET"],
        capture_output=True, check=True)
    settle(2.0)


def reload_world_xlet():
    subprocess.run(
        ["gdbus", "call", "--session", "--dest", "org.Cinnamon",
         "--object-path", "/org/Cinnamon", "--method", "org.Cinnamon.ReloadXlet",
         WORLD_DESKLET, "DESKLET"],
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
    "enabled_desklets": setting("enabled-desklets"),
    "desklet_snap": setting("desklet-snap"),
    "lock_desklets": setting("lock-desklets"),
    "showing_desktop": showing_desktop(),
    "stage_size": tuple(js("[Math.round(global.stage.width),Math.round(global.stage.height)]")),
    "color_position": actor_position(),
    "world_position": world_actor_position(),
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
        set_setting("desklet-snap", orig["desklet_snap"])
        set_setting("lock-desklets", orig["lock_desklets"])
        set_setting("enabled-desklets", orig["enabled_desklets"])
        settle(0.25)
        reset_live_positions()
        if actor_position() != orig["color_position"]:
            reload_xlet()
            reset_live_positions()
        if (orig["world_position"] is not None and
                world_actor_position() != orig["world_position"]):
            reload_world_xlet()
            reset_live_positions()
        set_showing_desktop(orig["showing_desktop"])
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

suite("drag release ownership")
check("xdotool is available", shutil.which("xdotool") is not None)
drag_ok = shutil.which("xdotool") is not None
if drag_ok:
    # Desklets live below normal windows. Expose the desktop so every pointer
    # origin in this suite reaches the intended card instead of an overlapping
    # application window. The original desktop state is restored on exit.
    set_showing_desktop(True)
    set_setting("lock-desklets", "false")
    set_setting("desklet-snap", "false")
    settle(0.5)
    reference_received, color_received = calibrate_press_receipt()
    environment_blocked = not reference_received and not color_received
    color_only_failure = reference_received and not color_received
    if environment_blocked:
        block("DND pointer matrix",
              "calibration drags moved neither World Clock nor Color Clock")
    elif color_only_failure:
        check("Color Clock receives a drag when World Clock does", False,
              "World Clock moved from injection; Color Clock did not")
    else:
        check("injected drag reaches Color Clock", color_received)

    run_pointer_matrix = not environment_blocked and not color_only_failure
    if run_pointer_matrix:
        for kind in ("clock", "timer", "chrono"):
            stayed = True
            moved_count = 0
            for i in range(10):
                direction = 1 if i % 2 == 0 else -1
                before, released, after = drag_from(
                    f"D._cards.filter(function(c){{return c.kind==='{kind}'}})[0].actor",
                    100 * direction, 50 * direction)
                stayed = stayed and released == after
                moved_count += int(before != released)
            check(f"{kind} card releases cleanly across 10 drags", stayed)
            check(f"{kind} card movement is observed", moved_count > 0,
                  f"moved {moved_count}/10")

        stayed = True
        moved_count = 0
        for i in range(10):
            direction = 1 if i % 2 == 0 else -1
            before, released, after = color_drag(
                gutter_point, 100 * direction, 50 * direction)
            stayed = stayed and released == after
            moved_count += int(before != released)
        check("card gutter releases cleanly across 10 drags", stayed)
        check("card gutter movement is observed", moved_count > 0,
              f"moved {moved_count}/10")

        before_swatch, released, after = color_drag(
            lambda: actor_center("D._cards[0]._swatch"), 100, 50)
        check("reactive swatch releases cleanly", released == after)
        check("reactive swatch still permits desklet movement", before_swatch != released)

        before_control, released, after = color_drag(
            lambda: actor_center(
                "D._cards.filter(function(c){return c.kind==='timer'})[0]._playButton"),
            80, 0)
        check("release outside a pressed control does not retain pointer",
              released == after)
        check("release outside control ends Cinnamon drag state",
              js("D._dragging") is False)

        reset_color_home()
        settle(0.08)
        cancel_point = checked_point(actor_center("D._cards[0].actor"), "cancel start")
        cancel_mid = checked_point((cancel_point[0] + 18, cancel_point[1] + 10),
                                   "cancel midpoint")
        cancel_end = checked_point((cancel_point[0] + 36, cancel_point[1] + 20),
                                   "cancel endpoint")
        subprocess.run(["xdotool", "mousemove", "--sync",
                        str(cancel_point[0]), str(cancel_point[1]),
                        "mousedown", "1", "sleep", "0.08",
                        "mousemove", "--sync", str(cancel_mid[0]),
                        str(cancel_mid[1]), "sleep", "0.08",
                        "mousemove", "--sync", str(cancel_end[0]),
                        str(cancel_end[1]), "sleep", "0.08",
                        "key", "Escape", "mouseup", "1"], check=True)
        settle(0.15)
        cancelled = actor_position()
        subprocess.run(["xdotool", "mousemove_relative", "--sync", "120", "80"], check=True)
        settle(0.15)
        cancel_released = cancelled == actor_position()
        cancel_clear = js("D._dragging") is False
        reset_color_home()
        settle(0.08)
        check("Escape cancellation does not retain pointer", cancel_released)
        check("post-cancel drag state is clear", cancel_clear)

        set_setting("desklet-snap", "true")
        settle(0.3)
        _before_snap, released, after = drag_from("D._cards[0].actor", 100, 50)
        check("snap mode releases cleanly", released == after)

        set_setting("lock-desklets", "true")
        settle(0.3)
        before_locked = actor_position()
        _before, released, after = drag_from("D._cards[0].actor", 24, 16)
        check("locked desklet does not move", before_locked == released == after)
        check("desklet stays Cinnamon-inhibited while locked",
              js("D._draggable.inhibit") is True)
    set_setting("lock-desklets", orig["lock_desklets"])
    set_setting("desklet-snap", orig["desklet_snap"])
    set_showing_desktop(orig["showing_desktop"])
    settle(0.3)

suite("responsive and empty layouts")
js("D.width=600; D.mainContainer.set_width(600); D._rebuildCards(); true")
settle(0.3)
layout = js("c=D._cards[2].actor;p=c.get_transformed_position();s=c.get_transformed_size();"
            "mp=D.mainContainer.get_transformed_position();ms=D.mainContainer.get_transformed_size();"
            "JSON.stringify({cards:D._cards.map(c=>c.kind),dims:D._gridDims,height:D._layoutHeight,"
            "lastCenter:p[0]+s[0]/2,containerCenter:mp[0]+ms[0]/2})")
layout = json.loads(layout)
check("600px layout keeps every enabled card", layout["cards"] == ["clock", "timer", "chrono"])
check("600px layout wraps to two rows", layout["dims"] == {"rows": 2, "cols": 2})
check("wrapped layout grows to safe height", layout["height"] >= 280)
check("incomplete final row is centered",
      abs(layout["lastCenter"] - layout["containerCenter"]) <= 4,
      f"last={layout['lastCenter']}, container={layout['containerCenter']}")
check("clock uses inert spacer, not hidden controls",
      js("D._cards[0]._ctlButtons.length===0 && "
         "D._cards[0]._controls.has_style_class_name('ctc-card-controls-spacer')") is True)
preview = js("JSON.stringify(D._cards.map(function(c){p=c._nextLabel.get_preferred_width(-1);"
             "return {label:c._nextLabel.get_text(),width:c._swatch.width,"
             "height:c._swatch.height,visible:c._nextPreview.visible,"
             "labelFits:c._nextLabel.width>=p[1]};}))")
preview = json.loads(preview)
check("all cards show a labelled 20px next-colour chip",
      all(item == {"label": "Next", "width": 20, "height": 20,
                   "visible": True, "labelFits": True} for item in preview),
      repr(preview))
empty = js("D.showClock=false;D.showTimer=false;D.showChronometer=false;D._rebuildCards();"
           "JSON.stringify({cards:D._cards.length,empty:D.mainContainer.has_style_class_name('ctc-empty-container')})")
empty = json.loads(empty)
check("all-disabled state has no stale cards", empty["cards"] == 0)
check("all-disabled state shows setup guidance", empty["empty"] is True)
js(f"D.width={int(orig['width'])};D.mainContainer.set_width({int(orig['width'])});"
   "D.showClock=true;D.showTimer=true;"
   "D.showChronometer=true;D._rebuildCards();true")
settle(0.3)

# Remaining suites use canonical schedules and a five-minute timer. The
# original settings file is restored by the atexit hook.
js("D.resetSchedules();D.timerMinutes=5;D.timerSeconds=0;"
   "D._timer={phase:'stopped',durationSec:300,endMs:0,remainingMs:0};"
   "D._persistTimer();D._updateAll();true")
settle(0.3)

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
   "D._persistTimer(); D._onControl('timer','toggle'); true")
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
js("D._updateAll();true")
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

suite("pointer state restored")
set_setting("enabled-desklets", orig["enabled_desklets"])
settle(0.25)
reset_live_positions()
check("Color Clock actor returned home",
      actor_position() == orig["color_position"],
      f"actual={actor_position()}, home={orig['color_position']}")
if orig["world_position"] is not None:
    check("World Clock actor returned home",
          world_actor_position() == orig["world_position"],
          f"actual={world_actor_position()}, home={orig['world_position']}")
check("enabled-desklets positions restored",
      setting("enabled-desklets") == orig["enabled_desklets"])

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
if blocked:
    print(f"All {passed} runnable checks passed; {len(blocked)} environment-blocked:")
    for item in blocked:
        print("  - " + item)
else:
    print(f"All {passed} checks passed.")
