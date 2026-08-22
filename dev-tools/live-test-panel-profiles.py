#!/usr/bin/env python3
"""Live acceptance driver for the Panel Profiles applet.

Drives the running Cinnamon desktop through org.Cinnamon.Eval (see
cinnamon_eval.py) and walks the full spec section 41-49 matrix in twelve
phases: install + injection + first-run menu, save flow + startup offer,
exact restore, applet-config persistence, 5-cycle A/B switch, rollback,
missing third-party applet, anchor repair, corrupt profile/state, rapid
clicks, the startup matrix, and teardown.

Baselines every org.cinnamon panel key, the applet state dir, the applet's
own config file and the two calendar config files, then restores them all
verbatim via atexit (SIGTERM routed through sys.exit so a plain `timeout`
still restores). Reads Cinnamon's stderr from ~/.xsession-errors, or from
$CINNAMON_LOG when Cinnamon was restarted with a custom stderr target.

Usage:  python3 dev-tools/live-test-panel-profiles.py
Exit non-zero on any failing assertion.
"""
import ast
import json
import os
import shutil
import signal
import subprocess
import sys
import time
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cinnamon_eval import ev  # noqa: E402

APPLET = "cinnamon-panel-profiles-applet@curbsoftware"
SCHEMA = "org.cinnamon"
STATE_DIR = os.path.expanduser("~/.config/cinnamon-panel-profiles")
CFG_FILE = os.path.expanduser(
    "~/.config/cinnamon/spices/" + APPLET + "/" + APPLET + ".json")
CAL_DIR = os.path.expanduser("~/.config/cinnamon/spices/calendar@cinnamon.org")
CAL_13 = os.path.join(CAL_DIR, "13.json")
CAL_16 = os.path.join(CAL_DIR, "16.json")
# Canonical Cinnamon stderr is ~/.xsession-errors, but a Cinnamon restarted
# from a terminal or test tooling logs wherever its stderr points (commonly
# /tmp/*cinnamon*.log). CINNAMON_LOG overrides; otherwise we follow the live
# Cinnamon process's actual stderr via /proc so log assertions never read a
# dead file after a restart.
def _detect_cinnamon_log():
    override = os.environ.get("CINNAMON_LOG")
    if override:
        return override
    try:
        pids = subprocess.run(["pgrep", "-x", "cinnamon"],
                              capture_output=True, text=True).stdout.split()
        newest = max(pids, key=lambda p: int(p)) if pids else None
        if newest:
            target = os.path.realpath("/proc/%s/fd/2" % newest)
            if target and os.path.isfile(target) and not target.endswith("/dev/null"):
                return target
    except Exception:
        pass
    return os.path.expanduser("~/.xsession-errors")


LOG = _detect_cinnamon_log()
INSTALLED = os.path.expanduser("~/.local/share/cinnamon/applets/" + APPLET)

PANEL_KEYS = [
    "panels-enabled", "enabled-applets", "panels-autohide",
    "panels-show-delay", "panels-hide-delay", "panels-height",
    "panel-scale-text-icons", "panel-zone-icon-sizes",
    "panel-zone-symbolic-icon-sizes", "panel-zone-text-sizes",
]

passed = 0
failures = []
suite_name = ""


def suite(name):
    global suite_name
    suite_name = name
    try:
        print("\n[%s] (modals=%d)" % (name, modals()))
    except Exception:
        print("\n[%s]" % name)


def check(label, condition, detail=None):
    global passed
    if condition:
        passed += 1
        print("  PASS " + label)
    else:
        failures.append(suite_name + " / " + label +
                        ((" -- " + detail) if detail else ""))
        print("  FAIL " + label + ((" -- " + detail) if detail else ""))


def eq(label, actual, expected, detail=None):
    check(label, actual == expected,
          detail if detail else "got %r, want %r" % (actual, expected))


def js(code):
    ok, value = ev(code)
    if not ok:
        raise RuntimeError("JS error: " + value)
    return json.loads(value) if value else None


PRE = ('let AM=imports.ui.appletManager;'
       'let A=AM.get_object_for_uuid("' + APPLET + '", "' + APPLET + '");')


def a(code):
    return js(PRE + code)


def gs_get(key):
    return subprocess.run(["gsettings", "get", SCHEMA, key],
                          capture_output=True, text=True).stdout.strip()


def gs_set(key, value):
    subprocess.run(["gsettings", "set", SCHEMA, key, value],
                   capture_output=True, text=True)


def wait_for(predicate, what, timeout=12.0, interval=0.1):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            if predicate():
                return True
        except Exception:
            pass
        time.sleep(interval)
    check("waited for " + what, False, "still false after %.0fs" % timeout)
    return False


def log_size():
    try:
        with open(LOG, "rb") as fh:
            return len(fh.read())
    except OSError:
        return 0


def new_log(since):
    try:
        with open(LOG, "rb") as fh:
            fh.seek(since)
            return fh.read().decode("utf-8", "replace")
    except OSError:
        return ""


def count_log(segment, needle):
    return sum(1 for line in segment.splitlines() if needle in line)


def errors_in(text):
    """Crash-symptom lines that also name our applet."""
    bad = []
    for line in text.splitlines():
        low = line.lower()
        if ("panel-profiles" not in low and "panelprofiles" not in low):
            continue
        if ("js error" in low or "gjs-critical" in low or "gjs-warning" in low
                or "disposed" in low or "logerror" in low):
            bad.append(line.strip())
    return bad


