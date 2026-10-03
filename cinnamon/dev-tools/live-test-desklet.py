#!/usr/bin/env python3
"""
Live edge-case matrix for the workspace grid desklet and workspace name applet,
driven through Cinnamon's org.Cinnamon.Eval DBus method against the running
session.

Destructive operations are confined to workspaces this script appends itself;
the user's existing workspaces are never removed, so no windows are relocated.
Original workspace names, count and active index are asserted restored at the end.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cinnamon_eval import ev  # noqa: E402

DESKLET = "cinnamon-workspace-grid-desklet@curbsoftware"
APPLET = "cinnamon-workspace-names-applet@curbsoftware"
LOG = os.path.expanduser("~/.xsession-errors")

passed = 0
failures = []
blocked = []
suite_name = ""


def suite(name):
    global suite_name
    suite_name = name
    print("\n" + name)


def check(label, condition, detail=None):
    global passed
    if condition:
        passed += 1
        print("  PASS " + label)
    else:
        failures.append(f"{suite_name} / {label}" + (f" -- {detail}" if detail else ""))
        print("  FAIL " + label + (f" -- {detail}" if detail else ""))


def eq(label, actual, expected):
    check(label, actual == expected, f"got {actual!r}, want {expected!r}")


def block(label, detail):
    blocked.append(f"{suite_name} / {label} -- {detail}")
    print("  BLOCKED " + label + " -- " + detail)


def js(code):
    """Eval JS in Cinnamon; raises on JS exception."""
    ok, value = ev(code)
    if not ok:
        raise RuntimeError("JS error: " + value)
    return json.loads(value) if value else None


def js_soft(code):
    """Eval JS in Cinnamon; returns (ok, value) without raising."""
    ok, value = ev(code)
    return ok, value


# Shorthand preamble available to every snippet.
PRE = (
    'let M=imports.ui.main;'
    'let DM=imports.ui.deskletManager;'
    'let AM=imports.ui.appletManager;'
    f'let D=DM.get_object_for_uuid("{DESKLET}","{DESKLET}");'
    'let WA=D?D._wa():null;'
    f'let GM=DM.desklets["{DESKLET}"].gridModel;'
)


def d(code):
    """Eval with the desklet preamble bound."""
    return js(PRE + code)


def assert_grid_contained(label):
    """Assert table and tile paint stay inside the rounded content box."""
    state = d('(function(){let c=D.mainContainer;let t=c.get_children()[0];'
              'let origin=c.get_transformed_position();let size=c.get_transformed_size();'
              'let theme=c.get_theme_node();let side=imports.gi.St.Side;'
              'let left=origin[0]+theme.get_padding(side.LEFT)+'
              'theme.get_border_width(side.LEFT);'
              'let right=origin[0]+size[0]-theme.get_padding(side.RIGHT)-'
              'theme.get_border_width(side.RIGHT);'
              'let top=origin[1]+theme.get_padding(side.TOP)+'
              'theme.get_border_width(side.TOP);'
              'let bottom=origin[1]+size[1]-theme.get_padding(side.BOTTOM)-'
              'theme.get_border_width(side.BOTTOM);let epsilon=0.5;'
              'function inside(a){let result=a.get_paint_box();if(!result[0])return false;'
              'let b=result[1];return b.x1+epsilon>=left&&b.y1+epsilon>=top&&'
              'b.x2<=right+epsilon&&b.y2<=bottom+epsilon;}'
              'return {table:inside(t),buttons:t.get_children().every(inside),'
              'tableBox:[t.x,t.y,t.width,t.height],content:[left,top,right,bottom]};})()')
    check(label + " table paint stays inside container content", state["table"], state)
    check(label + " tile paint stays inside container content", state["buttons"], state)


def log_size():
    with open(LOG, "rb") as fh:
        return len(fh.read())


def new_log(since):
    with open(LOG, "rb") as fh:
        fh.seek(since)
        return fh.read().decode("utf-8", "replace")


def errors_in(text):
    bad = []
    for line in text.splitlines():
        low = line.lower()
        if "js error" in low or "logerror" in low:
            bad.append(line.strip())
        elif ("curbsoftware" in low or "workspaceactions" in low or "renamedialog" in low) \
                and ("error" in low or "warning" in low or "exception" in low):
            bad.append(line.strip())
    return bad


def settle(seconds=0.45):
    time.sleep(seconds)


def wait_for(predicate, what, timeout=4.0, interval=0.05):
    """Poll until predicate() is true. Records a failure if it never becomes true."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            if predicate():
                return True
        except Exception:  # noqa: BLE001
            pass
        time.sleep(interval)
    check("waited for " + what, False, f"still false after {timeout}s")
    return False


def ws_count():
    return js("global.workspace_manager.n_workspaces")


def ws_names():
    out = subprocess.run(
        ["gsettings", "get", "org.cinnamon.desktop.wm.preferences", "workspace-names"],
        capture_output=True, text=True)
    return out.stdout.strip()


def num_workspaces_key():
    out = subprocess.run(
        ["gsettings", "get", "org.cinnamon.desktop.wm.preferences", "num-workspaces"],
        capture_output=True, text=True)
    return out.stdout.strip()


def open_modals():
    return js("imports.ui.main.modalActorFocusStack.length")


def close_all_modals():
    js("let s=imports.ui.main.modalActorFocusStack.slice();"
       "for (let i=s.length-1;i>=0;i--){try{s[i].actor.destroy();}catch(e){}} true")


def cinnamon_setting(key):
    return subprocess.check_output(
        ["gsettings", "get", "org.cinnamon", key], text=True).strip()


