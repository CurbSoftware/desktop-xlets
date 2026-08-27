#!/usr/bin/env python3
"""
Live test for the Workspace Names applet: temporarily adds it to a panel,
exercises its button strip and actions, then restores enabled-applets to
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
ORIG_APPLET_SETTINGS = None
print(f"baseline: {ORIG_COUNT} workspaces, active={ORIG_ACTIVE}")

import atexit  # noqa: E402


@atexit.register
def _restore():
    try:
        close_all_modals()
        if ORIG_APPLET_SETTINGS is not None:
            js(PRE + 'if (A && A.settings) {'
               f'A.settings.setValue("display-mode", {json.dumps(ORIG_APPLET_SETTINGS["display"])});'
               f'A.settings.setValue("scroll-behavior", {json.dumps(ORIG_APPLET_SETTINGS["scroll"])});'
               '} true')
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

# Drop any pre-existing instances of this applet so the test runs against
# exactly one instance it owns; teardown restores the original set.
applets = [entry for entry in ast.literal_eval(ORIG_APPLETS) if APPLET not in entry]
gs_set("org.cinnamon", "enabled-applets", str(applets + [PANEL_ENTRY]))
wait_for(lambda: a("!!A") is True, "the applet to appear on panel2")
check("applet instance is live", a("!!A") is True)

ORIG_APPLET_SETTINGS = a('({display: A.settings.getValue("display-mode"),'
                         ' scroll: A.settings.getValue("scroll-behavior")})')

state = a('({buttons: A.buttons.length, editing: A.enableEditing,'
          ' confirm: A.confirmRemove, nameWatcher: !!A._wsNameId,'
          ' pending: A._actionSources.length})')
eq("one visible button per workspace", state["buttons"], ORIG_COUNT)
check("editing enabled by default", state["editing"] is True)
check("confirm-remove enabled by default", state["confirm"] is True)
check("workspace-names watcher connected", state["nameWatcher"] is True)
eq("no pending actions", state["pending"], 0)

# ------------------------------------------------------------------ #
suite("button strip and context menu")
# ------------------------------------------------------------------ #

eq("first workspace name is visible", a('A.buttons[0].get_child().get_text()'),
   js("imports.ui.main.getWorkspaceName(0)"))
eq("exactly one active button", a('A.buttons.filter(function(b){return '
   '(b.get_style_pseudo_class()||"").indexOf("outlined")!==-1;}).length'), 1)
items = a('A._applet_context_menu._getMenuItems().map(function(i){'
          'return i.label ? i.label.get_text() : "---";})')
eq("workspace actions use native context menu", items[:4],
   ["Manage workspaces (Expo)", "Add workspace", "Rename current workspace",
    "Remove current workspace"])

# ------------------------------------------------------------------ #
suite("dense and vertical labels")
# ------------------------------------------------------------------ #

metrics = a('({twelve:A._getButtonMetrics(12), thirtySix:A._getButtonMetrics(36)})')
check("36-workspace labels shrink below 12-workspace labels",
      metrics["thirtySix"]["labelWidth"] < metrics["twelve"]["labelWidth"], metrics)
check("36-workspace buttons stay bounded",
      metrics["thirtySix"]["buttonLength"] <= metrics["twelve"]["buttonLength"], metrics)
vertical_label = a('let old=A.orientation; A.orientation=imports.gi.St.Side.LEFT;'
                   'let label=A._workspaceLabel(0,"Development"); A.orientation=old; label')
check("vertical label keeps a readable name prefix",
      "Development".startswith(vertical_label) and 1 <= len(vertical_label) <= 4,
      vertical_label)

# ------------------------------------------------------------------ #
suite("add workspace from the applet menu")
# ------------------------------------------------------------------ #

a('A._onAddWorkspace(); true')
wait_for(lambda: ws_count() == ORIG_COUNT + 1, "the deferred add to run")
eq("workspace appended", ws_count(), ORIG_COUNT + 1)
eq("no action source leaked", a('A._actionSources.length'), 0)

NEW_INDEX = ORIG_COUNT

# ------------------------------------------------------------------ #
suite("buttons follow renames made elsewhere")
# ------------------------------------------------------------------ #

a(f'WA.activateWorkspaceByIndex({NEW_INDEX}); true')
time.sleep(0.4)
eq("new workspace button is visible",
   a(f'A.buttons[{NEW_INDEX}].get_child().get_text()'), f"Workspace {NEW_INDEX + 1}")

js(f'imports.ui.main.setWorkspaceName({NEW_INDEX}, "AppletRenamed"); true')
wait_for(lambda: a(f'A.buttons[{NEW_INDEX}].get_child().get_text()') == "AppletRenamed",
         "the gsettings watcher to refresh buttons")
eq("button picked up the external rename",
   a(f'A.buttons[{NEW_INDEX}].get_child().get_text()'), "AppletRenamed")

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
eq("applet button follows", a(f'A.buttons[{NEW_INDEX}].get_child().get_text()'), "FromApplet")

# ------------------------------------------------------------------ #
suite("display modes")
# ------------------------------------------------------------------ #

a('A.displayMode="number"; A._rebuild(); true')
eq("number mode", a(f'A.buttons[{NEW_INDEX}].get_child().get_text()'), str(NEW_INDEX + 1))
a('A.displayMode="both"; A._rebuild(); true')
eq("number + name mode", a(f'A.buttons[{NEW_INDEX}].get_child().get_text()'), f"{NEW_INDEX + 1}: FromApplet")
a('A.displayMode="name"; A._rebuild(); true')
eq("name mode", a(f'A.buttons[{NEW_INDEX}].get_child().get_text()'), "FromApplet")

# ------------------------------------------------------------------ #
suite("scroll to switch")
# ------------------------------------------------------------------ #

a('A.scrollBehavior="normal"; A._lastSwitchTime=0; true')
a('A.on_applet_scroll_event(null, {get_scroll_direction: function(){return 0;}}); true')
time.sleep(0.4)
eq("scrolled up one workspace",
   js("global.workspace_manager.get_active_workspace_index()"), NEW_INDEX - 1)
a('A.on_applet_scroll_event(null, {get_scroll_direction: function(){return 1;}}); true')
time.sleep(0.4)
eq("scrolled back down",
   js("global.workspace_manager.get_active_workspace_index()"), NEW_INDEX)
a('A.scrollBehavior="disabled"; true')

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
a(f'A.settings.setValue("display-mode", {json.dumps(ORIG_APPLET_SETTINGS["display"])});'
  f'A.settings.setValue("scroll-behavior", {json.dumps(ORIG_APPLET_SETTINGS["scroll"])});'
  'A._rebuild(); true')
eq("display setting restored", a('A.settings.getValue("display-mode")'),
   ORIG_APPLET_SETTINGS["display"])
eq("scroll setting restored", a('A.settings.getValue("scroll-behavior")'),
   ORIG_APPLET_SETTINGS["scroll"])
# Stash the instance so it can be inspected after Cinnamon tears it down for
# real. This exercises the production removal path, not a hand-called method.
a('global._claudeAppletRef = A; true')

gs_set("org.cinnamon", "enabled-applets", ORIG_APPLETS)
# Restoring the baseline re-enables any instance the user had, so the check
# is that THIS test instance stopped being the live one, not that none exist.
wait_for(lambda: a("A !== global._claudeAppletRef") is True,
         "Cinnamon to remove the test instance from the panel")

after = js('let r=global._claudeAppletRef;'
           '({name: r._wsNameId, pending: r._actionSources.length, rebuild: r._rebuildSource})')
eq("workspace-names watcher released", after["name"], 0)
eq("action sources cleared", after["pending"], 0)
eq("rebuild source cleared", after["rebuild"], 0)
js('delete global._claudeAppletRef; true')

# ------------------------------------------------------------------ #
suite("state restored")
# ------------------------------------------------------------------ #

eq("test instance removed from the panel", a("A === global._claudeAppletRef"), False)
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