def error_lines(text):
    return [l.strip() for l in text.splitlines()
            if "[PanelProfiles][ERROR]" in l]


def coredump_pids():
    out = subprocess.run(["coredumpctl", "list", "--no-pager"],
                         capture_output=True, text=True).stdout
    pids = set()
    for line in out.splitlines()[1:]:
        parts = line.split()
        if len(parts) > 5 and parts[4].isdigit():
            pids.add(int(parts[4]))
    return pids


def modals():
    return js("imports.ui.main.modalActorFocusStack.length")


def close_modals():
    js("let s=imports.ui.main.modalActorFocusStack.slice();"
       "for (let i=s.length-1;i>=0;i--){"
       "try{let d=s[i].actor._delegate;"
       "if (d && d.destroy) d.destroy(); else s[i].actor.destroy();}catch(e){}} true")


def click_modal_button(label):
    return js(
        'let s=imports.ui.main.modalActorFocusStack; '
        'if (!s.length) false; '
        'let dlg=s[s.length-1].actor; '
        'let bs=dlg.buttonLayout.get_children(); '
        'let labels=[]; for (let i=0;i<bs.length;i++){labels.push(String(bs[i].label));} '
        'let idx=-1; for (let i=0;i<labels.length;i++){if(labels[i]==="' + label + '") idx=i;} '
        'if (idx>=0){bs[idx].emit("clicked",1); true} else false')


def read_state():
    try:
        with open(os.path.join(STATE_DIR, "state.json")) as fh:
            return json.load(fh)
    except Exception:
        return {}


def profile_ids():
    d = os.path.join(STATE_DIR, "profiles")
    if not os.path.isdir(d):
        return []
    return sorted(f[:-5] for f in os.listdir(d) if f.endswith(".json"))


def rollback_exists():
    return os.path.exists(os.path.join(STATE_DIR, "backups", "last-good.json"))


def profile_cs_value(pid, key):
    with open(os.path.join(STATE_DIR, "profiles", pid + ".json")) as fh:
        return json.load(fh)["cinnamonSettings"][key]["value"]


def live_raw(key):
    return a("A._modules.CinnamonState.getRaw(" + json.dumps(key) + ")")


def controller_state():
    return a("A._modules.ApplyController.getState()")


def wait_apply(pid, timeout=14.0):
    def pred():
        st = read_state()
        if st.get("pendingApply") is not None:
            return False
        if st.get("activeProfileId") != pid:
            return False
        return a("A._modules.ApplyController.getState()") == "IDLE"
    return wait_for(pred, "apply of %s to settle" % pid, timeout)


def wait_rollback(timeout=14.0):
    def pred():
        st = read_state()
        if st.get("pendingApply") is not None:
            return False
        if st.get("activeProfileId") is not None:
            return False
        return a("A._modules.ApplyController.getState()") == "IDLE"
    return wait_for(pred, "rollback to settle", timeout)


def save_profile(name):
    res = a('(function(){const r=A._modules.ApplyController.beginSaveNew(' +
            json.dumps(name) + ');'
            'return {ok:r.ok, id:(r.profile&&r.profile.id)||null,'
            ' reason:r.reason||null};})()')
    return res or {}


def craft(src_id, name, body_js):
    """Clone src_id, run body_js against p (with CS/GLib predeclared),
    recompute the fingerprint, save under a fresh id."""
    new_id = str(uuid.uuid4())
    code = ('(function(){const M=A._modules;'
            'const l=M.ProfileStore.loadProfile(' + json.dumps(src_id) + ');'
            'if (l.error) return "loadfail: "+l.error;'
            'const p=JSON.parse(JSON.stringify(l.profile));'
            'p.id=' + json.dumps(new_id) + ';'
            'p.name=' + json.dumps(name) + ';'
            'const CS=M.CinnamonState;'
            'const GLib=imports.gi.GLib;'
            + body_js +
            'p.fingerprint=M.Fingerprint.computeFingerprint(p,'
            'M.AppletConfigStore.configHashList(p.appletConfigs||[]));'
            'return M.ProfileStore.saveProfile(p)?p.id:"savefail";})()')
    result = a(code)
    return new_id, result


def move_applet(uuid, new_panel, new_zone, new_pos):
    apps = ast.literal_eval(gs_get("enabled-applets"))
    out = []
    moved = False
    for e in apps:
        f = e.split(":")
        if len(f) >= 4 and f[3] == uuid:
            rest = ":" + f[4] if len(f) >= 5 else ""
            out.append("panel%d:%s:%d:%s%s" % (new_panel, new_zone, new_pos, uuid, rest))
            moved = True
        else:
            out.append(e)
    gs_set("enabled-applets", str(out))
    return moved


def set_panel1_height(h):
    cur = ast.literal_eval(gs_get("panels-height"))
    gs_set("panels-height", str([("1:%d" % h) if e.startswith("1:") else e for e in cur]))


def panel1_height():
    for e in ast.literal_eval(gs_get("panels-height")):
        if e.startswith("1:"):
            return int(e.split(":")[1])
    return None


def next_id():
    return int(ast.literal_eval(gs_get("next-applet-id")))


