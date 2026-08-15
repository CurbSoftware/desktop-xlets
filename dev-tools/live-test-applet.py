#!/usr/bin/env python3
"""
Live test for the Workspace Name applet: temporarily adds it to a panel,
exercises its menu and actions, then restores org.cinnamon enabled-applets to
its exact original value.
"""
import ast
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cinnamon_eval import ev  # noqa: E402

APPLET = "cinnamon-workspace-name-applet@curbsoftware"
INSTANCE = 907
PANEL_ENTRY = f"panel2:right:9:{APPLET}:{INSTANCE}"
LOG = os.path.expanduser("~/.xsession-errors")

passed = 0
failures = []
suite_name = ""


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


def eq(label, actual, expected):
    check(label, actual == expected, f"got {actual!r}, want {expected!r}")


def js(code):
    ok, value = ev(code)
    if not ok:
        raise RuntimeError("JS error: " + value)
    return json.loads(value) if value else None


PRE = (f'let AM=imports.ui.appletManager;'
       # applet_id is a string in appletManager.definitions and the lookup uses
       # ===, so match on the uuid instead of the numeric instance id.
       f'let A=AM.get_object_for_uuid("{APPLET}", "{APPLET}");'
       f'let WA=AM.applets["{APPLET}"].workspaceActions;')


def a(code):
    return js(PRE + code)


def gs_get(schema, key):
    return subprocess.run(["gsettings", "get", schema, key],
                          capture_output=True, text=True).stdout.strip()


def gs_set(schema, key, value):
    subprocess.run(["gsettings", "set", schema, key, value],
                   capture_output=True, text=True)


def ws_count():
    return js("global.workspace_manager.n_workspaces")


def open_modals():
    return js("imports.ui.main.modalActorFocusStack.length")


def close_all_modals():
    js("let s=imports.ui.main.modalActorFocusStack.slice();"
       "for (let i=s.length-1;i>=0;i--){try{s[i].actor.destroy();}catch(e){}} true")


def wait_for(predicate, what, timeout=6.0, interval=0.05):
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
    return bad


# ------------------------------------------------------------------ #
print("=" * 64)
print("Live applet test")
print("=" * 64)

ORIG_APPLETS = gs_get("org.cinnamon", "enabled-applets")
ORIG_NAMES = gs_get("org.cinnamon.desktop.wm.preferences", "workspace-names")
ORIG_COUNT = ws_count()
ORIG_ACTIVE = js("global.workspace_manager.get_active_workspace_index()")
print(f"baseline: {ORIG_COUNT} workspaces, active={ORIG_ACTIVE}")

import atexit  # noqa: E402


@atexit.register
def _restore():
    try:
        close_all_modals()
        js(f'let wa=imports.ui.appletManager.applets["{APPLET}"].workspaceActions;'
           f'while (wa.getWorkspaceCount() > {ORIG_COUNT}) '
           f'  wa.removeWorkspaceByIndex(wa.getWorkspaceCount()-1, {{confirm:false}});'
           f'wa.activateWorkspaceByIndex({ORIG_ACTIVE}); true')
    except Exception as exc:  # noqa: BLE001
        print("workspace restore failed: " + str(exc), file=sys.stderr)
    gs_set("org.cinnamon", "enabled-applets", ORIG_APPLETS)
    gs_set("org.cinnamon.desktop.wm.preferences", "workspace-names", ORIG_NAMES)
    print("\nrestored enabled-applets and workspace names")


LOG_START = log_size()

# ------------------------------------------------------------------ #
suite("applet loads onto a panel")
# ------------------------------------------------------------------ #

applets = ast.literal_eval(ORIG_APPLETS)
gs_set("org.cinnamon", "enabled-applets", str(applets + [PANEL_ENTRY]))
wait_for(lambda: a("!!A") is True, "the applet to appear on panel2")
check("applet instance is live", a("!!A") is True)