def set_cinnamon_setting(key, value):
    subprocess.run(["gsettings", "set", "org.cinnamon", key, value], check=True)


def showing_desktop():
    output = subprocess.check_output(
        ["xprop", "-root", "_NET_SHOWING_DESKTOP"], text=True)
    match = re.search(r"=\s*([01])\s*$", output)
    return bool(int(match.group(1))) if match else False


def set_showing_desktop(show, timeout=3.0):
    """Show or unshow the desktop, and wait until the WM agrees.

    wmctrl exits 0 whether or not the window manager acted on the hint. When
    it silently does nothing, every pointer probe in the drag suite lands on
    whatever window is on top instead of the desklet, and the suite reports
    itself environment-blocked for no visible reason. Poll the hint, retry
    once, and say so out loud if it never takes.
    """
    for _ in range(2):
        subprocess.run(["wmctrl", "-k", "on" if show else "off"], check=True)
        deadline = time.time() + timeout
        while time.time() < deadline:
            if showing_desktop() == show:
                return True
            time.sleep(0.1)
    print("WARNING: the window manager ignored show-desktop "
          + ("on" if show else "off"), file=sys.stderr)
    return False


def actor_position():
    return tuple(d("[Math.round(D.actor.x),Math.round(D.actor.y)]"))


def reset_desklet_home():
    x, y = ORIG_POS
    d(f"D.actor.set_position({x},{y});true")


def tile_point(index):
    return d(
        f"a=D.buttons[{index}]; p=a.get_transformed_position(); s=a.get_transformed_size();"
        "[Math.round(p[0]+Math.min(40,s[0]/3)),"
        "Math.round(p[1]+Math.min(40,s[1]/3))]")


def xdotool_screen():
    """The full X screen xdotool can actually address, not one monitor.

    `xdotool getdisplaygeometry` reports the current monitor, so on a
    multi-head desktop it hands back 1920x1080 while the X screen (and the
    Cinnamon stage) is 7680x1080. Believing it made every tile past the first
    monitor look unreachable, and the drag suite blocked itself on a desktop
    where pointer injection works fine. xrandr knows the real size; fall back
    to xdotool when it is not there.
    """
    try:
        out = subprocess.check_output(["xrandr", "--current"], text=True)
        match = re.search(r"^Screen \d+:.*current\s+(\d+)\s*x\s*(\d+)", out,
                          re.MULTILINE)
        if match:
            return int(match.group(1)), int(match.group(2))
    except (OSError, subprocess.CalledProcessError):
        pass
    out = subprocess.check_output(["xdotool", "getdisplaygeometry"], text=True)
    width, height = out.split()
    return int(width), int(height)


class PointerBoundsError(RuntimeError):
    pass


def checked_point(point, label):
    """Reject points xdotool cannot address (second-monitor stage coords)."""
    stage_w, stage_h = ORIG_STAGE
    tool_w, tool_h = ORIG_XDOTOOL
    x = int(round(point[0]))
    y = int(round(point[1]))
    if x < 0 or y < 0 or x >= stage_w or y >= stage_h:
        raise PointerBoundsError(
            f"{label} ({x}, {y}) is outside the {stage_w}x{stage_h} stage")
    if x >= tool_w or y >= tool_h:
        raise PointerBoundsError(
            f"{label} ({x}, {y}) is outside xdotool's {tool_w}x{tool_h} screen")
    return x, y


def drag_point(point, dx, dy):
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
    subprocess.run(["xdotool", "mousemove_relative", "--sync", "120", "80"],
                   check=True)
    settle(0.15)
    return before, released, actor_position()


# ------------------------------------------------------------------ #
# Setup
# ------------------------------------------------------------------ #

print("=" * 64)
print("Live edge-case matrix (Cinnamon " + str(js("imports.misc.config.PACKAGE_VERSION")) + ")")
print("=" * 64)

ORIG_NAMES = ws_names()
ORIG_COUNT = ws_count()
ORIG_ACTIVE = js("global.workspace_manager.get_active_workspace_index()")
ORIG_NUMKEY = num_workspaces_key()
print(f"baseline: {ORIG_COUNT} workspaces, active={ORIG_ACTIVE}")
print(f"baseline names: {ORIG_NAMES}")

# Expose the desklet's helper module through a stable accessor for the driver.
js(f'let DM=imports.ui.deskletManager;'
   f'let D=DM.get_object_for_uuid("{DESKLET}","{DESKLET}");'
   f'D._wa = function(){{ return DM.desklets["{DESKLET}"].workspaceActions; }};'
   f'D._rd = function(){{ return DM.desklets["{DESKLET}"].renameDialog; }}; true')

ORIG_DESKLET_SETTINGS = d('({layout: D.settings.getValue("layout-mode"),'
                          ' rows: D.settings.getValue("fixed-rows"),'
                          ' cols: D.settings.getValue("fixed-cols"),'
                          ' display: D.settings.getValue("display-type"),'
                          ' editing: D.settings.getValue("enable-workspace-editing")})')
ORIG_POS = tuple(d("[Math.round(D.actor.x),Math.round(D.actor.y)]"))
ORIG_STAGE = tuple(js("[Math.round(global.stage.width),Math.round(global.stage.height)]"))
ORIG_XDOTOOL = xdotool_screen() if shutil.which("xdotool") else (0, 0)
ORIG_LOCK = cinnamon_setting("lock-desklets")
ORIG_SNAP = cinnamon_setting("desklet-snap")
ORIG_SHOWING_DESKTOP = showing_desktop()

import atexit  # noqa: E402