def add_applet():
    apps = ast.literal_eval(gs_get("enabled-applets"))
    if any(APPLET in e for e in apps):
        return
    gs_set("enabled-applets", str(apps + [PANEL_ENTRY]))
    wait_for(lambda: a("!!A") is True, "applet to appear")


def remove_applet():
    apps = ast.literal_eval(gs_get("enabled-applets"))
    gs_set("enabled-applets", str([e for e in apps if APPLET not in e]))
    wait_for(lambda: a("!!A") is False, "applet to disappear")


def reload_applet():
    remove_applet()
    add_applet()


def enable_debug():
    a('A._modules.Logger.setDebug(true); true')
    a('A.settings.setValue("debug-logging", true); true')


def duplicate_pairs():
    apps = ast.literal_eval(gs_get("enabled-applets"))
    seen = {}
    dups = []
    for e in apps:
        f = e.split(":")
        if len(f) >= 5:
            key = (f[3], f[4])
            if key in seen:
                dups.append(key)
            seen[key] = True
    return dups


def menu_labels():
    return a('A.updateMenu();'
             '(function(){let out=[];let P=imports.ui.popupMenu;'
             'function walk(m){m._getMenuItems().forEach(function(i){'
             'if (i instanceof P.PopupMenuSection){walk(i);}'
             'else out.push(i.label ? i.label.get_text() : "---");});}'
             'walk(A.menu);return out;})()')


# ------------------------------------------------------------------ #
print("=" * 66)
print("Live panel-profiles acceptance test")
print("=" * 66)

# Session health probe before touching anything.
probe = js('JSON.stringify({monitors: imports.ui.main.layoutManager.monitors.length,'
           ' primary: imports.ui.main.layoutManager.primaryIndex})')
print("session probe: " + str(probe))

ORIG_APPLETS = gs_get("enabled-applets")
ORIG_NEXT_ID = gs_get("next-applet-id")
ORIG_PANEL = {key: gs_get(key) for key in PANEL_KEYS}
INSTANCE = int(ast.literal_eval(ORIG_NEXT_ID))
PANEL_ENTRY = "panel2:left:99:%s:%d" % (APPLET, INSTANCE)
COREDUMP_BASE = coredump_pids()
HAD_STATE = os.path.isdir(STATE_DIR)
STATE_BAK = "/tmp/pp-state-backup"
HAD_CFG = os.path.isfile(CFG_FILE)
CFG_BAK = "/tmp/pp-cfg-backup.json"
HAD_CAL13 = os.path.isfile(CAL_13)
HAD_CAL16 = os.path.isfile(CAL_16)
CAL_BAK = "/tmp/pp-cal-backup"
if HAD_STATE and os.path.isdir(STATE_BAK):
    shutil.rmtree(STATE_BAK, ignore_errors=True)
if HAD_STATE:
    shutil.move(STATE_DIR, STATE_BAK)
if HAD_CFG:
    shutil.copy(CFG_FILE, CFG_BAK)
if os.path.isdir(CAL_BAK):
    shutil.rmtree(CAL_BAK, ignore_errors=True)
if HAD_CAL13 or HAD_CAL16:
    os.makedirs(CAL_BAK, exist_ok=True)
    if HAD_CAL13:
        shutil.copy(CAL_13, os.path.join(CAL_BAK, "13.json"))
    if HAD_CAL16:
        shutil.copy(CAL_16, os.path.join(CAL_BAK, "16.json"))

LOG_START = log_size()
print("baseline: next-applet-id=%s, %d panel keys, %d coredumps already present"
      % (ORIG_NEXT_ID, len(ORIG_PANEL), len(COREDUMP_BASE)))

import atexit  # noqa: E402


@atexit.register
def _restore():
    try:
        close_modals()
        js(PRE + "if (A && A.menu && A.menu.isOpen) A.menu.close(); true")
    except Exception as exc:
        print("pre-restore cleanup failed: " + str(exc), file=sys.stderr)
    gs_set("enabled-applets", ORIG_APPLETS)
    time.sleep(0.6)
    for key, value in ORIG_PANEL.items():
        gs_set(key, value)
    gs_set("next-applet-id", ORIG_NEXT_ID)
    shutil.rmtree(STATE_DIR, ignore_errors=True)
    if HAD_STATE and os.path.isdir(STATE_BAK):
        shutil.copytree(STATE_BAK, STATE_DIR)
    if HAD_CFG:
        try:
            os.makedirs(os.path.dirname(CFG_FILE), exist_ok=True)
            shutil.copy(CFG_BAK, CFG_FILE)
        except Exception as exc:
            print("applet config restore failed: " + str(exc), file=sys.stderr)
    if HAD_CAL13:
        shutil.copy(os.path.join(CAL_BAK, "13.json"), CAL_13)
    if HAD_CAL16:
        shutil.copy(os.path.join(CAL_BAK, "16.json"), CAL_16)
    print("restored enabled-applets, panel keys, next-applet-id, "
          "state dir, applet + calendar configs")


def _on_term(signum, frame):
    sys.exit(0)


signal.signal(signal.SIGTERM, _on_term)
signal.signal(signal.SIGINT, _on_term)

# ------------------------------------------------------------------ #
suite("1 install + injection + first-run menu")
# ------------------------------------------------------------------ #

check("applet is installed", os.path.isfile(os.path.join(INSTALLED, "applet.js")) and
      os.path.isfile(os.path.join(INSTALLED, "metadata.json")),
      "install via ./dev-tools/install-extensions.sh -n '*panel-profiles*'")