state = a('({label: A._applet_label.get_text(), editing: A.enableEditing,'
          ' confirm: A.confirmRemove, nameWatcher: !!A._wsNameId,'
          ' idle: A._idleSources.length})')
eq("label shows the active workspace name", state["label"],
   js(f"imports.ui.main.getWorkspaceName({ORIG_ACTIVE})"))
check("editing enabled by default", state["editing"] is True)
check("confirm-remove enabled by default", state["confirm"] is True)
check("workspace-names watcher connected", state["nameWatcher"] is True)
eq("no leaked idle sources", state["idle"], 0)

# ------------------------------------------------------------------ #
suite("menu contents")
# ------------------------------------------------------------------ #

a('A.updateMenu(); true')
items = a('A.menu._getMenuItems().map(function(i){'
          'return i.label ? i.label.get_text() : "---";})')
eq("one row per workspace plus the management block",
   len(items), ORIG_COUNT + 4)
eq("management items appended", items[-4:],
   ["---", "Rename current workspace…", "Remove current workspace", "Add workspace"])
eq("first row is workspace 1", items[0],
   js("imports.ui.main.getWorkspaceName(0)"))
check("Remove is sensitive with more than one workspace",
      a('A.menu._getMenuItems()[A.menu._getMenuItems().length-2].actor.reactive') is True)
check("Add is sensitive below the ceiling",
      a('A.menu._getMenuItems()[A.menu._getMenuItems().length-1].actor.reactive') is True)

a('A.enableEditing=false; A.updateMenu(); true')
eq("management block hidden when editing is off",
   a('A.menu._getMenuItems().length'), ORIG_COUNT)
a('A.enableEditing=true; A.updateMenu(); true')

# ------------------------------------------------------------------ #
suite("add workspace from the applet menu")
# ------------------------------------------------------------------ #

a('A._onAddWorkspace(); true')
wait_for(lambda: ws_count() == ORIG_COUNT + 1, "the deferred add to run")
eq("workspace appended", ws_count(), ORIG_COUNT + 1)
eq("no idle source leaked", a('A._idleSources.length'), 0)

NEW_INDEX = ORIG_COUNT

# ------------------------------------------------------------------ #
suite("label follows renames made elsewhere")
# ------------------------------------------------------------------ #

a(f'WA.activateWorkspaceByIndex({NEW_INDEX}); true')
time.sleep(0.4)
eq("label switched with the workspace",
   a('A._applet_label.get_text()'), f"Workspace {NEW_INDEX + 1}")

js(f'imports.ui.main.setWorkspaceName({NEW_INDEX}, "AppletRenamed"); true')
wait_for(lambda: a('A._applet_label.get_text()') == "AppletRenamed",
         "the gsettings watcher to refresh the label")
eq("label picked up the external rename",
   a('A._applet_label.get_text()'), "AppletRenamed")

# ------------------------------------------------------------------ #
suite("rename from the applet menu")
# ------------------------------------------------------------------ #

modals_before = open_modals()
a(f'A._onRenameWorkspace({NEW_INDEX}); true')
wait_for(lambda: open_modals() == modals_before + 1, "the rename dialog to appear")
eq("dialog pushed", open_modals(), modals_before + 1)
js('let s=imports.ui.main.modalActorFocusStack; let dlg=s[s.length-1].actor;'
   'dlg._entry.set_text("FromApplet");'
   'let bs=dlg.buttonLayout.get_children();'
   'for (let i=0;i<bs.length;i++) if (bs[i].label==="Rename") bs[i].emit("clicked", 1);'
   'true')
wait_for(lambda: open_modals() == modals_before, "the rename dialog to close")
eq("name committed", js(f'imports.ui.main.getWorkspaceName({NEW_INDEX})'), "FromApplet")
eq("applet label follows", a('A._applet_label.get_text()'), "FromApplet")

# ------------------------------------------------------------------ #
suite("display modes")
# ------------------------------------------------------------------ #