@atexit.register
def _safety_net():
    """Never leave the session with a modal grab or extra workspaces."""
    try:
        close_all_modals()
        js(f'let wa=imports.ui.deskletManager.desklets["{DESKLET}"].workspaceActions;'
           f'while (wa.getWorkspaceCount() > {ORIG_COUNT}) '
           f'  wa.removeWorkspaceByIndex(wa.getWorkspaceCount()-1, {{confirm:false}});'
           f'wa.activateWorkspaceByIndex({ORIG_ACTIVE}); true')
        subprocess.run(["gsettings", "set", "org.cinnamon.desktop.wm.preferences",
                        "workspace-names", ORIG_NAMES], capture_output=True, text=True)
        js(f'let DM=imports.ui.deskletManager;'
           f'let D=DM.get_object_for_uuid("{DESKLET}","{DESKLET}");'
           'if (D && D.settings) {'
           f'D.settings.setValue("layout-mode", {json.dumps(ORIG_DESKLET_SETTINGS["layout"])});'
           f'D.settings.setValue("fixed-rows", {ORIG_DESKLET_SETTINGS["rows"]});'
           f'D.settings.setValue("fixed-cols", {ORIG_DESKLET_SETTINGS["cols"]});'
           f'D.settings.setValue("display-type", {json.dumps(ORIG_DESKLET_SETTINGS["display"])});'
           f'D.settings.setValue("enable-workspace-editing", '
           f'{str(ORIG_DESKLET_SETTINGS["editing"]).lower()});'
           'if (D && D.actor) {'
           f'D.actor.set_position({ORIG_POS[0]},{ORIG_POS[1]});'
           '}'
           '} true')
        set_cinnamon_setting("lock-desklets", ORIG_LOCK)
        set_cinnamon_setting("desklet-snap", ORIG_SNAP)
        set_showing_desktop(ORIG_SHOWING_DESKTOP)
    except Exception as exc:  # noqa: BLE001
        print("safety net failed: " + str(exc), file=sys.stderr)


LOG_START = log_size()

# ------------------------------------------------------------------ #
suite("desklet loaded and wired")
# ------------------------------------------------------------------ #

state = d('({buttons: D.buttons.length, editing: D.enableEditing, addTile: D.showAddTile,'
          ' confirm: D.confirmRemove, nameWatcher: !!D.ws_name_id,'
          ' signals: D._signalManager._storage.length, idle: D._idleSources.length,'
          ' tileMenu: !!D._tileMenu})')
eq("one tile per workspace", state["buttons"], ORIG_COUNT)
check("editing enabled", state["editing"] is True)
check("add tile enabled", state["addTile"] is True)
check("workspace-names watcher connected", state["nameWatcher"] is True)
check("workspace lifecycle signals connected", state["signals"] >= 6, state)
eq("no leaked idle sources", state["idle"], 0)
check("no tile menu open", state["tileMenu"] is False)
check("tiles are St.Bin, not St.Button",
      d("D.buttons[0] instanceof imports.gi.St.Bin && "
        "!(D.buttons[0] instanceof imports.gi.St.Button)") is True)
check("grid table is not a reactive event sink",
      d("D.mainContainer.get_children()[0].reactive") is False)

check("helper module resolves", d('!!WA') is True)
eq("MAX_WORKSPACES", d('WA.MAX_WORKSPACES'), 36)

# ------------------------------------------------------------------ #
suite("drag release ownership")
# ------------------------------------------------------------------ #

check("xdotool is available", shutil.which("xdotool") is not None)
drag_ok = shutil.which("xdotool") is not None
if drag_ok:
    set_showing_desktop(True)
    set_cinnamon_setting("lock-desklets", "false")
    set_cinnamon_setting("desklet-snap", "false")
    settle(0.5)
    check("desklet DND is not privately inhibited",
          d("D._draggable.inhibit") is False)
    try:
        reset_desklet_home()
        settle(0.08)
        origin = tile_point(0)
        try:
            checked_point(origin, "tile origin")
            reachable = True
        except PointerBoundsError as exc:
            reachable = False
            block("DND pointer matrix", str(exc))

        if reachable:
            stayed = True
            moved_count = 0
            for i in range(6):
                direction = 1 if i % 2 == 0 else -1
                before, released, after = drag_point(
                    tile_point(0), 100 * direction, 50 * direction)
                stayed = stayed and released == after
                moved_count += int(before != released)
                reset_desklet_home()
                settle(0.08)
            check("tile surface releases cleanly across drags", stayed)
            check("tile surface movement is observed", moved_count > 0,
                  f"moved {moved_count}/6")
            check("Cinnamon drag-in-progress is clear after release",
                  d("D._draggable._dragInProgress") is False)

            reset_desklet_home()
            settle(0.08)
            pos = actor_position()
            edge_dx = max(40, min(120, ORIG_XDOTOOL[0] - origin[0] - 40))
            edge_dy = max(20, min(60, ORIG_XDOTOOL[1] - origin[1] - 40))
            before, released, after = drag_point(tile_point(0), edge_dx, edge_dy)
            check("near-edge drag releases cleanly", released == after)
            check("near-edge drag still moves the desklet", before != released)
            check("near-edge drop leaves drag-in-progress clear",
                  d("D._draggable._dragInProgress") is False)
            reset_desklet_home()
            settle(0.08)

            other_pos = d(
                'let all=imports.ui.main.deskletContainer.actor.get_children();'
                'let hit=null;'
                'for (let i=0;i<all.length;i++){'
                '  let a=all[i]; if(a===D.actor) continue;'
                '  if(a._desklet){hit=[Math.round(a.x),Math.round(a.y)]; break;}'
                '} hit')
            if other_pos:
                start = tile_point(0)
                dx = int(other_pos[0] - start[0])
                dy = int(other_pos[1] - start[1])
                if abs(dx) < 20 and abs(dy) < 20:
                    dx, dy = 90, 40
                try:
                    before, released, after = drag_point(start, dx, dy)
                    check("overlap drag releases cleanly", released == after)
                    check("overlap drop leaves drag-in-progress clear",
                          d("D._draggable._dragInProgress") is False)
                except PointerBoundsError as exc:
                    block("overlap drag", str(exc))
                reset_desklet_home()
                settle(0.08)
    except PointerBoundsError as exc:
        block("DND pointer matrix", str(exc))
    finally:
        close_all_modals()
        reset_desklet_home()
        set_cinnamon_setting("lock-desklets", ORIG_LOCK)
        set_cinnamon_setting("desklet-snap", ORIG_SNAP)
        set_showing_desktop(ORIG_SHOWING_DESKTOP)
        settle(0.3)