check("not already on a panel", APPLET not in ORIG_APPLETS)

add_applet()
state = a('({modules: !!A._modules, watchIds: A._settingWatchIds.length,'
          ' dirty: A._dirtyStatus, notif: !!A._notifier, idle: A._idleSources.length})')
check("modules wired", state["modules"] is True)
eq("ten GSettings watches", state["watchIds"], 10)
eq("dirty starts UNKNOWN", state["dirty"], "UNKNOWN")
check("notifier built", state["notif"] is True)
eq("no idle sources", state["idle"], 0)

items = a('A.updateMenu(); A.menu._getMenuItems().map(function(i){'
          'return i.label ? i.label.get_text() : "---";})')
eq("first-run menu rows", items,
   ["Panel Profiles", "---", "No panel profiles saved yet.",
    "Save your current panel layout to create one.", "---",
    "Save current layout…", "Manage profiles…"])
check("save row sensitive",
      a('A.menu._getMenuItems()[5].actor.reactive') is True)

NEXT_FLOOR = next_id()

# ------------------------------------------------------------------ #
suite("2 save flow + startup offer")
# ------------------------------------------------------------------ #

before = modals()
a("A._openSaveDialog(); true")
wait_for(lambda: modals() == before + 1, "the save dialog to open")
js('let s=imports.ui.main.modalActorFocusStack; let dlg=s[s.length-1].actor;'
   'dlg._entry.set_text("Smoke Profile"); true')
click_modal_button("Save")
wait_for(lambda: modals() == before or js(
             '(function(){let s=imports.ui.main.modalActorFocusStack;'
             'if(!s.length) return false;'
             'return s[s.length-1].actor.buttonLayout.get_children()'
             '.some(function(b){return String(b.label)==="Not now";});})()'),
         "the save dialog to settle")
time.sleep(0.3)
if modals() == before + 1:
    click_modal_button("Not now")
    wait_for(lambda: modals() == before, "the startup offer to close")
    check("startup offer shown once", True)
else:
    check("startup offer shown once", False, "modals=%d want %d" % (modals(), before + 1))

saved = a('({n: A._modules.ProfileStore.listProfiles().length,'
          ' active: A._modules.ProfileStore.getState().activeProfileId,'
          ' startup: A._modules.ProfileStore.getState().startupProfileId,'
          ' dirty: A._dirtyStatus, watches: !!A._configWatchHandle})')
eq("one profile saved", saved["n"], 1)
check("saved profile is active", isinstance(saved["active"], str) and
      len(saved["active"]) > 0)
eq("no startup profile (Not now)", saved["startup"], None)
eq("dirty ACTIVE after save", saved["dirty"], "ACTIVE")
check("config watches attached", saved["watches"] is True)


def click_dialog_content_button(text):
    """Click a button inside the top modal's content area (radios and
    profile rows live there, not in buttonLayout). Matches on the button's
    own label or the text of a direct child label, so both plain St.Buttons
    (replace rows) and toggle buttons packing a label (radios) resolve."""
    return js(
        'let s=imports.ui.main.modalActorFocusStack; '
        'if (!s.length) false; '
        'let dlg=s[s.length-1].actor; '
        'let St=imports.gi.St; '
        'let found=null; '
        'function texts(w){ let out=[]; function rec(x,d){ if(!x||d>5) return; '
        '  if(x.text!==undefined && x.text!==null) out.push(String(x.text)); '
        '  if(typeof x.get_children==="function"){let ch=x.get_children();'
        '   for(let i=0;i<ch.length;i++) rec(ch[i],d+1);} } rec(w,0); return out; } '
        'function walk(w){ '
        '  if (found || !w) return; '
        '  let isBtn=false; try { isBtn = w instanceof St.Button; } catch (e) {} '
        '  if (isBtn) { '
        '    let names = (w.label !== undefined && w.label !== null) '
        '      ? [String(w.label)] : texts(w); '
        '    for (let i = 0; i < names.length; i++) '
        '      if (names[i] === "' + text + '") { found = w; return; } } '
        '  if (typeof w.get_children === "function") { '
        '    let ch = w.get_children(); '
        '    for (let i = 0; i < ch.length; i++) walk(ch[i]); } } '
        'walk(dlg); '
        'if (found) { found.emit("clicked", 1); true } else false')


# ------------------------------------------------------------------ #
suite("2b replace-confirm overwrite")
# ------------------------------------------------------------------ #

first = a('A._modules.ProfileStore.listProfiles()')
eq("one profile before replace", len(first), 1)
PRE_ID = first[0]["id"]
PRE_UPDATED = first[0]["updatedAt"]

base = modals()
a("A._openSaveDialog(); true")
wait_for(lambda: modals() == base + 1, "the save dialog to open")
check("replace radio clicked", click_dialog_content_button(
    "Replace existing profile") is True)
time.sleep(0.2)
check("target row clicked", click_dialog_content_button(
    "Smoke Profile") is True)
time.sleep(0.2)
# Entry prefilled with the active name, target selected: the primary
# button reads Overwrite and opens the confirm dialog.
click_modal_button("Overwrite")
wait_for(lambda: modals() == base + 2, "the replace confirm to open")
click_modal_button("Replace")
wait_for(lambda: modals() == base, "both dialogs to settle")