a('A.displayMode="number"; A.updateLabel(); true')
eq("number mode", a('A._applet_label.get_text()'), str(NEW_INDEX + 1))
a('A.displayMode="both"; A.updateLabel(); true')
eq("number + name mode", a('A._applet_label.get_text()'), f"{NEW_INDEX + 1}: FromApplet")
a('A.displayMode="name"; A.updateLabel(); true')
eq("name mode", a('A._applet_label.get_text()'), "FromApplet")

# ------------------------------------------------------------------ #
suite("scroll to switch")
# ------------------------------------------------------------------ #

a('A.scrollToSwitch=true; true')
a('A.on_applet_scroll_event(null, {get_scroll_direction: function(){return 0;}}); true')
time.sleep(0.4)
eq("scrolled up one workspace",
   js("global.workspace_manager.get_active_workspace_index()"), NEW_INDEX - 1)
a('A.on_applet_scroll_event(null, {get_scroll_direction: function(){return 1;}}); true')
time.sleep(0.4)
eq("scrolled back down",
   js("global.workspace_manager.get_active_workspace_index()"), NEW_INDEX)
a('A.scrollToSwitch=false; true')

# ------------------------------------------------------------------ #
suite("remove from the applet menu, with confirmation")
# ------------------------------------------------------------------ #

modals_before = open_modals()
a(f'A._onRemoveWorkspace({NEW_INDEX}); true')
wait_for(lambda: open_modals() == modals_before + 1, "the confirm dialog to appear")
eq("nothing removed before confirming", ws_count(), ORIG_COUNT + 1)
js('let s=imports.ui.main.modalActorFocusStack; let dlg=s[s.length-1].actor;'
   'let bs=dlg.buttonLayout.get_children();'
   'for (let i=0;i<bs.length;i++) if (bs[i].label==="Yes") bs[i].emit("clicked", 1);'
   'true')
wait_for(lambda: ws_count() == ORIG_COUNT, "the confirmed removal to run")
eq("workspace removed", ws_count(), ORIG_COUNT)
eq("no modal left", open_modals(), 0)

# ------------------------------------------------------------------ #
suite("teardown releases everything")
# ------------------------------------------------------------------ #

check("watcher connected before removal", a('!!A._wsNameId') is True)
# Stash the instance so it can be inspected after Cinnamon tears it down for
# real - this exercises the production removal path, not a hand-called method.
a('global._claudeAppletRef = A; true')

gs_set("org.cinnamon", "enabled-applets", ORIG_APPLETS)
wait_for(lambda: a("!!A") is False, "Cinnamon to remove the applet from the panel")

after = js('let r=global._claudeAppletRef;'
           '({name: r._wsNameId, idle: r._idleSources.length})')
eq("workspace-names watcher released", after["name"], 0)
eq("idle sources cleared", after["idle"], 0)
js('delete global._claudeAppletRef; true')

# ------------------------------------------------------------------ #
suite("state restored")
# ------------------------------------------------------------------ #

eq("applet removed from the panel", a("!!A"), False)
eq("enabled-applets restored", gs_get("org.cinnamon", "enabled-applets"), ORIG_APPLETS)
eq("workspace count restored", ws_count(), ORIG_COUNT)
eq("workspace names restored",
   gs_get("org.cinnamon.desktop.wm.preferences", "workspace-names"), ORIG_NAMES)
eq("no modal grabs left", open_modals(), 0)

# ------------------------------------------------------------------ #
suite("no errors logged during the run")
# ------------------------------------------------------------------ #

bad = errors_in(new_log(LOG_START))
check("~/.xsession-errors is clean", len(bad) == 0,
      "\n      " + "\n      ".join(bad[:12]) if bad else None)

print("\n" + "=" * 64)
if failures:
    print(f"{passed} passed, {len(failures)} FAILED:")
    for f in failures:
        print("  - " + f)
    sys.exit(1)
print(f"All {passed} live applet assertions passed.")