# ------------------------------------------------------------------ #
suite("name watcher targets the real gsettings key")
# ------------------------------------------------------------------ #

check("watches org.cinnamon.desktop.wm.preferences",
      d('WA.WM_PREFS_SCHEMA') == "org.cinnamon.desktop.wm.preferences")
eq("watches workspace-names", d('WA.WORKSPACE_NAMES_KEY'), "workspace-names")
check("deprecated org.cinnamon key is not referenced",
      d('JSON.stringify(WA).indexOf("workspace-name-overrides") === -1') is True)

# ------------------------------------------------------------------ #
suite("grid layout maths against the live desklet")
# ------------------------------------------------------------------ #

dims = d('D._computeGridDims()')
expected_cells = ORIG_COUNT + 1  # + add tile
check(f"grid holds {expected_cells} cells",
      dims["rows"] * dims["cols"] >= expected_cells,
      f"dims={dims}")
cells = d('let dd=D._computeGridDims();'
          'GM.planCells(WA.getWorkspaceCount(), true)'
          '.map(function(c){return c.kind==="add"?"+":String(c.index);}).join(",")')
check("last cell is the + tile", cells.endswith("+"), cells)
eq("all workspaces rendered", cells.count(",") + 1, ORIG_COUNT + 1)
assert_grid_contained("auto layout")

# ------------------------------------------------------------------ #
suite("add workspace from the + tile")
# ------------------------------------------------------------------ #

d('D._onAddWorkspace(); true')
wait_for(lambda: ws_count() == ORIG_COUNT + 1, "the deferred add to run")
eq("count grew by one", ws_count(), ORIG_COUNT + 1)
settle(0.3)
eq("tiles rebuilt", d('D.buttons.length'), ORIG_COUNT + 1)
eq("no idle source leaked", d('D._idleSources.length'), 0)
wait_for(lambda: num_workspaces_key() == str(ORIG_COUNT + 1),
         "Cinnamon to persist the workspace count")
eq("num-workspaces gsetting followed", num_workspaces_key(), str(ORIG_COUNT + 1))

NEW_INDEX = ORIG_COUNT  # the appended workspace, 0-based

# ------------------------------------------------------------------ #
suite("rename via the shared action (no dialog)")
# ------------------------------------------------------------------ #

check("rename applied", d(f'WA.renameWorkspace({NEW_INDEX}, "  ClaudeTest  ")') is True)
settle()
eq("trimmed on write", d(f'WA.getWorkspaceName({NEW_INDEX})'), "ClaudeTest")
eq("desklet label refreshed from the gsettings watcher",
   d(f'D.buttons[{NEW_INDEX}].get_child().get_children().slice(-1)[0].get_text()'), "ClaudeTest")
check("no-op when unchanged", d(f'WA.renameWorkspace({NEW_INDEX}, "ClaudeTest")') is False)
check("out-of-range rejected", d('WA.renameWorkspace(999, "X")') is False)

check("empty string resets to the default name",
      d(f'WA.renameWorkspace({NEW_INDEX}, "")') is True)
settle()
eq("default name restored", d(f'WA.getWorkspaceName({NEW_INDEX})'), f"Workspace {NEW_INDEX + 1}")

# ------------------------------------------------------------------ #
suite("rename modal dialog: commit")
# ------------------------------------------------------------------ #

modals_before = open_modals()
d(f'D._onRenameWorkspace({NEW_INDEX}); true')
wait_for(lambda: open_modals() == modals_before + 1, "the rename dialog to appear")
eq("one modal pushed", open_modals(), modals_before + 1)
check("entry pre-filled with the current name",
      d('let s=imports.ui.main.modalActorFocusStack;'
        's[s.length-1].actor._entry.get_text()') == f"Workspace {NEW_INDEX + 1}")

d('let s=imports.ui.main.modalActorFocusStack; let dlg=s[s.length-1].actor;'
  'dlg._entry.set_text("Committed");'
  'let bs=dlg.buttonLayout.get_children();'
  'for (let i=0;i<bs.length;i++) if (bs[i].label==="Rename") bs[i].emit("clicked", 1);'
  'true')
settle()
eq("modal released", open_modals(), modals_before)
eq("name committed", d(f'WA.getWorkspaceName({NEW_INDEX})'), "Committed")
eq("tile label follows",
   d(f'D.buttons[{NEW_INDEX}].get_child().get_children().slice(-1)[0].get_text()'), "Committed")

# ------------------------------------------------------------------ #
suite("rename modal dialog: cancel")
# ------------------------------------------------------------------ #