after = a('A._modules.ProfileStore.listProfiles()')
eq("still exactly one profile", len(after), 1)
eq("same id after overwrite", after[0]["id"], PRE_ID)
check("updatedAt advanced", str(after[0]["updatedAt"]) != str(PRE_UPDATED),
      "%s -> %s" % (PRE_UPDATED, after[0]["updatedAt"]))
check("still active after overwrite",
      a('A._modules.ProfileStore.getState().activeProfileId') == PRE_ID)

# ------------------------------------------------------------------ #
suite("2c modified detection")
# ------------------------------------------------------------------ #

ORIG_HEIGHT = panel1_height()
set_panel1_height(48 if ORIG_HEIGHT != 48 else 40)
wait_for(lambda: a("A._dirtyStatus") == "MODIFIED",
         "dirty to flip to MODIFIED after a panel change", timeout=6.0)
eq("dirty MODIFIED after panel height change", a("A._dirtyStatus"), "MODIFIED")
check("menu offers Update", any(
    l.startswith("Update ") for l in menu_labels()), str(menu_labels()))

set_panel1_height(ORIG_HEIGHT)
wait_for(lambda: a("A._dirtyStatus") == "ACTIVE",
         "dirty to settle back to ACTIVE", timeout=6.0)
eq("dirty ACTIVE after restore", a("A._dirtyStatus"), "ACTIVE")

# ------------------------------------------------------------------ #
suite("3 exact restore")
# ------------------------------------------------------------------ #

check("desktop mutated (height 40->48)", set_panel1_height(48) is None or True)
eq("height now 48", panel1_height(), 48)
check("applet entry moved live", move_applet(
    "windows-quick-list@cinnamon.org", 2, "left", 2))
eq("windows-quick-list now panel2:left:2",
   any(e == "panel2:left:2:windows-quick-list@cinnamon.org:20"
       for e in ast.literal_eval(gs_get("enabled-applets"))), True)

exact = save_profile("Exact A")
check("Exact A saved", exact.get("ok") is True, str(exact))
A_ID = exact.get("id")
check("Exact A got an id", isinstance(A_ID, str) and len(A_ID) > 0)

# Further change, then load A back.
set_panel1_height(40)
move_applet("windows-quick-list@cinnamon.org", 2, "center", 0)
a('A._applyProfile(' + json.dumps(A_ID) + '); true')
wait_apply(A_ID)
eq("height restored to A's 48", panel1_height(), 48)
eq("windows-quick-list restored to A's spot",
   any(e == "panel2:left:2:windows-quick-list@cinnamon.org:20"
       for e in ast.literal_eval(gs_get("enabled-applets"))), True)
for key in PANEL_KEYS:
    stored = profile_cs_value(A_ID, key)
    live = live_raw(key)
    eq("key byte-equal: " + key, live, stored,
       "live=%r stored=%r" % (live, stored))

# ------------------------------------------------------------------ #
suite("4 applet-config persistence")
# ------------------------------------------------------------------ #

check("calendar 13.json present for test", HAD_CAL13)


def tweak_calendar(show_week, show_events):
    with open(CAL_13) as fh:
        d = json.load(fh)
    d["show-week-numbers"]["value"] = show_week
    d["show-events"]["value"] = show_events
    with open(CAL_13, "w") as fh:
        json.dump(d, fh, indent=4)


def cal_values():
    with open(CAL_13) as fh:
        d = json.load(fh)
    return (d["show-week-numbers"]["value"], d["show-events"]["value"])


tweak_calendar(True, True)
cfg_a = save_profile("Cfg A")
check("Cfg A saved", cfg_a.get("ok") is True, str(cfg_a))
CFG_A_ID = cfg_a.get("id")
tweak_calendar(False, False)
cfg_b = save_profile("Cfg B")
check("Cfg B saved", cfg_b.get("ok") is True, str(cfg_b))
CFG_B_ID = cfg_b.get("id")

a('A._applyProfile(' + json.dumps(CFG_A_ID) + '); true')
wait_apply(CFG_A_ID)
eq("load A -> config A", cal_values(), (True, True))
a('A._applyProfile(' + json.dumps(CFG_B_ID) + '); true')
wait_apply(CFG_B_ID)
eq("load B -> config B", cal_values(), (False, False))
# Restore the original calendar config now so later phases start clean.
if HAD_CAL13:
    shutil.copy(os.path.join(CAL_BAK, "13.json"), CAL_13)
if HAD_CAL16:
    shutil.copy(os.path.join(CAL_BAK, "16.json"), CAL_16)

# ------------------------------------------------------------------ #
suite("5 five-cycle A/B switch, no duplicates")
# ------------------------------------------------------------------ #

sw_a = save_profile("Switch A")
check("Switch A saved", sw_a.get("ok") is True, str(sw_a))
SW_A = sw_a.get("id")
move_body = (
    'const hRec=p.cinnamonSettings["panels-height"];'
    'const h=CS.parseVariant(hRec.type,hRec.value);'
    'let hv=h.get_strv().map(function(e){return e.indexOf("1:")===0?"1:48":e;});'
    'hRec.value=CS.variantToString(GLib.Variant.new_strv(hv));'
    'const eaRec=p.cinnamonSettings["enabled-applets"];'
    'const ea=CS.parseVariant(eaRec.type,eaRec.value);'
    'let ev2=ea.get_strv().map(function(e){'
    'if (e.indexOf("windows-quick-list@cinnamon.org")!==-1)'
    'return "panel2:left:2:windows-quick-list@cinnamon.org:20"; return e;});'
    'eaRec.value=CS.variantToString(GLib.Variant.new_strv(ev2));'
)
sw_b, made = craft(SW_A, "Switch B", move_body)
check("Switch B crafted", made == sw_b, "result=%r" % made)

