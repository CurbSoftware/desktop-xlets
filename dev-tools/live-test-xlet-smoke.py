#!/usr/bin/env python3
"""Reload one enabled xlet and verify that it returns with a real actor."""

import ast
import json
import os
from pathlib import Path
import subprocess
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cinnamon_eval import ev  # noqa: E402


ROOT = Path(__file__).resolve().parent.parent
ALIASES = {
    "world-clock": "cinnamon-world-clock-desklet@curbsoftware",
    "command-launcher": "cinnamon-command-launcher-applet@curbsoftware",
}


def evaluate(code):
    ok, value = ev(code)
    if not ok:
        raise RuntimeError(value)
    return json.loads(value) if value else None


def object_state(uuid, kind):
    manager = "deskletManager" if kind == "desklet" else "appletManager"
    return evaluate(
        '(function(){let m=imports.ui.%s;let x=m.get_object_for_uuid(%s,%s);'
        'if(!x||!x.actor)return null;let s=x.actor.get_transformed_size();'
        'return {width:s[0],height:s[1],visible:x.actor.visible};})()'
        % (manager, json.dumps(uuid), json.dumps(uuid)))


def gsettings_get(key):
    return subprocess.run(
        ["gsettings", "get", "org.cinnamon", key],
        capture_output=True, text=True, check=True).stdout.strip()


def gsettings_set(key, value):
    subprocess.run(
        ["gsettings", "set", "org.cinnamon", key, value],
        capture_output=True, text=True, check=True)


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ALIASES:
        print("Usage: live-test-xlet-smoke.py {world-clock|command-launcher}", file=sys.stderr)
        return 2
    uuid = ALIASES[sys.argv[1]]
    matches = [path for path in ROOT.glob("*@*") if (path / "metadata.json").is_file()
               and json.loads((path / "metadata.json").read_text()).get("uuid") == uuid]
    if not matches:
        print("FAIL source not found: " + uuid)
        return 1
    source = matches[0]
    kind = "desklet" if (source / "desklet.js").is_file() else "applet"
    before = object_state(uuid, kind)
    original_applets = None
    original_next_id = None
    try:
        if before is None and kind == "applet":
            original_applets = gsettings_get("enabled-applets")
            original_next_id = gsettings_get("next-applet-id")
            applets = [] if original_applets == "@as []" else ast.literal_eval(original_applets)
            panels = ast.literal_eval(gsettings_get("panels-enabled"))
            if not panels:
                print("FAIL no panel is available for temporary applet smoke test")
                return 1
            panel_id = panels[0].split(":", 1)[0]
            instance_id = int(ast.literal_eval(original_next_id))
            applets.append("panel%s:right:99:%s:%d" % (panel_id, uuid, instance_id))
            gsettings_set("next-applet-id", str(instance_id + 1))
            gsettings_set("enabled-applets", str(applets))
            deadline = time.time() + 8
            while time.time() < deadline and object_state(uuid, kind) is None:
                time.sleep(0.1)
            before = object_state(uuid, kind)
        if before is None:
            print("FAIL xlet is not enabled: " + uuid)
            return 1

        result = subprocess.run([
            "gdbus", "call", "--session", "--dest", "org.Cinnamon",
            "--object-path", "/org/Cinnamon", "--method", "org.Cinnamon.ReloadXlet",
            uuid, kind.upper(),
        ], capture_output=True, text=True, env={
            **os.environ,
            "DBUS_SESSION_BUS_ADDRESS": os.environ.get(
                "DBUS_SESSION_BUS_ADDRESS", "unix:path=/run/user/%d/bus" % os.getuid()),
        })
        if result.returncode != 0:
            print("FAIL reload: " + result.stderr.strip())
            return 1
        deadline = time.time() + 8
        state = None
        while time.time() < deadline:
            try:
                state = object_state(uuid, kind)
                if state and state["width"] > 0 and state["height"] > 0:
                    break
            except Exception:
                pass
            time.sleep(0.1)
        if not state or state["width"] <= 0 or state["height"] <= 0:
            print("FAIL xlet did not return with a positive actor allocation")
            return 1
        print("PASS %s reloaded at %.0fx%.0f" % (uuid, state["width"], state["height"]))
        return 0
    finally:
        if original_applets is not None:
            gsettings_set("enabled-applets", original_applets)
            gsettings_set("next-applet-id", original_next_id)


if __name__ == "__main__":
    raise SystemExit(main())