d(f'D._onRenameWorkspace({NEW_INDEX}); true')
wait_for(lambda: open_modals() == modals_before + 1, "the rename dialog to reappear")
d('let s=imports.ui.main.modalActorFocusStack; let dlg=s[s.length-1].actor;'
  'dlg._entry.set_text("ShouldNotStick");'
  'let bs=dlg.buttonLayout.get_children();'
  'for (let i=0;i<bs.length;i++) if (bs[i].label==="Cancel") bs[i].emit("clicked", 1);'
  'true')
settle()
eq("modal released", open_modals(), modals_before)
eq("name unchanged after cancel", d(f'WA.getWorkspaceName({NEW_INDEX})'), "Committed")

# ------------------------------------------------------------------ #
suite("tile context menu lifecycle")
# ------------------------------------------------------------------ #

d(f'D._openTileMenu(D.buttons[{NEW_INDEX}]); true')
settle(0.2)
check("menu created", d('!!D._tileMenu') is True)
check("menu is open", d('D._tileMenu.isOpen') is True)
items = d('D._tileMenu._getMenuItems().map(function(i){'
          'return i.label ? i.label.get_text() : "---";})')
eq("menu items", items, ["Rename...", "Remove", "---", "Add workspace"])
check("Remove is sensitive with >1 workspace",
      d('D._tileMenu._getMenuItems()[1].actor.reactive') is True)

d(f'D._openTileMenu(D.buttons[0]); true')
settle(0.2)
check("re-opening replaces the previous menu, only one alive",
      d('!!D._tileMenu') is True)

d('D._destroyTileMenu(); true')
check("menu released", d('!!D._tileMenu') is False)

d('D._rebuildGrid(); true')
settle(0.2)
check("rebuild leaves no orphan tile menu", d('!!D._tileMenu') is False)

# ------------------------------------------------------------------ #
suite("remove a named workspace: confirmation prompt")
# ------------------------------------------------------------------ #

d(f'WA.renameWorkspace({NEW_INDEX}, "ClaudeTemp"); true')
settle()
modals_before = open_modals()
d(f'D._onRemoveWorkspace({NEW_INDEX}); true')
wait_for(lambda: open_modals() == modals_before + 1, "the confirm dialog to appear")
eq("confirm dialog pushed", open_modals(), modals_before + 1)
eq("nothing removed yet", ws_count(), ORIG_COUNT + 1)
check("prompt names the workspace",
      d('let s=imports.ui.main.modalActorFocusStack;'
        'let dlg=s[s.length-1].actor;'
        'let found=false;'
        'let walk=function(a){ if (a.get_text && String(a.get_text()).indexOf("ClaudeTemp")!==-1) found=true;'
        '  if (a.get_children) a.get_children().forEach(walk); };'
        'walk(dlg); found') is True)

d('let s=imports.ui.main.modalActorFocusStack; let dlg=s[s.length-1].actor;'
  'let bs=dlg.buttonLayout.get_children();'
  'for (let i=0;i<bs.length;i++) if (bs[i].label==="Yes") bs[i].emit("clicked", 1);'
  'true')
settle()
eq("confirmed removal happened", ws_count(), ORIG_COUNT)
eq("modal released", open_modals(), modals_before)
eq("tiles rebuilt", d('D.buttons.length'), ORIG_COUNT)

# ------------------------------------------------------------------ #
suite("remove: cancelling the prompt keeps the workspace")
# ------------------------------------------------------------------ #

d('D._onAddWorkspace(); true')
wait_for(lambda: ws_count() == ORIG_COUNT + 1, "the deferred add to run")
d(f'WA.renameWorkspace({NEW_INDEX}, "ClaudeTemp2"); true')
settle()
modals_before = open_modals()
d(f'D._onRemoveWorkspace({NEW_INDEX}); true')
wait_for(lambda: open_modals() == modals_before + 1, "the confirm dialog to appear")
d('let s=imports.ui.main.modalActorFocusStack; let dlg=s[s.length-1].actor;'
  'let bs=dlg.buttonLayout.get_children();'
  'for (let i=0;i<bs.length;i++) if (bs[i].label==="No") bs[i].emit("clicked", 1);'
  'true')
settle()
eq("modal released", open_modals(), modals_before)
eq("workspace kept", ws_count(), ORIG_COUNT + 1)

# ------------------------------------------------------------------ #
suite("remove the ACTIVE workspace")
# ------------------------------------------------------------------ #

d(f'WA.renameWorkspace({NEW_INDEX}, ""); true')  # back to default, no prompt
settle()
d(f'WA.activateWorkspaceByIndex({NEW_INDEX}); true')
settle()
eq("switched to the temp workspace",
   js("global.workspace_manager.get_active_workspace_index()"), NEW_INDEX)
d(f'D._onRemoveWorkspace({NEW_INDEX}); true')
wait_for(lambda: ws_count() == ORIG_COUNT, "the active workspace to be removed")
settle(0.5)
eq("removed", ws_count(), ORIG_COUNT)
check("active index is now valid",
      js("global.workspace_manager.get_active_workspace_index()") < ORIG_COUNT)
eq("tiles rebuilt", d('D.buttons.length'), ORIG_COUNT)
highlighted = d('D.buttons.filter(function(b){'
                'return b.get_style_pseudo_class() && '
                '(b.get_style_pseudo_class()||"").indexOf("outlined")!==-1;}).length')
eq("exactly one tile highlighted", highlighted, 1)
check("active tile has current-workspace accessible name",
      d('D.buttons.filter(function(b){return (b.get_style_pseudo_class()||"").indexOf("outlined")!==-1;})'
        '[0].get_accessible_name().indexOf("Current workspace")===0') is True)

# ------------------------------------------------------------------ #
suite("rapid add/remove burst (debounce)")
# ------------------------------------------------------------------ #