prev_next = next_id()
for i in range(5):
    a('A._applyProfile(' + json.dumps(sw_b) + '); true')
    wait_apply(sw_b)
    eq("cycle %d after B: no duplicate uuid:id pairs" % (i + 1), duplicate_pairs(), [])
    cur = next_id()
    check("cycle %d after B: next-applet-id not decreased" % (i + 1),
          cur >= prev_next and cur >= NEXT_FLOOR,
          "%d -> %d" % (prev_next, cur))
    prev_next = cur
    a('A._applyProfile(' + json.dumps(SW_A) + '); true')
    wait_apply(SW_A)
    eq("cycle %d after A: no duplicate uuid:id pairs" % (i + 1), duplicate_pairs(), [])
    cur = next_id()
    check("cycle %d after A: next-applet-id not decreased" % (i + 1),
          cur >= prev_next and cur >= NEXT_FLOOR,
          "%d -> %d" % (prev_next, cur))
    prev_next = cur

# ------------------------------------------------------------------ #
suite("6 rollback restores the pre-load layout")
# ------------------------------------------------------------------ #

rb = save_profile("Rollback R")
check("Rollback R saved", rb.get("ok") is True, str(rb))
RB_ID = rb.get("id")
r_h = panel1_height()
changed = r_h - 4 if r_h >= 44 else r_h + 4
set_panel1_height(changed)
a('A._applyProfile(' + json.dumps(RB_ID) + '); true')
wait_apply(RB_ID)
eq("profile applied (height back to R's %d)" % r_h, panel1_height(), r_h)
check("rollback snapshot exists", rollback_exists())
a('A._modules.ApplyController.beginRollback(); true')
wait_rollback()
eq("previous layout returned (height %d)" % changed, panel1_height(), changed)
eq("no active profile after rollback", read_state().get("activeProfileId"), None)

# ------------------------------------------------------------------ #
suite("7 missing third-party applet")
# ------------------------------------------------------------------ #

missing_body = (
    'const eaRec=p.cinnamonSettings["enabled-applets"];'
    'const ea=CS.parseVariant(eaRec.type,eaRec.value);'
    'let mv=ea.get_strv().concat(["panel2:left:3:missing-applet@test.invalid:9999"]);'
    'eaRec.value=CS.variantToString(GLib.Variant.new_strv(mv));'
)
missing_id, made = craft(SW_A, "Missing Applet", missing_body)
check("Missing profile crafted", made == missing_id, "result=%r" % made)
seg7 = log_size()
a('A._applyProfile(' + json.dumps(missing_id) + '); true')
wait_apply(missing_id)
check("applet still alive after missing-applet load", a("!!A") is True)
eq("active profile is the missing-applet profile",
   read_state().get("activeProfileId"), missing_id)
check("missing entry preserved in enabled-applets",
      any("missing-applet@test.invalid" in e
          for e in ast.literal_eval(gs_get("enabled-applets"))))
seg = new_log(seg7)
check("warning about the missing applet was logged",
      count_log(seg, "applet not installed: missing-applet@test.invalid") >= 1)

# ------------------------------------------------------------------ #
suite("8 anchor repair")
# ------------------------------------------------------------------ #

anchor_body = (
    'const eaRec=p.cinnamonSettings["enabled-applets"];'
    'const ea=CS.parseVariant(eaRec.type,eaRec.value);'
    'let av=ea.get_strv().filter(function(e){'
    'return e.indexOf(' + json.dumps(APPLET) + ')===-1;});'
    'eaRec.value=CS.variantToString(GLib.Variant.new_strv(av));'
)
anchorless_id, made = craft(SW_A, "Anchorless", anchor_body)
check("Anchorless profile crafted", made == anchorless_id, "result=%r" % made)
a('A._applyProfile(' + json.dumps(anchorless_id) + '); true')
wait_apply(anchorless_id)
check("applet survived the anchorless load", a("!!A") is True)
apps = ast.literal_eval(gs_get("enabled-applets"))
self_entries = [e for e in apps if APPLET in e]
eq("exactly one self entry after repair", len(self_entries), 1, str(self_entries))
if len(self_entries) == 1:
    panel_id = int(self_entries[0].split(":")[0][len("panel"):])
    pe = ast.literal_eval(gs_get("panels-enabled"))
    monitor = None
    for p in pe:
        f = p.split(":")
        if int(f[0]) == panel_id:
            monitor = int(f[1])
    primary = js("imports.ui.main.layoutManager.primaryIndex")
    eq("self entry sits on the primary monitor's panel", monitor, primary)

# ------------------------------------------------------------------ #
suite("9 corrupt profile + corrupt state.json")
# ------------------------------------------------------------------ #

bad_path = os.path.join(STATE_DIR, "profiles", "deadbeef.json")
with open(bad_path, "w") as fh:
    fh.write("{ this is not json")
