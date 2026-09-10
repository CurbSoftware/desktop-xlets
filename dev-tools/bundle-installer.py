#!/usr/bin/env python3
"""Install CurbSoftware desktop widgets for the running desktop.

Desktop shells load widgets from fixed user directories, so this bundle
is an installer rather than a runtime. It detects the desktop, installs
the matching variants from the bundled payload, and enables them.

Everything is HOME scoped. No root needed, and running under sudo is
refused unless --allow-root is passed.

Actions:
    install     (default) install and enable every payload for this desktop
    uninstall   disable and remove them again
    status      show what is installed, with versions

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
import zipfile
from pathlib import Path

EXIT_OK = 0
EXIT_FAILED = 1
EXIT_UNSUPPORTED = 2
EXIT_MISSING_TOOL = 3

DESKTOPS = ("cinnamon", "gnome", "kde")
DEFAULT_DESKLET_POSITION = (100, 100)


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


# ---------------------------------------------------------------- detection

def detect_desktop(override: str | None) -> str | None:
    if override:
        return override

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

    found = match(os.environ.get("XDG_CURRENT_DESKTOP", ""))
    if found:
        return found
    found = match(os.environ.get("XDG_SESSION_DESKTOP", ""))
    if found:
        return found
    for name, binary in (("cinnamon", "cinnamon"), ("kde", "plasmashell"), ("gnome", "gnome-shell")):
        if shutil.which(binary):
            return name
    return None


def session_type() -> str:
    return os.environ.get("XDG_SESSION_TYPE", "unknown")


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


# GSettings strv values print in GVariant text form, which for simple
# string lists looks exactly like a Python list literal.

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


def cinnamon_enable(kind: str, uuid: str, dry: bool) -> None:
    key = "enabled-applets" if kind == "applet" else "enabled-desklets"
    current = gsettings_get("org.cinnamon", key)
    if current is None:
        warn("gsettings unavailable; enable %s manually in System Settings" % uuid)
        return
    if any(entry.split(":")[0] == uuid for entry in current):
        ok("already enabled: %s" % uuid)
        return

    if kind == "applet":
        # Entries look like uuid:panel:position. Append past the furthest
        # position on the first panel; drag the applet afterwards if the
        # spot is not where you want it.
        positions = []
        for entry in current:
            parts = entry.split(":")
            if len(parts) == 3 and parts[0] != uuid and parts[1].isdigit() and parts[2].lstrip("-").isdigit():
                positions.append(int(parts[2]))
        position = max(positions) + 1 if positions else 1
        entry = "%s:1:%d" % (uuid, position)
    else:
        # Entries look like uuid:instance:x:y. Take the next free id.
        ids = []
        for existing in cinnamon_enabled_entries(kind, uuid):
            parts = existing.split(":")
            if len(parts) == 4 and parts[1].isdigit():
                ids.append(int(parts[1]))
        instance = max(ids) + 1 if ids else 1
        entry = "%s:%d:%d:%d" % (uuid, instance, *DEFAULT_DESKLET_POSITION)

    if gsettings_append_unique("org.cinnamon", key, entry, dry) and not dry:
        ok("enabled: %s" % entry)
    elif not dry:
        warn("could not enable %s; add it in System Settings" % uuid)


def cinnamon_disable(kind: str, uuid: str, dry: bool) -> None:
    key = "enabled-applets" if kind == "applet" else "enabled-desklets"
    current = gsettings_get("org.cinnamon", key)
    if current is None:
        return
    kept = [entry for entry in current if entry.split(":")[0] != uuid]
    if len(kept) != len(current):
        gsettings_set_strv("org.cinnamon", key, kept, dry)


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


def status_cinnamon(entry: dict) -> None:
    target = cinnamon_target(entry["kind"], entry["uuid"])
    version = read_version(target / "metadata.json")
    enabled = bool(cinnamon_enabled_entries(entry["kind"], entry["uuid"]))
    describe(entry, version, extra="enabled" if enabled else "disabled")


# ---------------------------------------------------------------- gnome

def gnome_target(uuid: str) -> Path:
    return Path.home() / ".local" / "share" / "gnome-shell" / "extensions" / uuid


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
        success, _ = run(["gnome-extensions", "enable", uuid], dry)
        if success or dry:
            ok("enabled: %s" % uuid)
        else:
            warn("could not enable %s; enable it in the Extensions app" % uuid)
    else:
        warn("gnome-extensions not found; falling back to direct copy")
        if not extract_zip(archive, gnome_target(uuid), dry):
            return False
        ok("installed: %s" % uuid)
        if gsettings_append_unique("org.gnome.shell", "enabled-extensions", uuid, dry) and not dry:
            ok("enabled: %s" % uuid)
        elif not dry:
            warn("could not enable %s; enable it in the Extensions app" % uuid)

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


def status_gnome(entry: dict) -> None:
    target = gnome_target(entry["uuid"])
    version = read_version(target / "metadata.json")
    enabled = uuid_enabled_gnome(entry["uuid"])
    describe(entry, version, extra="enabled" if enabled else "disabled")


def uuid_enabled_gnome(uuid: str) -> bool:
    enabled = gsettings_get("org.gnome.shell", "enabled-extensions") or []
    return uuid in enabled


# ---------------------------------------------------------------- kde

def kde_target(package_id: str) -> Path:
    return Path.home() / ".local" / "share" / "plasma" / "plasmoids" / package_id


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

    log("  note: right-click the panel or desktop, choose Add Widgets, and place it")
    return True


def uninstall_kde(entry: dict, dry: bool) -> bool:
    package_id = entry["package_id"]
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


# ---------------------------------------------------------------- main

def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    result.add_argument("action", nargs="?", default="install",
                        choices=["install", "uninstall", "status"])
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


def main() -> int:
    args = parser().parse_args()

    if os.geteuid() == 0 and not args.allow_root:
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
                log("  %-24s version %s" % (entry.get("name"), entry.get("version")))
        return EXIT_OK

    desktop = detect_desktop(args.desktop)
    if desktop is None:
        err("could not detect the desktop; pass --desktop=%s" % "|".join(DESKTOPS))
        return EXIT_UNSUPPORTED

    entries = manifest.get("desktops", {}).get(desktop, [])
    if not entries:
        err("the bundle ships nothing for " + desktop)
        return EXIT_UNSUPPORTED

    log("Detected desktop: %s" % desktop)
    needs_confirm = args.action in ("install", "uninstall")
    if needs_confirm and not confirm(args.action, desktop, args):
        log("Aborted.")
        return EXIT_OK

    failed = False
    if args.action == "status":
        log("")
        for entry in entries:
            STATUS[desktop](entry)
        return EXIT_OK

    for entry in entries:
        if args.action == "install":
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
        ok("%s complete" % args.action)
    return EXIT_OK


if __name__ == "__main__":
    raise SystemExit(main())