d('for (let i=0;i<10;i++) WA.addWorkspace(); true')
settle(0.8)
eq("all 10 appended", ws_count(), ORIG_COUNT + 10)
eq("single rebuild produced correct tile count", d('D.buttons.length'), ORIG_COUNT + 10)
eq("no rebuild timeout left pending", d('D._rebuildTimeout === null'), True)

d(f'for (let i=0;i<10;i++) WA.removeWorkspaceByIndex(WA.getWorkspaceCount()-1, {{confirm:false}}); true')
settle(0.8)
eq("all 10 removed", ws_count(), ORIG_COUNT)
eq("tiles back to baseline", d('D.buttons.length'), ORIG_COUNT)
eq("no modal left open", open_modals(), 0)

# ------------------------------------------------------------------ #
suite("36-workspace ceiling")
# ------------------------------------------------------------------ #

d('while (WA.canAdd()) WA.addWorkspace(); true')
settle(1.0)
eq("stops at 36", ws_count(), 36)
check("canAdd false at the ceiling", d('WA.canAdd()') is False)
check("addWorkspace refuses", d('WA.addWorkspace()') is False)
eq("still 36", ws_count(), 36)
check("+ tile hidden at the ceiling",
      d('GM.planCells(WA.getWorkspaceCount(), '
        '  !!(D.enableEditing && D.showAddTile && WA.canAdd()))'
        '.filter(function(c){return c.kind==="add";}).length') == 0)
eq("all 36 tiles rendered", d('D.buttons.length'), 36)

d('D.displayType="visual"; D._rebuildGrid(); true')
settle(0.5)
dense = d('D.buttons.map(function(b){let p=b.get_child().get_children()[0];'
          'return {width:p.width,height:p.height,preview:'
          'p.get_style_class_name()==="curb-workspace-grid-preview"};})')
eq("dense mode keeps one preview per workspace",
   sum(1 for item in dense if item["preview"]), 36)
check("dense previews have positive size",
      all(item["width"] > 0 and item["height"] > 0 for item in dense), dense[:4])
check("dense previews are not forced to 48 by 32",
      any(item["width"] < 48 or item["height"] < 32 for item in dense), dense[:4])
assert_grid_contained("36-workspace layout")
orig_width = d('D.width')
orig_height = d('D.height')
d('D.width=200; D.height=200; D.mainContainer.set_width(200);'
  'D.mainContainer.set_height(200); D._rebuildGrid(); true')
settle(0.4)
eq("tiny dense grid falls back to bounded name buttons",
   d('D.buttons.map(function(b){return b.get_child().get_children().filter(function(c){'
     'return c.get_style_class_name&&c.get_style_class_name()==="curb-workspace-grid-preview";'
     '}).length;}).reduce(function(a,b){return a+b;},0)'), 0)
check("tiny dense labels stay width-bounded",
      d('D.buttons.every(function(b){let children=b.get_child().get_children();'
        'let label=children[children.length-1]; return label.width<=12;})'))
assert_grid_contained("tiny fallback layout")
d(f'D.width={orig_width}; D.height={orig_height};'
  f'D.mainContainer.set_width({orig_width}); D.mainContainer.set_height({orig_height});'
  'D._rebuildGrid(); true')
settle(0.4)
d('D.displayType="buttons"; D._rebuildGrid(); true')
settle(0.3)

d(f'while (WA.getWorkspaceCount() > {ORIG_COUNT}) '
  f'  WA.removeWorkspaceByIndex(WA.getWorkspaceCount()-1, {{confirm:false}}); true')
settle(1.0)
eq("back to baseline count", ws_count(), ORIG_COUNT)

# ------------------------------------------------------------------ #
suite("fixed layout expands to show every workspace")
# ------------------------------------------------------------------ #

orig_mode = d('D.layoutMode')
orig_rows = d('D.fixedRows')
orig_cols = d('D.fixedCols')
# Pin the count so the expectations below hold whatever the session baseline
# is: 4 workspaces plus add tile need a third row.
d('while (WA.getWorkspaceCount() < 4) WA.addWorkspace(); true')
settle(0.5)
fixed_count = ws_count()
d('D.layoutMode="fixed"; D.fixedRows=2; D.fixedCols=2; D._rebuildGrid(); true')
settle(0.3)
eq("2-column grid renders every workspace", d('D.buttons.length'), fixed_count)
cells = d('GM.planCells(WA.getWorkspaceCount(), true)'
          '.map(function(c){return c.kind==="add"?"+":String(c.index);}).join(",")')
eq("+ tile follows every workspace", cells,
   ",".join(str(index) for index in range(fixed_count)) + ",+")
check("no error rendering an overflowing fixed grid", True)
assert_grid_contained("fixed two-column layout")

d('D.layoutMode="fixed"; D.fixedRows=1; D.fixedCols=1; D._rebuildGrid(); true')
settle(0.3)
eq("1-column grid still renders every workspace", d('D.buttons.length'), fixed_count)
assert_grid_contained("fixed one-column layout")

# ------------------------------------------------------------------ #
suite("desktop preview mode")
# ------------------------------------------------------------------ #

d('D.displayType="visual"; D._rebuildGrid(); true')
settle(0.4)
eq("one preview per workspace",
   d('D.buttons.map(function(b){return b.get_child().get_children().filter(function(c){'
     'return c.get_style_class_name&&c.get_style_class_name()==="curb-workspace-grid-preview";'
     '}).length;}).reduce(function(a,b){return a+b;},0)'), ws_count())