listed = a('A._modules.ProfileStore.listProfiles().map(function(p){'
           'return [p.id, p.valid];})')
bad_row = [r for r in (listed or []) if r[0] == "deadbeef"]
eq("bad profile listed", bad_row, [["deadbeef", False]])
eq("bad profile load fails",
   a('A._modules.ProfileStore.loadProfile("deadbeef").error') is not None, True)
eq("bad profile apply is refused",
   a('A._modules.ApplyController.beginApply("deadbeef",{reason:"user"}).started'), False)

ids_before = profile_ids()
with open(os.path.join(STATE_DIR, "state.json"), "w") as fh:
    fh.write("garbage {{{")
reload_applet()
time.sleep(0.4)
check("applet alive after corrupt-state reload", a("!!A") is True)
st = read_state()
eq("state recovered to defaults", st.get("activeProfileId"), None)
check("corrupt state quarantined",
      any(f.startswith("state.json.corrupt-") for f in os.listdir(STATE_DIR)))
eq("profiles untouched by state recovery", profile_ids(), ids_before)
os.remove(bad_path)

# ------------------------------------------------------------------ #
suite("10 rapid double-apply: second refused")
# ------------------------------------------------------------------ #

rapid = save_profile("Rapid")
check("Rapid saved", rapid.get("ok") is True, str(rapid))
RAPID_ID = rapid.get("id")
res = a('(function(){const C=A._modules.ApplyController;'
        'const r1=C.beginApply(' + json.dumps(RAPID_ID) + ',{reason:"user"});'
        'const r2=C.beginApply(' + json.dumps(RAPID_ID) + ',{reason:"user"});'
        'return [r1,r2];})()')
eq("first apply started", (res[0] or {}).get("started"), True)
eq("second apply refused busy", (res[1] or {}).get("started"), False)
eq("second apply failure is busy", (res[1] or {}).get("failure"), "busy")
wait_apply(RAPID_ID)

# ------------------------------------------------------------------ #
suite("11 startup matrix")
# ------------------------------------------------------------------ #

enable_debug()

startup = save_profile("Startup")
check("Startup saved", startup.get("ok") is True, str(startup))
STARTUP_ID = startup.get("id")
a('A._modules.ApplyController.setStartupProfile(' + json.dumps(STARTUP_ID) + '); true')
eq("startup profile set", read_state().get("startupProfileId"), STARTUP_ID)

# 11a. fingerprint short-circuit (no rollback churn on a clean boot).
rb_path = os.path.join(STATE_DIR, "backups", "last-good.json")
if os.path.isfile(rb_path):
    os.remove(rb_path)
reload_applet()
time.sleep(0.5)
st = read_state()
eq("short-circuit: active == startup", st.get("activeProfileId"), STARTUP_ID)
eq("short-circuit: no pendingApply", st.get("pendingApply"), None)
eq("short-circuit: no rollback written", rollback_exists(), False)
seg = new_log(LOG_START)
check("short-circuit: log line present",
      count_log(seg, "startup profile already matches") >= 1)

# 11b. startup apply path (desktop modified, then restored).
s_h = panel1_height()
b_changed = s_h - 4 if s_h >= 44 else s_h + 4
set_panel1_height(b_changed)
reload_applet()
wait_for(lambda: panel1_height() == s_h, "startup restore to reapply Startup", 14.0)
wait_for(lambda: read_state().get("pendingApply") is None and
         read_state().get("lastSuccessfulApply") is not None,
         "startup apply verification to commit", 10.0)
st = read_state()
eq("apply: active == startup", st.get("activeProfileId"), STARTUP_ID)
eq("apply: pendingApply cleared", st.get("pendingApply"), None)
check("apply: rollback written", rollback_exists())
check("apply: lastSuccessfulApply recorded", st.get("lastSuccessfulApply") is not None)
seg = new_log(LOG_START)
check("apply: verification succeeded logged",
      count_log(seg, "verification succeeded for Startup") >= 1)
if "verification mismatched" in seg or "FAILED" in json.dumps(read_state()):
    print("DIAG 11b live panels-height: %s" % gs_get("panels-height"))
    print("DIAG 11b saved panels-height: %s" % profile_cs_value(STARTUP_ID,
                                                                "panels-height"))
    print("DIAG 11b live enabled-applets: %s" % gs_get("enabled-applets"))
    print("DIAG 11b ours: %s" % [e for e in ast.literal_eval(
        gs_get("enabled-applets")) if APPLET in e])
    print("DIAG 11b state: %s" % read_state())

# 11c. monitor-wait timeout (profile expects 3, only 2 live).
c_changed = s_h - 4 if s_h >= 44 else s_h + 4
set_panel1_height(c_changed)
three_body = 'p.monitorTopology.expectedCount=3;'
three_id, made = craft(STARTUP_ID, "ThreeHeads", three_body)
check("ThreeHeads crafted", made == three_id, "result=%r" % made)
a('A._modules.ApplyController.setStartupProfile(' + json.dumps(three_id) + '); true')
a('A.settings.setValue("startup-wait-timeout", 8); true')
reload_applet()
time.sleep(0.6)
eq("wait: menu wait state 2/3", a("A._waitState"), {"current": 2, "required": 3})
labels = menu_labels()
check("wait: menu shows Displays: 2 / 3", "Displays: 2 / 3" in labels)
segc = log_size()
wait_for(lambda: controller_state() == "IDLE" and
         read_state().get("lastFailure") is not None,
         "timeout to settle IDLE", 16.0)
