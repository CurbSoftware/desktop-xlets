#!/usr/bin/env python3
"""Install and manage CurbSoftware desktop widgets for the running desktop.

Desktop shells load widgets from fixed user directories, so this bundle
is an installer rather than a runtime. It detects the desktop, installs
the matching variants from the bundled payload, and can add or remove
instances on the panel or the desktop.

Everything is HOME scoped. No root needed, and running under sudo is
refused unless --allow-root is passed.

Actions:
    gui         GTK manager (default when $DISPLAY is set and no action)
    install     install files and place a default instance
    uninstall   disable and remove them again
    status      show what is installed, with versions
    add-instance / remove-instance
    update-check / update

Exit codes: 0 ok, 1 action failed, 2 unsupported environment,
3 a required tool is missing and no fallback applies.
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

EXIT_OK = 0
EXIT_FAILED = 1
EXIT_UNSUPPORTED = 2
EXIT_MISSING_TOOL = 3

DESKTOPS = ("cinnamon", "gnome", "kde")
DEFAULT_DESKLET_POSITION = (100, 100)
DESKLET_OFFSET = 40
PANEL_ALIASES = {"workspace-names", "command-launcher", "panel-profiles"}
GITHUB_RELEASES = (
    "https://api.github.com/repos/CurbSoftware/curb-desktop-widgets/releases/latest"
)
ASSET_NAME = "curb-desktop-widgets-x86_64.AppImage"
USER_AGENT = "curb-desktop-widgets"


# ---------------------------------------------------------------- logging

def _tty() -> bool:
    return sys.stdout.isatty()


def log(message: str = "") -> None:
    print(message, flush=True)


def ok(message: str) -> None:
    prefix = "\033[1;32mOK\033[0m   " if _tty() else "OK    "
    print(prefix + message, flush=True)


def warn(message: str) -> None:
    prefix = "\033[1;33m!!\033[0m   " if _tty() else "!!    "
    print(prefix + message, flush=True)


def err(message: str) -> None:
    prefix = "\033[1;31mERR\033[0m  " if _tty() else "ERR   "
    print(prefix + message, file=sys.stderr, flush=True)


# ---------------------------------------------------------------- payload

def payload_root() -> Path | None:
    override = os.environ.get("CURB_BUNDLE_PAYLOAD")
    if override:
        candidate = Path(override)
        return candidate if (candidate / "manifest.json").is_file() else None
    here = Path(__file__).resolve()
    for base in [here.parent, *here.parents]:
        if (base / "payload" / "manifest.json").is_file():
            return base / "payload"
    return None


def load_manifest(root: Path) -> dict:
    return json.loads((root / "manifest.json").read_text(encoding="utf-8"))


def bundle_version(manifest: dict) -> str:
    return str((manifest.get("bundle") or {}).get("version") or "0.0.0")


# ---------------------------------------------------------------- detection

def detect_desktop(override: str | None = None, env: dict[str, str] | None = None) -> str | None:
    if override:
        return override
    environ = env if env is not None else os.environ

    def match(text: str) -> str | None:
        tokens = [token.strip().lower() for token in text.split(":") if token.strip()]
        for token in tokens:
            if "cinnamon" in token:
                return "cinnamon"
            if "kde" in token or "plasma" in token:
                return "kde"
            if "gnome" in token:
                return "gnome"
        return None

    found = match(environ.get("XDG_CURRENT_DESKTOP", ""))
    if found:
        return found
    found = match(environ.get("XDG_SESSION_DESKTOP", ""))
    if found:
        return found
    if env is None:
        for name, binary in (("cinnamon", "cinnamon"), ("kde", "plasmashell"), ("gnome", "gnome-shell")):
            if shutil.which(binary):
                return name
    return None


def session_type(env: dict[str, str] | None = None) -> str:
    environ = env if env is not None else os.environ
    return environ.get("XDG_SESSION_TYPE", "unknown")


def parse_os_release(text: str) -> str:
    values: dict[str, str] = {}
    for line in text.splitlines():
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key] = value.strip().strip('"')
    return values.get("PRETTY_NAME") or values.get("NAME") or "Linux"


def os_label(path: Path | None = None) -> str:
    target = path or Path("/etc/os-release")
    if not target.is_file():
        return "Linux"
    try:
        return parse_os_release(target.read_text(encoding="utf-8", errors="replace"))
    except OSError:
        return "Linux"


def environment_label(desktop: str, session: str | None = None, release_path: Path | None = None) -> str:
    return "%s · %s · %s" % (os_label(release_path), desktop.capitalize(), session or session_type())


def surface_for_alias(alias: str) -> str:
    return "panel" if alias in PANEL_ALIASES else "desktop"


def entry_surface(entry: dict) -> str:
    surface = entry.get("surface")
    if surface in ("desktop", "panel"):
        return surface
    if entry.get("kind") == "applet":
        return "panel"
    if entry.get("kind") == "desklet":
        return "desktop"
    return surface_for_alias(str(entry.get("alias") or ""))


def entry_key(entry: dict) -> str:
    return str(entry.get("alias") or entry.get("uuid") or entry.get("package_id") or "")


def entry_matches(entry: dict, selector: str) -> bool:
    needle = selector.lower()
    for key in ("alias", "uuid", "package_id"):
        value = entry.get(key)
        if value and str(value).lower() == needle:
            return True
    return False


def filter_entries(entries: list[dict], only: list[str] | None) -> list[dict]:
    if not only:
        return list(entries)
    selected: list[dict] = []
    for selector in only:
        matches = [entry for entry in entries if entry_matches(entry, selector)]
        if not matches:
            raise ValueError("unknown widget: " + selector)
        for entry in matches:
            if entry not in selected:
                selected.append(entry)
    return selected


# ---------------------------------------------------------------- versions / github

def parse_version(text: str) -> tuple[int, int, int]:
    value = text.strip()
    if value[:1] in "vV":
        value = value[1:]
    parts: list[int] = []
    for chunk in value.split("."):
        digits = ""
        for char in chunk:
            if char.isdigit():
                digits += char
            else:
                break
        parts.append(int(digits) if digits else 0)
    while len(parts) < 3:
        parts.append(0)
    return (parts[0], parts[1], parts[2])


def version_newer(remote: str, local: str) -> bool:
    return parse_version(remote) > parse_version(local)


def latest_release_from_json(payload: dict, asset_name: str = ASSET_NAME) -> dict:
    tag = str(payload.get("tag_name") or "")
    url = None
    for asset in payload.get("assets") or []:
        if asset.get("name") == asset_name:
            url = asset.get("browser_download_url")
            break
    return {"tag": tag, "url": url}


def fetch_latest_release(url: str = GITHUB_RELEASES) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=10) as response:
        payload = json.loads(response.read().decode("utf-8"))
    return latest_release_from_json(payload)


def appimage_path() -> Path | None:
    value = os.environ.get("APPIMAGE")
    if not value:
        return None
    path = Path(value)
    return path if path.is_file() else None


# ---------------------------------------------------------------- helpers

def run(command: list[str], dry: bool = False) -> tuple[bool, str]:
    if dry:
        log("  would run: " + " ".join(command))
        return True, ""
    result = subprocess.run(command, capture_output=True, text=True)
    output = (result.stdout or "").strip()
    if result.returncode != 0 and result.stderr:
        output = (output + "\n" + result.stderr.strip()).strip()
    return result.returncode == 0, output


def which(tool: str) -> bool:
    return shutil.which(tool) is not None


def replace_tree(source: Path, target: Path, dry: bool) -> bool:
    if dry:
        log("  would copy: %s -> %s" % (source, target))
        return True
    if target.is_symlink() or target.is_file():
        target.unlink()
    elif target.is_dir():
        shutil.rmtree(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, target)
    return True


def extract_zip(zip_path: Path, target: Path, dry: bool) -> bool:
    if dry:
        log("  would unzip: %s -> %s" % (zip_path, target))
        return True
    if target.is_dir():
        shutil.rmtree(target)
    target.mkdir(parents=True)
    with zipfile.ZipFile(zip_path) as archive:
        archive.extractall(target)
    return True


def gsettings_get(schema: str, key: str) -> list[str] | None:
    if not which("gsettings"):
        return None
    success, output = run(["gsettings", "get", schema, key])
    if not success:
        return None
    try:
        value = ast.literal_eval(output)
    except (ValueError, SyntaxError):
        return None
    if isinstance(value, list) and all(isinstance(item, str) for item in value):
        return value
    return None


def gsettings_set_strv(schema: str, key: str, items: list[str], dry: bool) -> bool:
    if not which("gsettings"):
        return False

    def quote(text: str) -> str:
        return "'" + text.replace("\\", "\\\\").replace("'", "\\'") + "'"

    serialized = "[" + ", ".join(quote(item) for item in items) + "]"
    success, output = run(["gsettings", "set", schema, key, serialized], dry)
    if not success and output:
        warn(output)
    return success


def gsettings_append_unique(schema: str, key: str, item: str, dry: bool) -> bool:
    current = gsettings_get(schema, key)
    if current is None:
        return False
    if item in current:
        return True
    current.append(item)
    return gsettings_set_strv(schema, key, current, dry)


def gsettings_remove_all(schema: str, key: str, item: str, dry: bool) -> bool:
    current = gsettings_get(schema, key)
    if current is None:
        return False
    kept = [entry for entry in current if entry != item]
    if len(kept) == len(current):
        return True
    return gsettings_set_strv(schema, key, kept, dry)


# ---------------------------------------------------------------- cinnamon

def cinnamon_target(kind: str, uuid: str) -> Path:
    area = "desklets" if kind == "desklet" else "applets"
    return Path.home() / ".local" / "share" / "cinnamon" / area / uuid


def cinnamon_enabled_entries(kind: str, uuid: str) -> list[str]:
    key = "enabled-applets" if kind == "applet" else "enabled-desklets"
    current = gsettings_get("org.cinnamon", key) or []
    return [entry for entry in current if entry.split(":")[0] == uuid]


def cinnamon_next_desklet_entry(
    uuid: str,
    current: list[str],
    position: tuple[int, int] = DEFAULT_DESKLET_POSITION,
) -> str:
    ids = []
    for existing in current:
        parts = existing.split(":")
        if parts and parts[0] == uuid and len(parts) == 4 and parts[1].isdigit():
            ids.append(int(parts[1]))
    instance = max(ids) + 1 if ids else 1
    x, y = position
    x += DESKLET_OFFSET * len(ids)
    return "%s:%d:%d:%d" % (uuid, instance, x, y)


def cinnamon_next_applet_entry(uuid: str, current: list[str], panel: str = "1") -> str:
    positions = []
    for entry in current:
        parts = entry.split(":")
        if len(parts) == 3 and parts[1].isdigit() and parts[2].lstrip("-").isdigit():
            positions.append(int(parts[2]))
    position = max(positions) + 1 if positions else 1
    return "%s:%s:%d" % (uuid, panel, position)


def cinnamon_without_one(uuid: str, current: list[str], all_instances: bool = False) -> list[str]:
    if all_instances:
        return [entry for entry in current if entry.split(":")[0] != uuid]
    kept: list[str] = []
    removed = False
    for entry in reversed(current):
        if not removed and entry.split(":")[0] == uuid:
            removed = True
            continue
        kept.append(entry)
    kept.reverse()
    return kept


def cinnamon_enable(kind: str, uuid: str, dry: bool) -> None:
    if cinnamon_enabled_entries(kind, uuid):
        ok("already enabled: %s" % uuid)
        return
    cinnamon_add_instance(kind, uuid, dry)


def cinnamon_add_instance(kind: str, uuid: str, dry: bool) -> bool:
    key = "enabled-applets" if kind == "applet" else "enabled-desklets"
    current = gsettings_get("org.cinnamon", key)
    if current is None:
        warn("gsettings unavailable; enable %s manually in System Settings" % uuid)
        return False
    if kind == "applet":
        entry = cinnamon_next_applet_entry(uuid, current)
    else:
        entry = cinnamon_next_desklet_entry(uuid, current)
    if gsettings_append_unique("org.cinnamon", key, entry, dry) and not dry:
        ok("enabled: %s" % entry)
        return True
    if dry:
        return True
    warn("could not enable %s; add it in System Settings" % uuid)
    return False


def cinnamon_remove_instance(kind: str, uuid: str, dry: bool, all_instances: bool = False) -> bool:
    key = "enabled-applets" if kind == "applet" else "enabled-desklets"
    current = gsettings_get("org.cinnamon", key)
    if current is None:
        return False
    kept = cinnamon_without_one(uuid, current, all_instances=all_instances)
    if kept == current:
        warn("no instance to remove: %s" % uuid)
        return False
    return gsettings_set_strv("org.cinnamon", key, kept, dry)


def cinnamon_disable(kind: str, uuid: str, dry: bool) -> None:
    cinnamon_remove_instance(kind, uuid, dry, all_instances=True)


def install_cinnamon(entry: dict, root: Path, dry: bool) -> bool:
    uuid = entry["uuid"]
    source = root / entry["dir"]
    if not source.is_dir():
        err("payload missing: " + str(source))
        return False
    if not replace_tree(source, cinnamon_target(entry["kind"], uuid), dry) and not dry:
        return False
    ok("installed: %s/%s" % (entry["kind"], uuid))
    cinnamon_enable(entry["kind"], uuid, dry)
    return True


def uninstall_cinnamon(entry: dict, dry: bool) -> bool:
    uuid = entry["uuid"]
    target = cinnamon_target(entry["kind"], uuid)
    if dry:
        log("  would remove: %s" % target)
    elif target.is_dir() or target.is_symlink():
        shutil.rmtree(target, ignore_errors=True)
        ok("removed: %s" % target)
    else:
        warn("not installed: %s" % target)
    cinnamon_disable(entry["kind"], uuid, dry)
    return True


def files_installed_cinnamon(entry: dict) -> bool:
    return cinnamon_target(entry["kind"], entry["uuid"]).is_dir()


def status_cinnamon(entry: dict) -> None:
    target = cinnamon_target(entry["kind"], entry["uuid"])
    version = read_version(target / "metadata.json")
    enabled = cinnamon_enabled_entries(entry["kind"], entry["uuid"])
    extra = "enabled, %d instance(s)" % len(enabled) if enabled else "disabled"
    describe(entry, version, extra=extra)


def add_instance_cinnamon(entry: dict, surface: str, dry: bool) -> bool:
    wanted = "desktop" if entry["kind"] == "desklet" else "panel"
    if surface != wanted:
        warn("%s belongs on the %s" % (entry.get("name") or entry["uuid"], wanted))
    return cinnamon_add_instance(entry["kind"], entry["uuid"], dry)


def remove_instance_cinnamon(entry: dict, dry: bool, all_instances: bool = False) -> bool:
    return cinnamon_remove_instance(entry["kind"], entry["uuid"], dry, all_instances=all_instances)


# ---------------------------------------------------------------- gnome

def gnome_target(uuid: str) -> Path:
    return Path.home() / ".local" / "share" / "gnome-shell" / "extensions" / uuid


def gnome_enable(uuid: str, dry: bool) -> bool:
    if which("gnome-extensions"):
        success, output = run(["gnome-extensions", "enable", uuid], dry)
        if success or dry:
            ok("enabled: %s" % uuid)
            return True
        warn(output or "could not enable %s; enable it in the Extensions app" % uuid)
        return False
    if gsettings_append_unique("org.gnome.shell", "enabled-extensions", uuid, dry) and not dry:
        ok("enabled: %s" % uuid)
        return True
    if dry:
        return True
    warn("could not enable %s; enable it in the Extensions app" % uuid)
    return False


def gnome_disable(uuid: str, dry: bool) -> bool:
    if which("gnome-extensions"):
        success, _ = run(["gnome-extensions", "disable", uuid], dry)
        return success or dry
    return gsettings_remove_all("org.gnome.shell", "enabled-extensions", uuid, dry)


def install_gnome(entry: dict, root: Path, dry: bool) -> bool:
    uuid = entry["uuid"]
    archive = root / entry["zip"]
    if not archive.is_file():
        err("payload missing: " + str(archive))
        return False

    if which("gnome-extensions"):
        success, output = run(["gnome-extensions", "install", "--force", str(archive)], dry)
        if not success and not dry:
            warn(output or "gnome-extensions install failed")
            return False
        ok("installed: %s" % uuid)
        gnome_enable(uuid, dry)
    else:
        warn("gnome-extensions not found; falling back to direct copy")
        if not extract_zip(archive, gnome_target(uuid), dry):
            return False
        ok("installed: %s" % uuid)
        gnome_enable(uuid, dry)

    if session_type() == "wayland":
        log("  note: on Wayland the extension loads after your next login")
    else:
        log("  note: on X11 press Alt+F2, type r, press Enter to reload the shell")
    return True


def uninstall_gnome(entry: dict, dry: bool) -> bool:
    uuid = entry["uuid"]
    if which("gnome-extensions"):
        run(["gnome-extensions", "disable", uuid], dry)
        success, _ = run(["gnome-extensions", "uninstall", uuid], dry)
        if success or dry:
            ok("removed: %s" % uuid)
            return True
    target = gnome_target(uuid)
    if dry:
        log("  would remove: %s" % target)
    elif target.is_dir():
        shutil.rmtree(target, ignore_errors=True)
        gsettings_remove_all("org.gnome.shell", "enabled-extensions", uuid, dry)
        ok("removed: %s" % target)
    else:
        warn("not installed: %s" % target)
    return True


def files_installed_gnome(entry: dict) -> bool:
    return gnome_target(entry["uuid"]).is_dir()


def uuid_enabled_gnome(uuid: str) -> bool:
    enabled = gsettings_get("org.gnome.shell", "enabled-extensions") or []
    return uuid in enabled


def status_gnome(entry: dict) -> None:
    target = gnome_target(entry["uuid"])
    version = read_version(target / "metadata.json")
    enabled = uuid_enabled_gnome(entry["uuid"])
    describe(entry, version, extra="enabled" if enabled else "disabled")


def add_instance_gnome(entry: dict, surface: str, dry: bool) -> bool:
    wanted = entry_surface(entry)
    if surface != wanted:
        warn("%s belongs on the %s" % (entry.get("name") or entry["uuid"], wanted))
    if uuid_enabled_gnome(entry["uuid"]):
        ok("already enabled: %s" % entry["uuid"])
        return True
    return gnome_enable(entry["uuid"], dry)


def remove_instance_gnome(entry: dict, dry: bool, all_instances: bool = False) -> bool:
    if gnome_disable(entry["uuid"], dry):
        ok("disabled: %s" % entry["uuid"])
        return True
    return False


# ---------------------------------------------------------------- kde

def kde_target(package_id: str) -> Path:
    return Path.home() / ".local" / "share" / "plasma" / "plasmoids" / package_id


def kde_add_script(package_id: str, surface: str) -> str:
    if surface == "panel":
        return (
            "var p = panels();\n"
            "if (p.length) { p[p.length - 1].addWidget(\"%s\"); }\n" % package_id
        )
    return (
        "var d = desktops();\n"
        "if (d.length) { d[0].addWidget(\"%s\"); }\n" % package_id
    )


def kde_remove_script(package_id: str, surface: str | None = None, all_instances: bool = False) -> str:
    all_flag = "true" if all_instances else "false"
    package = json.dumps(package_id)
    if surface == "panel":
        lists = "panels()"
    elif surface == "desktop":
        lists = "desktops()"
    else:
        lists = None
    drop = (
        "function drop(list, all) {\n"
        "  var removed = 0;\n"
        "  for (var i = 0; i < list.length; i++) {\n"
        "    var widgets = list[i].widgets();\n"
        "    for (var j = widgets.length - 1; j >= 0; j--) {\n"
        "      if (widgets[j].type === %s) {\n"
        "        widgets[j].remove();\n"
        "        removed += 1;\n"
        "        if (!all) return removed;\n"
        "      }\n"
        "    }\n"
        "  }\n"
        "  return removed;\n"
        "}\n" % package
    )
    if lists:
        return drop + "drop(%s, %s);\n" % (lists, all_flag)
    return (
        drop
        + "var n = drop(desktops(), %s);\n" % all_flag
        + "if (%s || n === 0) { drop(panels(), %s); }\n" % (all_flag, all_flag)
    )


def kde_eval(script: str, dry: bool) -> tuple[bool, str]:
    if which("qdbus"):
        return run(
            ["qdbus", "org.kde.plasmashell", "/PlasmaShell",
             "org.kde.PlasmaShell.evaluateScript", script],
            dry,
        )
    if which("qdbus6"):
        return run(
            ["qdbus6", "org.kde.plasmashell", "/PlasmaShell",
             "org.kde.PlasmaShell.evaluateScript", script],
            dry,
        )
    if which("gdbus"):
        return run(
            ["gdbus", "call", "--session",
             "--dest", "org.kde.plasmashell",
             "--object-path", "/PlasmaShell",
             "--method", "org.kde.PlasmaShell.evaluateScript",
             script],
            dry,
        )
    return False, "qdbus/gdbus not found"


def kde_add_instance(package_id: str, surface: str, dry: bool) -> bool:
    success, output = kde_eval(kde_add_script(package_id, surface), dry)
    if success or dry:
        ok("placed %s on the %s" % (package_id, surface))
        return True
    warn(output or "could not place %s; add it from Add Widgets" % package_id)
    return False


def kde_remove_instance(package_id: str, dry: bool, surface: str | None = None, all_instances: bool = False) -> bool:
    success, output = kde_eval(
        kde_remove_script(package_id, surface=surface, all_instances=all_instances),
        dry,
    )
    if success or dry:
        ok("removed instance: %s" % package_id)
        return True
    warn(output or "could not remove %s from the desktop or panel" % package_id)
    return False


def install_kde(entry: dict, root: Path, dry: bool) -> bool:
    package_id = entry["package_id"]
    source = root / entry["dir"]
    if not source.is_dir():
        err("payload missing: " + str(source))
        return False

    if which("kpackagetool6"):
        success, output = run(
            ["kpackagetool6", "--type=Plasma/Applet", "--install", str(source)], dry)
        if not success and not dry and "already exists" in output.lower():
            success, output = run(
                ["kpackagetool6", "--type=Plasma/Applet", "--upgrade", str(source)], dry)
        if not success and not dry:
            warn(output or "kpackagetool6 failed")
            return False
        ok("installed: %s" % package_id)
    else:
        warn("kpackagetool6 not found; falling back to direct copy")
        if not replace_tree(source, kde_target(package_id), dry):
            return False
        ok("installed: %s" % package_id)

    if not kde_add_instance(package_id, entry_surface(entry), dry):
        log("  note: right-click the panel or desktop, choose Add Widgets, and place it")
    return True


def uninstall_kde(entry: dict, dry: bool) -> bool:
    package_id = entry["package_id"]
    kde_remove_instance(package_id, dry, all_instances=True)
    if which("kpackagetool6"):
        success, _ = run(
            ["kpackagetool6", "--type=Plasma/Applet", "--remove", package_id], dry)
        if success or dry:
            ok("removed: %s" % package_id)
            return True
    target = kde_target(package_id)
    if dry:
        log("  would remove: %s" % target)
    elif target.is_dir():
        shutil.rmtree(target, ignore_errors=True)
        ok("removed: %s" % target)
    else:
        warn("not installed: %s" % target)
    return True


def files_installed_kde(entry: dict) -> bool:
    return kde_target(entry["package_id"]).is_dir()


def status_kde(entry: dict) -> None:
    target = kde_target(entry["package_id"])
    metadata = target / "metadata.json"
    version = None
    if metadata.is_file():
        try:
            version = json.loads(metadata.read_text(encoding="utf-8")).get("KPlugin", {}).get("Version")
        except Exception:
            version = None
    describe(entry, version)


def add_instance_kde(entry: dict, surface: str, dry: bool) -> bool:
    return kde_add_instance(entry["package_id"], surface, dry)


def remove_instance_kde(entry: dict, dry: bool, all_instances: bool = False) -> bool:
    return kde_remove_instance(entry["package_id"], dry, all_instances=all_instances)


# ---------------------------------------------------------------- shared

def read_version(metadata_path: Path) -> str | None:
    if not metadata_path.is_file():
        return None
    try:
        value = json.loads(metadata_path.read_text(encoding="utf-8")).get("version")
        return str(value) if value is not None else None
    except Exception:
        return None


def describe(entry: dict, installed_version: str | None, extra: str | None = None) -> None:
    name = entry.get("name") or entry.get("uuid") or entry.get("package_id")
    if installed_version is None:
        state = "not installed"
    elif installed_version == str(entry.get("version")):
        state = "installed, version %s" % installed_version
    else:
        state = "installed, version %s (bundle has %s)" % (installed_version, entry.get("version"))
    if extra:
        state += ", " + extra
    log("  %-24s %s" % (name, state))


INSTALLERS = {
    "cinnamon": install_cinnamon,
    "gnome": install_gnome,
    "kde": install_kde,
}

UNINSTALLERS = {
    "cinnamon": uninstall_cinnamon,
    "gnome": uninstall_gnome,
    "kde": uninstall_kde,
}

STATUS = {
    "cinnamon": status_cinnamon,
    "gnome": status_gnome,
    "kde": status_kde,
}

ADD_INSTANCE = {
    "cinnamon": add_instance_cinnamon,
    "gnome": add_instance_gnome,
    "kde": add_instance_kde,
}

REMOVE_INSTANCE = {
    "cinnamon": remove_instance_cinnamon,
    "gnome": remove_instance_gnome,
    "kde": remove_instance_kde,
}

FILES_INSTALLED = {
    "cinnamon": files_installed_cinnamon,
    "gnome": files_installed_gnome,
    "kde": files_installed_kde,
}


def resolve_entries(manifest: dict, desktop: str, only: list[str] | None) -> list[dict]:
    entries = manifest.get("desktops", {}).get(desktop, [])
    return filter_entries(entries, only)


# ---------------------------------------------------------------- update

def update_status(manifest: dict) -> dict:
    local = bundle_version(manifest)
    try:
        latest = fetch_latest_release()
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as error:
        return {"local": local, "error": str(error)}
    tag = latest.get("tag") or ""
    return {
        "local": local,
        "tag": tag,
        "url": latest.get("url"),
        "newer": bool(tag and latest.get("url") and version_newer(tag, local)),
    }


def apply_appimage_update(url: str, dry: bool = False) -> tuple[bool, str]:
    current = appimage_path()
    if current is None:
        return False, "not running from an AppImage; download " + url
    if dry:
        log("  would download %s over %s" % (url, current))
        return True, ""
    incoming = current.with_name(current.name + ".new")
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            incoming.write_bytes(response.read())
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        return False, str(error)
    incoming.chmod(0o755)
    os.replace(incoming, current)
    os.execv(str(current), [str(current)])
    return False, "failed to restart the updated AppImage"


# ---------------------------------------------------------------- gtk ui

def launch_gui(manifest: dict, desktop: str, root: Path) -> int:
    try:
        import gi
        gi.require_version("Gtk", "3.0")
        from gi.repository import GLib, Gtk
    except Exception:
        err("the manager UI needs python3-gi (GTK 3). Falling back to CLI.")
        err("Install python3-gi, or pass install, uninstall, or status.")
        return EXIT_MISSING_TOOL

    class Manager(Gtk.Window):
        def __init__(self) -> None:
            Gtk.Window.__init__(self, title="CurbSoftware Desktop Widgets")
            self.set_default_size(720, 520)
            self.connect("destroy", Gtk.main_quit)
            self.root = root
            self.desktop = desktop
            self.manifest = manifest
            self.entries = resolve_entries(manifest, desktop, None)

            layout = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8)
            layout.set_border_width(12)
            self.add(layout)

            self.header = Gtk.Label(xalign=0)
            self.header.set_text(environment_label(desktop))
            layout.pack_start(self.header, False, False, 0)

            self.update_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
            self.update_label = Gtk.Label(xalign=0)
            self.update_button = Gtk.Button(label="Update")
            self.update_button.connect("clicked", self.on_update)
            self.update_box.pack_start(self.update_label, True, True, 0)
            self.update_box.pack_start(self.update_button, False, False, 0)
            layout.pack_start(self.update_box, False, False, 0)
            self.update_box.set_no_show_all(True)
            self.update_box.hide()
            self._update = None

            scroller = Gtk.ScrolledWindow()
            scroller.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC)
            layout.pack_start(scroller, True, True, 0)
            self.list_box = Gtk.ListBox()
            self.list_box.set_selection_mode(Gtk.SelectionMode.NONE)
            scroller.add(self.list_box)

            buttons = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
            install_all = Gtk.Button(label="Install all")
            install_all.connect("clicked", lambda *_: self.run_all("install"))
            uninstall_all = Gtk.Button(label="Uninstall all")
            uninstall_all.connect("clicked", lambda *_: self.run_all("uninstall"))
            close_button = Gtk.Button(label="Close")
            close_button.connect("clicked", lambda *_: self.destroy())
            buttons.pack_start(install_all, False, False, 0)
            buttons.pack_start(uninstall_all, False, False, 0)
            buttons.pack_end(close_button, False, False, 0)
            layout.pack_start(buttons, False, False, 0)

            self.refresh()
            GLib.idle_add(self.check_update)

        def refresh(self) -> None:
            for child in list(self.list_box.get_children()):
                self.list_box.remove(child)
            for entry in self.entries:
                self.list_box.add(self.row_for(entry))
            self.list_box.show_all()

        def row_for(self, entry: dict) -> Gtk.ListBoxRow:
            installed = FILES_INSTALLED[self.desktop](entry)
            surface = entry_surface(entry)
            name = entry.get("name") or entry_key(entry)
            version = entry.get("version") or ""
            state = "installed" if installed else "not installed"
            if self.desktop == "cinnamon" and installed:
                count = len(cinnamon_enabled_entries(entry["kind"], entry["uuid"]))
                state = "%s, %d instance(s)" % (state, count)
            elif self.desktop == "gnome" and installed:
                state = "enabled" if uuid_enabled_gnome(entry["uuid"]) else "installed, disabled"

            row = Gtk.ListBoxRow()
            box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=4)
            box.set_border_width(8)
            title = Gtk.Label(xalign=0)
            title.set_markup("<b>%s</b>  %s  (%s)" % (name, version, state))
            box.pack_start(title, False, False, 0)

            actions = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
            install = Gtk.Button(label="Install")
            install.set_sensitive(not installed)
            install.connect("clicked", lambda *_e, item=entry: self.do_install(item))
            uninstall = Gtk.Button(label="Uninstall")
            uninstall.set_sensitive(installed)
            uninstall.connect("clicked", lambda *_e, item=entry: self.do_uninstall(item))
            add_desktop = Gtk.Button(label="Add to desktop")
            add_panel = Gtk.Button(label="Add to panel")
            add_desktop.set_sensitive(installed and (self.desktop == "kde" or surface == "desktop"))
            add_panel.set_sensitive(installed and (self.desktop == "kde" or surface == "panel"))
            add_desktop.connect("clicked", lambda *_e, item=entry: self.do_add(item, "desktop"))
            add_panel.connect("clicked", lambda *_e, item=entry: self.do_add(item, "panel"))
            remove = Gtk.Button(label="Remove instance")
            remove.set_sensitive(installed)
            remove.connect("clicked", lambda *_e, item=entry: self.do_remove(item))
            for widget in (install, add_desktop, add_panel, remove, uninstall):
                actions.pack_start(widget, False, False, 0)
            box.pack_start(actions, False, False, 0)
            row.add(box)
            return row

        def do_install(self, entry: dict) -> None:
            INSTALLERS[self.desktop](entry, self.root, False)
            self.refresh()

        def do_uninstall(self, entry: dict) -> None:
            UNINSTALLERS[self.desktop](entry, False)
            self.refresh()

        def do_add(self, entry: dict, surface: str) -> None:
            ADD_INSTANCE[self.desktop](entry, surface, False)
            self.refresh()

        def do_remove(self, entry: dict) -> None:
            REMOVE_INSTANCE[self.desktop](entry, False)
            self.refresh()

        def run_all(self, action: str) -> None:
            for entry in self.entries:
                if action == "install":
                    INSTALLERS[self.desktop](entry, self.root, False)
                else:
                    UNINSTALLERS[self.desktop](entry, False)
            self.refresh()

        def check_update(self) -> bool:
            info = update_status(self.manifest)
            self._update = info
            if info.get("newer"):
                self.update_box.set_no_show_all(False)
                self.update_label.set_text(
                    "Version %s is available (you have %s)."
                    % (info.get("tag"), info.get("local"))
                )
                self.update_box.show_all()
            elif info.get("error"):
                self.update_box.set_no_show_all(False)
                self.update_label.set_text("Could not check for updates: " + info["error"])
                self.update_button.set_sensitive(False)
                self.update_box.show_all()
            return False

        def on_update(self, _button) -> None:
            info = self._update or {}
            url = info.get("url")
            if not url:
                return
            success, message = apply_appimage_update(url, False)
            if not success:
                dialog = Gtk.MessageDialog(
                    parent=self,
                    flags=0,
                    message_type=Gtk.MessageType.WARNING,
                    buttons=Gtk.ButtonsType.OK,
                    text=message,
                )
                dialog.run()
                dialog.destroy()

    window = Manager()
    window.show_all()
    if not window.update_box.get_visible():
        window.update_box.hide()
    Gtk.main()
    return EXIT_OK


# ---------------------------------------------------------------- main

def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    result.add_argument(
        "action",
        nargs="?",
        default=None,
        choices=[
            "gui", "install", "uninstall", "status",
            "add-instance", "remove-instance", "update-check", "update",
        ],
    )
    result.add_argument("--desktop", choices=DESKTOPS,
                        help="override desktop detection")
    result.add_argument("--dry-run", action="store_true",
                        help="print what would happen without changing anything")
    result.add_argument("--list", action="store_true",
                        help="list the bundle contents for every desktop and exit")
    result.add_argument("--yes", "-y", action="store_true",
                        help="skip the confirmation prompt")
    result.add_argument("--allow-root", action="store_true",
                        help="permit running under sudo (installs are per-user)")
    result.add_argument(
        "--only",
        action="append",
        default=[],
        help="limit install/uninstall/status to this alias, uuid or package id (repeatable)",
    )
    result.add_argument(
        "--surface",
        choices=("desktop", "panel"),
        help="placement for add-instance (defaults to the widget's usual surface)",
    )
    result.add_argument(
        "--all",
        action="store_true",
        help="remove every instance of the widget (remove-instance)",
    )
    result.add_argument("widget", nargs="?", help="alias for add-instance or remove-instance")
    return result


def confirm(action: str, desktop: str, args) -> bool:
    if args.dry_run or args.yes:
        return True
    if not sys.stdin.isatty():
        err("non-interactive shell: pass --yes to proceed")
        return False
    try:
        reply = input("\n%s %s for %s? [y/N] " % ("Proceed with", action, desktop))
    except EOFError:
        return False
    return reply.strip().lower() in ("y", "yes")


def want_gui(args) -> bool:
    if args.action == "gui":
        return True
    if args.action is not None or args.list or args.dry_run:
        return False
    return bool(os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"))


def main() -> int:
    args = parser().parse_args()

    if os.geteuid() == 0 and not args.allow_root and not args.list and args.action not in ("status", "update-check"):
        err("running as root; everything this installer touches is per-user. "
            "Run it as your own account, or pass --allow-root to override")
        return EXIT_FAILED

    root = payload_root()
    if root is None:
        err("could not locate the bundled payload (payload/manifest.json)")
        return EXIT_UNSUPPORTED
    manifest = load_manifest(root)

    if args.list:
        bundle = manifest.get("bundle", {})
        log("%s version %s" % (bundle.get("name", "bundle"), bundle.get("version", "?")))
        for desktop in DESKTOPS:
            log("\n%s:" % desktop)
            for entry in manifest.get("desktops", {}).get(desktop, []):
                log("  %-24s version %s (%s)"
                    % (entry.get("name"), entry.get("version"), entry_surface(entry)))
        return EXIT_OK

    desktop = detect_desktop(args.desktop)
    if desktop is None:
        err("could not detect the desktop; pass --desktop=%s" % "|".join(DESKTOPS))
        return EXIT_UNSUPPORTED

    if want_gui(args):
        code = launch_gui(manifest, desktop, root)
        if code != EXIT_MISSING_TOOL:
            return code
        args.action = "status"

    action = args.action or "install"
    only = list(args.only)
    if args.widget and action in ("install", "uninstall", "status"):
        only.append(args.widget)

    try:
        entries = resolve_entries(manifest, desktop, only or None)
    except ValueError as error:
        err(str(error))
        return EXIT_FAILED

    if not entries and action not in ("update-check", "update"):
        err("the bundle ships nothing for " + desktop)
        return EXIT_UNSUPPORTED

    log("Detected desktop: %s" % desktop)
    log(environment_label(desktop))

    if action == "update-check":
        info = update_status(manifest)
        if info.get("error"):
            err("could not check for updates: " + info["error"])
            return EXIT_FAILED
        if info.get("newer"):
            ok("update available: %s (running %s)" % (info.get("tag"), info.get("local")))
            if info.get("url"):
                log("  " + info["url"])
            return EXIT_OK
        ok("up to date (%s)" % info.get("local"))
        return EXIT_OK

    if action == "update":
        info = update_status(manifest)
        if info.get("error"):
            err("could not check for updates: " + info["error"])
            return EXIT_FAILED
        if not info.get("newer"):
            ok("already on %s" % info.get("local"))
            return EXIT_OK
        success, message = apply_appimage_update(info["url"], args.dry_run)
        if args.dry_run:
            ok("Dry run complete, nothing changed")
            return EXIT_OK
        if not success:
            err(message)
            return EXIT_FAILED
        return EXIT_OK

    if action in ("add-instance", "remove-instance"):
        widget = args.widget
        if not widget:
            err("%s needs a widget alias" % action)
            return EXIT_FAILED
        try:
            chosen = filter_entries(entries, [widget])
        except ValueError as error:
            err(str(error))
            return EXIT_FAILED
        entry = chosen[0]
        if action == "add-instance":
            surface = args.surface or entry_surface(entry)
            ok_flag = ADD_INSTANCE[desktop](entry, surface, args.dry_run)
        else:
            ok_flag = REMOVE_INSTANCE[desktop](entry, args.dry_run, all_instances=args.all)
        return EXIT_OK if ok_flag else EXIT_FAILED

    needs_confirm = action in ("install", "uninstall")
    if needs_confirm and not confirm(action, desktop, args):
        log("Aborted.")
        return EXIT_OK

    failed = False
    if action == "status":
        log("")
        for entry in entries:
            STATUS[desktop](entry)
        return EXIT_OK

    for entry in entries:
        if action == "install":
            failed = not INSTALLERS[desktop](entry, root, args.dry_run) or failed
        else:
            failed = not UNINSTALLERS[desktop](entry, args.dry_run) or failed

    log("")
    if args.dry_run:
        ok("Dry run complete, nothing changed")
    elif failed:
        err("Completed with failures")
        return EXIT_FAILED
    else:
        ok("%s complete" % action)
    return EXIT_OK


if __name__ == "__main__":
    raise SystemExit(main())