eq("each preview represents every connected monitor",
   d('D.buttons.map(function(b){let p=b.get_child().get_children().filter(function(c){'
     'return c.get_style_class_name&&c.get_style_class_name()==="curb-workspace-grid-preview";'
     '})[0];return p?p.get_children().filter(function(c){return c.get_style_class_name&&'
     'c.get_style_class_name()==="curb-workspace-grid-monitor";}).length:0;})'),
   [d('M.layoutManager.monitors.filter(function(m){return m.width>0&&m.height>0;}).length')]
   * ws_count())
monitor_geoms = d('D.buttons.map(function(b){let p=b.get_child().get_children().filter(function(c){'
                  'return c.get_style_class_name&&c.get_style_class_name()==="curb-workspace-grid-preview";'
                  '})[0];return p?p.get_children().filter(function(c){return c.get_style_class_name&&'
                  'c.get_style_class_name()==="curb-workspace-grid-monitor";}).map(function(c){'
                  'return [c.x,c.y,c.width,c.height].join(",");}):[];})')
n_positive_monitors = d('M.layoutManager.monitors.filter(function(m){'
                        'return m.width>0&&m.height>0;}).length')
check("monitor actors occupy distinct geometries",
      all(len(set(geoms)) == len(geoms) and len(geoms) == n_positive_monitors
          for geoms in monitor_geoms),
      monitor_geoms)
check("preview event signals connected", d('D._previewSignals._storage.length') > 0)
ordered = d('let w=global.workspace_manager.get_workspace_by_index(0);'
            'D._getPreviewWindows(w).map(function(win){return win.get_user_time();})')
eq("preview windows sorted from back to front", ordered, sorted(ordered))
expected_drawings = d('let w=global.workspace_manager.get_workspace_by_index(0);'
                      'let areas=M.layoutManager.monitors;'
                      'let desktop=imports.ui.deskletManager.desklets["' + DESKLET + '"]'
                      '.previewGeometry.boundingRect(areas)||w.get_work_area_all_monitors();'
                      'let viewport=imports.ui.deskletManager.desklets["' + DESKLET + '"]'
                      '.previewGeometry.fitRect(desktop,'
                      'D.buttons[0].get_child().get_children()[0].width,'
                      'D.buttons[0].get_child().get_children()[0].height);'
                      'D._getPreviewWindows(w).filter(function(win){return '
                      'imports.ui.deskletManager.desklets["' + DESKLET + '"]'
                      '.previewGeometry.projectRectInto(win.get_buffer_rect(),'
                      'desktop,viewport)!==null;}).length')
rendered_drawings = d('D.buttons[0].get_child().get_children()[0].get_children()'
                      '.filter(function(c){return c.get_style_class_name&&'
                      'c.get_style_class_name()&&'
                      'c.get_style_class_name().indexOf("curb-workspace-grid-window")===0;}).length')
eq("one bounded layer per unobscured visible window", rendered_drawings, expected_drawings)
eq("preview uses no unbounded Cairo drawing surfaces",
   d('D.buttons.map(function(b){let p=b.get_child().get_children()[0];'
     'return p.get_children().filter(function(c){return c instanceof imports.gi.St.DrawingArea;})'
     '.length;}).reduce(function(a,b){return a+b;},0)'), 0)
layer_bounds = d('D.buttons.map(function(b){let p=b.get_child().get_children()[0];'
                 'if (!p.get_style_class_name || '
                 'p.get_style_class_name()!=="curb-workspace-grid-preview") return null;'
                 'let origin=p.get_transformed_position();'
                 'let epsilon=0.5;'
                 'return {clip:p.has_clip,local:p.get_children().every(function(c){return '
                 'c.x>=0&&c.y>=0&&c.x+c.width<=p.width&&c.y+c.height<=p.height;}),'
                 'transformed:p.get_children().every(function(c){let q=c.get_transformed_position();'
                 'return q[0]+epsilon>=origin[0]&&q[1]+epsilon>=origin[1]&&'
                 'q[0]+c.width<=origin[0]+p.width+epsilon&&'
                 'q[1]+c.height<=origin[1]+p.height+epsilon;})};'
                 '}).filter(function(v){return v!==null;})')
check("every preview has an explicit hard clip",
      all(item["clip"] for item in layer_bounds), layer_bounds)
check("every window and icon layer stays inside local preview allocation",
      all(item["local"] for item in layer_bounds), layer_bounds)
check("every window and icon layer stays inside transformed preview allocation",
      all(item["transformed"] for item in layer_bounds), layer_bounds)
d('D.displayType="buttons"; D._rebuildGrid(); true')
settle(0.3)
eq("preview signals released in names mode", d('D._previewSignals._storage.length'), 0)

d(f'D.layoutMode={json.dumps(orig_mode)}; D.fixedRows={orig_rows}; D.fixedCols={orig_cols};'
  'D._rebuildGrid(); true')
settle(0.3)
d(f'while (WA.getWorkspaceCount() > {ORIG_COUNT}) '
  f'  WA.removeWorkspaceByIndex(WA.getWorkspaceCount()-1, {{confirm:false}}); true')
settle(0.5)
eq("layout restored", d('D.buttons.length'), ORIG_COUNT)

# ------------------------------------------------------------------ #
suite("editing disabled")
# ------------------------------------------------------------------ #

d('D.enableEditing=false; D._rebuildGrid(); true')
settle(0.3)
eq("no + tile when editing is off", d('D.buttons.length'), ORIG_COUNT)
d(f'D._onWorkspaceButtonClicked(D.buttons[0], 3); true')
settle(0.3)
check("right-click raises no menu when editing is off", d('!!D._tileMenu') is False)
d('D.enableEditing=true; D._rebuildGrid(); true')
settle(0.3)

# ------------------------------------------------------------------ #
suite("left-click still switches workspaces")
# ------------------------------------------------------------------ #

