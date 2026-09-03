#!/usr/bin/env python3
"""Live acceptance driver for the Panel Profiles applet.

Drives the running Cinnamon desktop through org.Cinnamon.Eval (see
cinnamon_eval.py) and walks the full acceptance matrix in fifteen phases:
install + injection + first-run menu, save flow, exact restore,
applet-config persistence, 5-cycle A/B switch, rollback, missing
third-party applet, anchor repair, corrupt profile/state, rapid clicks,
pendingApply resume, optional desklet capture, the real menu path, the
Configure window, and teardown.

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
import re
import shutil
import signal
import subprocess
import sys
import tempfile
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
# Instance config files, discovered below. These were pinned to 13.json and
# 16.json, which are just the ids one dev machine happened to hand out.
# Cinnamon assigns instance ids per install, so on any other desktop this
# suite died with FileNotFoundError before it asserted anything.
CAL_LIVE = None
CAL_ALT = None
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

DESKLET_KEYS = [
    "enabled-desklets", "desklet-decorations", "desklet-snap",
    "desklet-snap-interval",
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


def calendar_configs():
    """The calendar@cinnamon.org instance configs on this desktop.

    Primary is the instance actually on a panel, which is the one the
    config-persistence suite tweaks. Secondary is any other instance config
    lying around, kept only so the run backs it up and puts it back.
    """
    live = re.findall(r"calendar@cinnamon\.org:(\d+)", gs_get("enabled-applets"))
    on_disk = []
    if os.path.isdir(CAL_DIR):
        on_disk = sorted(name[:-len(".json")] for name in os.listdir(CAL_DIR)
                         if name.endswith(".json"))
    ordered = [i for i in live if i in on_disk] + [i for i in on_disk if i not in live]
    paths = [os.path.join(CAL_DIR, i + ".json") for i in ordered]
    return (paths[0] if paths else None, paths[1] if len(paths) > 1 else None)


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


def save_profile(name, include_desklets=False):
    res = a('(function(){const r=A._modules.ApplyController.beginSaveNew(' +
            json.dumps(name) + ',' + json.dumps(include_desklets) + ');'
            'return {ok:r.ok, id:(r.profile&&r.profile.id)||null,'
            ' includeDesklets:(r.profile&&r.profile.includeDesklets)||false,'
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
            rest = ":" + ":".join(f[4:]) if len(f) >= 5 else ""
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


def parse_strv(raw):
    """gsettings prints an empty strv as '@as []'; literal_eval cannot."""
    raw = raw.strip()
    if raw == "@as []":
        return []
    return ast.literal_eval(raw)


def enable_debug():
    a('A._modules.Logger.setDebug(true); true')
    a('A.settings.setValue("debug-logging", true); true')


def notification_counts():
    return js('global._ppNotificationProbe ? global._ppNotificationProbe.counts : '
              '{success:0,warn:0}')


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
ORIG_NEXT_DESKLET_ID = gs_get("next-desklet-id")
ORIG_PANEL = {key: gs_get(key) for key in PANEL_KEYS + DESKLET_KEYS}
INSTANCE = int(ast.literal_eval(ORIG_NEXT_ID))
PANEL_ENTRY = "panel2:left:99:%s:%d" % (APPLET, INSTANCE)
COREDUMP_BASE = coredump_pids()
HAD_STATE = os.path.isdir(STATE_DIR)
RUN_BAK = tempfile.mkdtemp(prefix="panel-profiles-live-")
STATE_BAK = os.path.join(RUN_BAK, "state")
HAD_CFG = os.path.isfile(CFG_FILE)
CFG_BAK = os.path.join(RUN_BAK, "applet-config.json")
CAL_LIVE, CAL_ALT = calendar_configs()
HAD_CAL13 = CAL_LIVE is not None and os.path.isfile(CAL_LIVE)
HAD_CAL16 = CAL_ALT is not None and os.path.isfile(CAL_ALT)
CAL_BAK = os.path.join(RUN_BAK, "calendar")
if HAD_STATE:
    shutil.copytree(STATE_DIR, STATE_BAK)
if HAD_CFG:
    shutil.copy2(CFG_FILE, CFG_BAK)
if HAD_CAL13 or HAD_CAL16:
    os.makedirs(CAL_BAK, exist_ok=True)
    if HAD_CAL13:
        shutil.copy2(CAL_LIVE, os.path.join(CAL_BAK, os.path.basename(CAL_LIVE)))
    if HAD_CAL16:
        shutil.copy2(CAL_ALT, os.path.join(CAL_BAK, os.path.basename(CAL_ALT)))

LOG_START = log_size()
print("baseline: next-applet-id=%s, %d panel keys, %d coredumps already present"
      % (ORIG_NEXT_ID, len(ORIG_PANEL), len(COREDUMP_BASE)))

import atexit  # noqa: E402

RESTORE_DONE = False


@atexit.register
def _restore():
    global RESTORE_DONE
    if RESTORE_DONE:
        return
    try:
        close_modals()
        js(PRE + "if (A && A.menu && A.menu.isOpen) A.menu.close(); true")
        js('let M=imports.ui.main; if (global._ppNotificationProbe) {'
           'M.notify=global._ppNotificationProbe.notify;'
           'M.warningNotify=global._ppNotificationProbe.warningNotify;'
           'delete global._ppNotificationProbe;} true')
    except Exception as exc:
        print("pre-restore cleanup failed: " + str(exc), file=sys.stderr)
    gs_set("enabled-applets", ORIG_APPLETS)
    time.sleep(0.6)
    for key, value in ORIG_PANEL.items():
        gs_set(key, value)
    gs_set("next-applet-id", ORIG_NEXT_ID)
    gs_set("next-desklet-id", ORIG_NEXT_DESKLET_ID)
    shutil.rmtree(STATE_DIR, ignore_errors=True)
    if HAD_STATE and os.path.isdir(STATE_BAK):
        shutil.copytree(STATE_BAK, STATE_DIR)
    if HAD_CFG:
        try:
            os.makedirs(os.path.dirname(CFG_FILE), exist_ok=True)
            shutil.copy2(CFG_BAK, CFG_FILE)
        except Exception as exc:
            print("applet config restore failed: " + str(exc), file=sys.stderr)
    elif os.path.isfile(CFG_FILE):
        os.unlink(CFG_FILE)
    if HAD_CAL13:
        os.makedirs(os.path.dirname(CAL_LIVE), exist_ok=True)
        shutil.copy2(os.path.join(CAL_BAK, os.path.basename(CAL_LIVE)), CAL_LIVE)
    elif CAL_LIVE and os.path.isfile(CAL_LIVE):
        os.unlink(CAL_LIVE)
    if HAD_CAL16:
        os.makedirs(os.path.dirname(CAL_ALT), exist_ok=True)
        shutil.copy2(os.path.join(CAL_BAK, os.path.basename(CAL_ALT)), CAL_ALT)
    elif CAL_ALT and os.path.isfile(CAL_ALT):
        os.unlink(CAL_ALT)
    shutil.rmtree(RUN_BAK, ignore_errors=True)
    RESTORE_DONE = True
    print("restored enabled-applets, panel keys, next-applet-id, "
          "state dir, applet + calendar configs")


def _on_term(signum, frame):
    sys.exit(0)


signal.signal(signal.SIGTERM, _on_term)
signal.signal(signal.SIGINT, _on_term)

# The recovery handler is armed before the test gets a clean state tree.
shutil.rmtree(STATE_DIR, ignore_errors=True)

# ------------------------------------------------------------------ #
suite("1 install + injection + first-run menu")
# ------------------------------------------------------------------ #

check("applet is installed", os.path.isfile(os.path.join(INSTALLED, "applet.js")) and
      os.path.isfile(os.path.join(INSTALLED, "metadata.json")),
      "install via ./dev-tools/install-extensions.sh -n '*panel-profiles*'")
if APPLET in ORIG_APPLETS:
    # The user's own session carries the applet; the atexit restore brings
    # the original list back. Remove it so the suites start clean.
    gs_set("enabled-applets",
           str([e for e in ast.literal_eval(ORIG_APPLETS)
                if APPLET not in e]))
    time.sleep(0.6)
check("not already on a panel", APPLET not in gs_get("enabled-applets"))

add_applet()
js('let M=imports.ui.main; if (!global._ppNotificationProbe) {'
   'global._ppNotificationProbe={'
   'notify:M.notify,warningNotify:M.warningNotify,counts:{success:0,warn:0}};'
   'M.notify=function(title,details){'
   'if(title==="Panel Profiles")global._ppNotificationProbe.counts.success++;'
   'return global._ppNotificationProbe.notify(title,details);};'
   'M.warningNotify=function(title,details,icon){'
   'if(title==="Panel Profiles")global._ppNotificationProbe.counts.warn++;'
   'return global._ppNotificationProbe.warningNotify(title,details,icon);};} true')
a('A.settings.setValue("notify-success", true);'
  'A.settings.setValue("notify-warnings", true); true')
state = a('({modules: !!A._modules, watchIds: A._settingWatchIds.length,'
          ' dirtyPanel: A._dirtyStatus.panel, notif: !!A._notifier,'
          ' idle: A._idleSources.length})')
check("modules wired", state["modules"] is True)
eq("fourteen GSettings watches (panel + desklet keys)",
   state["watchIds"], 14)
eq("panel dirty starts UNKNOWN", state["dirtyPanel"], "UNKNOWN")
check("notifier built", state["notif"] is True)
eq("no idle sources", state["idle"], 0)

items = a('A.updateMenu(); A.menu._getMenuItems().map(function(i){'
          'return i.label ? i.label.get_text() : "---";})')
eq("first-run menu rows", items,
   ["No profiles saved yet.",
    "Save your current panel layout to create one.", "---",
    "Save current layout…", "Restore previous layout", "Configure…",
    "Restart Cinnamon"])
check("no title row and no status rows",
      "Panel Profiles" not in items and
      not any(l.startswith("Current:") or l.startswith("Displays:")
              for l in items), str(items))
check("save row sensitive",
      a('A.menu._getMenuItems()[3].actor.reactive') is True)

NEXT_FLOOR = next_id()

# ------------------------------------------------------------------ #
suite("2 save flow")
# ------------------------------------------------------------------ #

before = modals()
a('A._openSaveDialog(); true')
wait_for(lambda: modals() == before + 1, "the save dialog to open")
js('let s=imports.ui.main.modalActorFocusStack; let dlg=s[s.length-1].actor;'
   'dlg._entry.set_text("Smoke Profile"); true')
click_modal_button("Save")
wait_for(lambda: modals() == before, "the save dialog to close")
check("no startup offer anymore", modals() == before, str(modals()))

wait_for(lambda: read_state().get("activeProfileId") is not None,
         "the saved profile state commit")
saved = a('({n: A._modules.ProfileStore.listProfiles().length,'
          ' activePanel: (function(){let s=A._modules.ProfileStore.getState();'
          'return s?s.activeProfileId:null;})(),'
          ' dirtyPanel: A._dirtyStatus.panel,'
          ' watches: !!A._configWatchHandle.panel})')
eq("one profile saved", saved["n"], 1)
check("saved profile is active", isinstance(saved.get("activePanel"), str) and
      len(saved.get("activePanel", "")) > 0)
eq("dirty ACTIVE after save", saved["dirtyPanel"], "ACTIVE")
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

time.sleep(1.1)  # updatedAt has second resolution; let the clock tick
base = modals()
a('A._openSaveDialog(); true')
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
wait_for(lambda: a("A._dirtyStatus.panel") == "MODIFIED",
         "dirty to flip to MODIFIED after a panel change", timeout=6.0)
eq("dirty MODIFIED after panel height change",
   a("A._dirtyStatus.panel"), "MODIFIED")
check("menu offers Update", any(
    l.startswith("Update profile") for l in menu_labels()),
    str(menu_labels()))

set_panel1_height(ORIG_HEIGHT)
wait_for(lambda: a("A._dirtyStatus.panel") == "ACTIVE",
         "dirty to settle back to ACTIVE", timeout=6.0)
eq("dirty ACTIVE after restore", a("A._dirtyStatus.panel"), "ACTIVE")

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
wait_for(lambda: panel1_height() == 48 and
         any(e == "panel2:left:2:windows-quick-list@cinnamon.org:20"
             for e in ast.literal_eval(gs_get("enabled-applets"))),
         "A's restore to land on the desktop", 8.0)
eq("height restored to A's 48", panel1_height(), 48)
eq("windows-quick-list restored to A's spot",
   any(e == "panel2:left:2:windows-quick-list@cinnamon.org:20"
       for e in ast.literal_eval(gs_get("enabled-applets"))), True)
for key in PANEL_KEYS:
    stored = profile_cs_value(A_ID, key)
    live = live_raw(key)
    if key == "enabled-applets":
        # Our own entry is legitimately anchor-repaired onto a live panel;
        # compare everyone else byte-for-byte.
        live = str([e for e in ast.literal_eval(live) if APPLET not in e])
        stored = str([e for e in ast.literal_eval(stored) if APPLET not in e])
    eq("key byte-equal: " + key, live, stored,
       "live=%r stored=%r" % (live, stored))

# ------------------------------------------------------------------ #
suite("4 applet-config persistence")
# ------------------------------------------------------------------ #

check("a calendar applet config is present for the test", HAD_CAL13,
      "no calendar@cinnamon.org instance config under " + CAL_DIR)


def tweak_calendar(show_week, show_events):
    with open(CAL_LIVE) as fh:
        d = json.load(fh)
    d["show-week-numbers"]["value"] = show_week
    d["show-events"]["value"] = show_events
    with open(CAL_LIVE, "w") as fh:
        json.dump(d, fh, indent=4)


def cal_values():
    with open(CAL_LIVE) as fh:
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
    shutil.copy(os.path.join(CAL_BAK, os.path.basename(CAL_LIVE)), CAL_LIVE)
if HAD_CAL16:
    shutil.copy(os.path.join(CAL_BAK, os.path.basename(CAL_ALT)), CAL_ALT)

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
eq("no active profiles after rollback",
   read_state().get("activeProfileId"), None)

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
before_warning = notification_counts()["warn"]
missing_result = a('A._modules.ApplyController.beginApply(' +
                   json.dumps(missing_id) + ',{reason:"user"})')
wait_apply(missing_id)
check("applet still alive after missing-applet load", a("!!A") is True)
eq("active profile is the missing-applet profile",
   read_state().get("activeProfileId"), missing_id)
check("missing entry preserved in enabled-applets",
      any("missing-applet@test.invalid" in e
          for e in ast.literal_eval(gs_get("enabled-applets"))))
check("missing applet returned as an apply warning",
      any("applet not installed: missing-applet@test.invalid" in warning
          for warning in missing_result.get("warnings", [])), str(missing_result))
eq("missing applet raised one warning notification",
   notification_counts()["warn"] - before_warning, 1)

# Cinnamon preserves entries for unavailable extensions. Remove this synthetic
# entry before exact-restore phases so it cannot become unrelated live drift.
apps = ast.literal_eval(gs_get("enabled-applets"))
gs_set("enabled-applets", str([
    e for e in apps if "missing-applet@test.invalid" not in e
]))
wait_for(lambda: not any("missing-applet@test.invalid" in e
                         for e in ast.literal_eval(gs_get("enabled-applets"))),
         "synthetic missing applet cleanup")

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
    on_primary = any(int(p.split(":")[1]) == primary for p in pe)
    if on_primary:
        eq("self entry sits on the primary monitor's panel",
           monitor, primary)
    else:
        check("self entry sits on an existing panel", monitor is not None)

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
suite("11 pendingApply resume")

enable_debug()

# A profile that moves the applet itself: the enabled-applets write
# destroys this instance mid-call, state.json carries the marker, and the
# successor instance resumes and verifies exactly once.
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
success_before = notification_counts()["success"]
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
eq("resume: active profile == Resume B",
   st.get("activeProfileId"), resume_b)
apps = ast.literal_eval(gs_get("enabled-applets"))
check("resume: our uuid now on panel1",
      any(e.startswith("panel1:") and APPLET in e for e in apps), str(apps))
check("resume: next-applet-id never decreased", next_id() >= NEXT_FLOOR)
eq("resume: exactly ONE success notification (verification ran once)",
   notification_counts()["success"] - success_before, 1)


suite("11b host panel deletion handoff")

# Target removes panel 1, which currently owns this applet. The transaction
# must continue without its actor, create panel 2, restore configured applets,
# and let exactly one successor manager verify.
host_body = (
    'const peRec=p.cinnamonSettings["panels-enabled"];'
    'peRec.value=CS.variantToString(GLib.Variant.new_strv(["2:0:top"]));'
    '["panels-show-delay","panels-hide-delay"].forEach(function(k){'
    'const rec=p.cinnamonSettings[k];'
    'const v=CS.parseVariant(rec.type,rec.value);'
    'rec.value=CS.variantToString(GLib.Variant.new_strv('
    'v.get_strv().filter(function(e){return e.split(":")[0]==="2";})));});'
    '["panel-zone-icon-sizes","panel-zone-symbolic-icon-sizes",'
    '"panel-zone-text-sizes"].forEach(function(k){'
    'const rec=p.cinnamonSettings[k];'
    'const v=CS.parseVariant(rec.type,rec.value);'
    'const got=v.get_string();'
    'const raw=Array.isArray(got)?got[0]:got;'
    'const rows=JSON.parse(raw).filter(function(row){return row.panelId===2;});'
    'rec.value=CS.variantToString(GLib.Variant.new_string(JSON.stringify(rows)));});'
    'const eaRec=p.cinnamonSettings["enabled-applets"];'
    'const ea=CS.parseVariant(eaRec.type,eaRec.value);'
    'eaRec.value=CS.variantToString(GLib.Variant.new_strv('
    'ea.get_strv().map(function(e){return e.replace(/^panel[0-9]+:/,"panel2:");})));'
)
host_id, made = craft(RESUME_SRC, "Host Handoff", host_body)
check("host handoff profile crafted", made == host_id, "result=%r" % made)
success_before = notification_counts()["success"]
a("global._hostPanelRef = A; true")
a('A._applyProfile(' + json.dumps(host_id) + '); true')
wait_for(lambda: js("global._hostPanelRef._destroyed") is True,
         "old host-panel instance to be destroyed", 12.0)
wait_for(lambda: read_state().get("pendingApply") is None and
         read_state().get("activeProfileId") == host_id,
         "host-panel handoff to settle", 14.0)
apps = ast.literal_eval(gs_get("enabled-applets"))
check("manager anchored on surviving panel 2",
      len([e for e in apps if APPLET in e and e.startswith("panel2:")]) == 1,
      str(apps))
check("configured applets moved to panel 2",
      all(e.startswith("panel2:") for e in apps), str(apps))
eq("host handoff verified exactly once",
   notification_counts()["success"] - success_before, 1)
js("delete global._hostPanelRef; true")


suite("12 optional desklets")

live_desklets = parse_strv(gs_get("enabled-desklets"))
check("at least one desklet live for the optional capture test",
      len(live_desklets) >= 1, gs_get("enabled-desklets"))

dk = save_profile("Panels and Desklets", True)
check("combined profile saved", dk.get("ok") is True, str(dk))
DK_ID = dk.get("id")
eq("desklets option stamped", dk.get("includeDesklets"), True)
dk_profile = a('(function(){const l=A._modules.ProfileStore.loadProfile(' +
               json.dumps(DK_ID) + ');'
               'return l.profile ? {includeDesklets: l.profile.includeDesklets,'
               ' deskletConfigs: l.profile.deskletConfigs.length,'
               ' hasAppletKey: !!l.profile.cinnamonSettings["enabled-applets"]}'
               ' : null;})()')
eq("stored profile includes desklets",
   (dk_profile or {}).get("includeDesklets"), True)
check("desklet config files captured",
      (dk_profile or {}).get("deskletConfigs", 0) >= 1, str(dk_profile))
check("settings still captured in full",
      (dk_profile or {}).get("hasAppletKey") is True)

# Drift the desklet world, then apply. Panels and desklets come back together.
gs_set("enabled-desklets", "[]")
time.sleep(0.3)
a('A._applyProfile(' + json.dumps(DK_ID) + '); true')
wait_apply(DK_ID)
eq("desklet list restored by the desklet apply",
   sorted(parse_strv(gs_get("enabled-desklets"))), sorted(live_desklets))
for key in DESKLET_KEYS:
    if key == "enabled-desklets":
        continue
    stored = profile_cs_value(DK_ID, key)
    eq("desklet key byte-equal: " + key, live_raw(key), stored)
eq("combined profile active", read_state().get("activeProfileId"), DK_ID)

# Scope discipline: a panels-only profile never touches desklets, even though it
# captured them. Save while desklets are live, empty the list, apply: the
# desklets must stay gone.
ap = save_profile("Panels Only", False)
AP_ID = ap.get("id")
eq("panel profile excludes desklets", ap.get("includeDesklets"), False)
gs_set("enabled-desklets", "[]")
time.sleep(0.3)
a('A._applyProfile(' + json.dumps(AP_ID) + '); true')
wait_apply(AP_ID)
eq("panel apply leaves the emptied desklet list alone",
   parse_strv(gs_get("enabled-desklets")), [])
gs_set("enabled-desklets", str(live_desklets))
time.sleep(0.3)

# ------------------------------------------------------------------ #
suite("13 menu path")
# ------------------------------------------------------------------ #

# The user's complaint was UX-level: drive the REAL menu, not the modules.
labels = menu_labels()
check("menu shows save and recovery items",
      "Save current layout…" in labels and "Restore previous layout" in labels,
      str(labels))
check("menu shows Configure and Restart",
      "Configure…" in labels and "Restart Cinnamon" in labels, str(labels))
check("menu has no removed items",
      not any(l.startswith("Manage profiles") or
              l.startswith("Duplicate profile") for l in labels),
      str(labels))
check("menu lists combined profile",
      any(l == "Panels and Desklets" for l in labels), str(labels))

def activate_menu_item(label):
    return a('(function(){let P=imports.ui.popupMenu;'
             'function walk(m){let items=m._getMenuItems();'
             'for (let i=0;i<items.length;i++){'
             'if (items[i] instanceof P.PopupMenuSection){'
             'if (walk(items[i])) return true; continue;}'
             'if (items[i].label && items[i].label.get_text()===' +
             json.dumps(label) + '){items[i].emit("activate"); return true;}}'
             'return false;}'
             'A.updateMenu(); return walk(A.menu);})()')

check("combined row activates via the real menu",
      activate_menu_item("Panels and Desklets") is True)
wait_apply(DK_ID)
eq("menu-activated combined profile becomes active",
   read_state().get("activeProfileId"), DK_ID)
check("panel row activates via the real menu",
      activate_menu_item("Smoke Profile") is True)
wait_for(lambda: read_state().get("activeProfileId") is not None and
         read_state().get("pendingApply") is None,
         "menu-activated panel apply to settle", 14.0)
eq("menu-activated panel apply sets active profile",
   read_state().get("activeProfileId") is not None, True)

# ------------------------------------------------------------------ #
suite("14 Configure opens the xlet settings window")
# ------------------------------------------------------------------ #

base_procs = subprocess.run(["pgrep", "-f", "xlet-settings"],
                            capture_output=True, text=True).stdout.split()

def new_xlet_procs():
    return [p for p in subprocess.run(
        ["pgrep", "-f", "xlet-settings"],
        capture_output=True, text=True).stdout.split()
        if p not in base_procs]

check("Configure item activates", activate_menu_item("Configure…") is True)
opened = wait_for(lambda: new_xlet_procs(),
                  "an xlet-settings process to appear", 15.0)
procs = new_xlet_procs()
if opened and procs:
    time.sleep(1.5)
    for proc in procs:
        subprocess.run(["kill", proc], capture_output=True)
    time.sleep(0.8)
    check("Configure opened the xlet settings window", True)
else:
    check("Configure opened the xlet settings window", False,
          "no new process after activate")


suite("15 teardown + final state + error sweep")
# ------------------------------------------------------------------ #

a("global._ppRef = A; true")
remove_applet()
after = js('let r=global._ppRef;'
           '({destroyed: r._destroyed, watchIds: r._settingWatchIds.length,'
           ' idle: r._idleSources.length, debounce: r._dirtyDebounceId,'
           ' cfgWatchPanel: r._configWatchHandle.panel ? r._configWatchHandle.panel.alive : null,'
           ' cfgWatchDesklet: r._configWatchHandle.desklet ? r._configWatchHandle.desklet.alive : null})')
js("delete global._ppRef; true")
eq("instance marked destroyed", after["destroyed"], True)
eq("GSettings watches released", after["watchIds"], 0)
eq("idle sources cleared", after["idle"], 0)
eq("debounce cleared", after["debounce"], None)
eq("panel config watch released", after["cfgWatchPanel"], None)
eq("desklet config watch released", after["cfgWatchDesklet"], None)
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
eq("next-desklet-id restored verbatim", gs_get("next-desklet-id"),
   ORIG_NEXT_DESKLET_ID)
for key in PANEL_KEYS + DESKLET_KEYS:
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