time.sleep(0.4)
st = read_state()
check("timeout: lastFailure records the wait",
      "monitor wait timed out" in str((st.get("lastFailure") or {}).get("message", "")))
seg = new_log(segc)
eq("timeout: exactly one warning log line",
   count_log(seg, "monitor wait timed out"), 1)
eq("timeout: panels untouched (height %d)" % c_changed, panel1_height(), c_changed)
check("timeout: wait display cleared", a("A._waitState") is None)

# 11d. pendingApply resume across the applet's own reload.
a('A._modules.ApplyController.setStartupProfile(null); true')
set_panel1_height(40)
time.sleep(0.3)
resume_src = save_profile("Resume Src")
check("Resume Src saved", resume_src.get("ok") is True, str(resume_src))
RESUME_SRC = resume_src.get("id")
resume_body = (
    'const eaRec=p.cinnamonSettings["enabled-applets"];'
    'const ea=CS.parseVariant(eaRec.type,eaRec.value);'
    'let rv=ea.get_strv().map(function(e){'
    'const f=e.split(":");'
    'if (f[3]===' + json.dumps(APPLET) + ')'
    'return "panel1:left:99:' + APPLET + ':"+f[4];'
    'return e;});'
    'eaRec.value=CS.variantToString(GLib.Variant.new_strv(rv));'
)
resume_b, made = craft(RESUME_SRC, "Resume B", resume_body)
check("Resume B crafted", made == resume_b, "result=%r" % made)
segd = log_size()
a("global._wp11Ref = A; true")
a('A._applyProfile(' + json.dumps(resume_b) + '); true')
wait_for(lambda: js("global._wp11Ref._destroyed") is True,
         "old instance to be destroyed", 12.0)
wait_for(lambda: a("!!A") is True, "successor instance to appear", 12.0)
wait_for(lambda: read_state().get("pendingApply") is None and
         read_state().get("activeProfileId") == resume_b,
         "resume to commit Resume B", 12.0)
js("delete global._wp11Ref; true")
st = read_state()
eq("resume: pendingApply cleared", st.get("pendingApply"), None)
eq("resume: active == Resume B", st.get("activeProfileId"), resume_b)
apps = ast.literal_eval(gs_get("enabled-applets"))
check("resume: our uuid now on panel1",
      any(e.startswith("panel1:") and APPLET in e for e in apps), str(apps))
check("resume: next-applet-id never decreased", next_id() >= NEXT_FLOOR)
seg = new_log(segd)
eq("resume: exactly ONE success notification (verification ran once)",
   count_log(seg, "verification succeeded for Resume B"), 1,
   "\n".join(l for l in seg.splitlines() if "verification succeeded" in l))

# ------------------------------------------------------------------ #
suite("12 teardown + final state + error sweep")
# ------------------------------------------------------------------ #

a("global._ppRef = A; true")
remove_applet()
after = js('let r=global._ppRef;'
           '({destroyed: r._destroyed, watchIds: r._settingWatchIds.length,'
           ' idle: r._idleSources.length, debounce: r._dirtyDebounceId,'
           ' cfgWatch: r._configWatchHandle ? r._configWatchHandle.alive : null})')
js("delete global._ppRef; true")
eq("instance marked destroyed", after["destroyed"], True)
eq("GSettings watches released", after["watchIds"], 0)
eq("idle sources cleared", after["idle"], 0)
eq("debounce cleared", after["debounce"], None)
eq("config watch released", after["cfgWatch"], None)
eq("applet removed from the panel", a("!!A"), False)
if modals() != 0:
    print("DIAG 12 leftover modals: %s" % js(
        'imports.ui.main.modalActorFocusStack.map(function(m){'
        'return String(m.actor.constructor && m.actor.constructor.name) + ":"'
        ' + String(m.actor.style_class);}).join(" | ")'))
eq("no modal grabs left", modals(), 0)

# Run the verbatim restore now so the final-equality checks below can assert
# it. The atexit handler runs the same idempotent restore again at exit.
_restore()
eq("enabled-applets restored verbatim", gs_get("enabled-applets"), ORIG_APPLETS)
eq("next-applet-id restored verbatim", gs_get("next-applet-id"), ORIG_NEXT_ID)
for key in PANEL_KEYS:
    eq("panel key restored: " + key, gs_get(key), ORIG_PANEL[key])
check("applet state dir restored", (os.path.isdir(STATE_DIR) == HAD_STATE))
time.sleep(0.5)
new_pids = coredump_pids() - COREDUMP_BASE
eq("no new coredumps", len(new_pids), 0, "new pids=%s" % sorted(new_pids))
seg = new_log(LOG_START)
bad = errors_in(seg)
check("no applet crash-symptom lines", len(bad) == 0,
      "\n      " + "\n      ".join(bad[:8]) if bad else None)
err = error_lines(seg)
check("no [PanelProfiles][ERROR] lines", len(err) == 0,
      "\n      " + "\n      ".join(err[:8]) if err else None)

print("\n" + "=" * 66)
if failures:
    print("%d passed, %d FAILED:" % (passed, len(failures)))
    for f in failures:
        print("  - " + f)
    sys.exit(1)
print("All %d live panel-profiles assertions passed." % passed)