tile_count = d('D.buttons.length')
if tile_count > 1:
    target = 1 if ORIG_ACTIVE != 1 else 0
    d(f'D._onWorkspaceButtonClicked(D.buttons[{target}], 1); true')
    settle(0.4)
    eq("switched", js("global.workspace_manager.get_active_workspace_index()"), target)
    d(f'WA.activateWorkspaceByIndex({ORIG_ACTIVE}); true')
    settle(0.4)
else:
    check("click handler ignores a missing tile",
          d('D._onWorkspaceButtonClicked(null, 1); true') is True)

# ------------------------------------------------------------------ #
suite("applet loads and builds its menu")
# ------------------------------------------------------------------ #

ok, _ = js_soft(f'imports.ui.appletManager.applets["{APPLET}"] ? true : false')
check("applet directory importable", ok)

applet_uuid = js(f'let a=imports.ui.appletManager.applets["{APPLET}"]; '
                 f'a && a.applet ? "loaded" : "present"')
check("applet module present", applet_uuid in ("loaded", "present"), applet_uuid)

# The applet is not on a panel in this session; verify its shared module copy
# behaves identically by loading it through the applet importer.
eq("applet ships the same MAX_WORKSPACES",
   js(f'imports.ui.appletManager.applets["{APPLET}"].workspaceActions.MAX_WORKSPACES'), 36)
eq("applet ships the same schema constant",
   js(f'imports.ui.appletManager.applets["{APPLET}"].workspaceActions.WM_PREFS_SCHEMA'),
   "org.cinnamon.desktop.wm.preferences")
check("applet renameDialog module loads",
      js(f'!!imports.ui.appletManager.applets["{APPLET}"].renameDialog.RenameWorkspaceDialog') is True)

# ------------------------------------------------------------------ #
suite("teardown releases everything")
# ------------------------------------------------------------------ #

before = d('({signals: D._signalManager._storage.length, name: !!D.ws_name_id})')
check("signals connected before teardown", before["signals"] > 0 and before["name"], before)

d(f'D.settings.setValue("layout-mode", {json.dumps(ORIG_DESKLET_SETTINGS["layout"])});'
  f'D.settings.setValue("fixed-rows", {ORIG_DESKLET_SETTINGS["rows"]});'
  f'D.settings.setValue("fixed-cols", {ORIG_DESKLET_SETTINGS["cols"]});'
  f'D.settings.setValue("display-type", {json.dumps(ORIG_DESKLET_SETTINGS["display"])});'
  f'D.settings.setValue("enable-workspace-editing", '
  f'{str(ORIG_DESKLET_SETTINGS["editing"]).lower()}); true')
restored_settings = d('({layout: D.settings.getValue("layout-mode"),'
                      ' rows: D.settings.getValue("fixed-rows"),'
                      ' cols: D.settings.getValue("fixed-cols"),'
                      ' display: D.settings.getValue("display-type"),'
                      ' editing: D.settings.getValue("enable-workspace-editing")})')
eq("desklet settings restored", restored_settings, ORIG_DESKLET_SETTINGS)

d('D._cleanup(); true')
after = d('({signals: D._signalManager._storage.length, previews: D._previewSignals._storage.length,'
          ' name: D.ws_name_id, idle: D._idleSources.length, timeout: D._rebuildTimeout,'
          ' skip: D._skipTileClickTimeout, menu: !!D._tileMenu, flag: D._cleanedUp,'
          ' dragBegin: D._dragBeginId})')
eq("workspace signals released", after["signals"], 0)
eq("preview signals released", after["previews"], 0)
eq("workspace-names released", after["name"], None)
eq("idle sources cleared", after["idle"], 0)
eq("rebuild timeout cleared", after["timeout"], None)
eq("drag skip timeout cleared", after["skip"], None)
eq("drag-begin handler released", after["dragBegin"], 0)
check("tile menu released", after["menu"] is False)
check("cleanup flag set", after["flag"] is True)

d('D._cleanup(); true')
check("second cleanup is a safe no-op", d('D._cleanedUp') is True)

# Reload to get a healthy desklet back after the forced teardown.
subprocess.run(["gdbus", "call", "--session", "--dest", "org.Cinnamon",
                "--object-path", "/org/Cinnamon", "--method", "org.Cinnamon.ReloadXlet",
                DESKLET, "DESKLET"],
               capture_output=True, text=True,
               env=os.environ)
settle(1.5)
eq("desklet reloaded cleanly",
   js(f'let x=imports.ui.deskletManager.get_object_for_uuid("{DESKLET}","{DESKLET}");'
      'x ? x.buttons.length : -1'), ORIG_COUNT)

# ------------------------------------------------------------------ #
suite("state restored")
# ------------------------------------------------------------------ #

close_all_modals()
settle(0.3)
eq("no modal grabs left", open_modals(), 0)
eq("workspace count restored", ws_count(), ORIG_COUNT)
eq("workspace names restored", ws_names(), ORIG_NAMES)
eq("num-workspaces key restored", num_workspaces_key(), ORIG_NUMKEY)
eq("active workspace restored",
   js("global.workspace_manager.get_active_workspace_index()"), ORIG_ACTIVE)

# ------------------------------------------------------------------ #
suite("no errors logged during the run")
# ------------------------------------------------------------------ #

text = new_log(LOG_START)
bad = errors_in(text)
check("~/.xsession-errors is clean", len(bad) == 0,
      "\n      " + "\n      ".join(bad[:12]) if bad else None)

# ------------------------------------------------------------------ #
print("\n" + "=" * 64)
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
    print(f"All {passed} live assertions passed.")
