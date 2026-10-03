#!/usr/bin/env python3
"""Validate, test, and build the GNOME and KDE ports of the xlets.

Parallels spices-release.py (same subcommands, same gate philosophy,
same deterministic output rules) for the two non-Cinnamon desktops:
GNOME Shell extensions and KDE Plasma plasmoids. Reuses the Cinnamon
builder's helpers by loading the hyphenated sibling module.

Selection accepts an alias (matches every desktop of that family), an
alias qualified as <alias>@<desktop>, a uuid, a package id, or a
source directory name.

Output goes to dist/ports/:
    gnome/<uuid>/           staged extension tree
    gnome/<uuid>.zip        flat zip, metadata.json at zip root
    kde/<package_id>/       staged plasmoid package
    kde/<package_id>.tar.gz deterministic tarball
    cinnamon/<uuid>/        flat runtime dir, bundle payload only

The Cinnamon spices pipeline in dist/spices/ is untouched. The blocked
flag here only means "source tree not built yet"; it clears as each
phase of the ports effort lands.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT = ROOT / "dist" / "ports"
OUTPUT_MARKER = ".ports-release-output"
GENERATOR = Path(__file__).resolve().parent / "gen-tz-table.py"
EM_DASH = "\u2014"
TEXT_SUFFIXES = {".css", ".js", ".json", ".md", ".py", ".qml", ".sh", ".xml"}


def _load_spices_release():
    path = Path(__file__).resolve().parent / "spices-release.py"
    spec = importlib.util.spec_from_file_location("spices_release", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SR = _load_spices_release()
say = SR.say
display_path = SR.display_path
run_command = SR.run_command

# Ports ship no Spices packaging files and no icon (GNOME and KDE take
# icons from their own theme or metadata), so icon.png joins the
# runtime root excludes copied from the Cinnamon builder.
PORT_RUNTIME_ROOT_EXCLUDES = SR.RUNTIME_ROOT_EXCLUDES | {"icon.png"}
PORT_RUNTIME_DIR_EXCLUDES = SR.RUNTIME_DIR_EXCLUDES | {"node_modules"}
PORT_RUNTIME_SUFFIX_EXCLUDES = SR.RUNTIME_SUFFIX_EXCLUDES | {".tar.gz"}


def _gnome(alias: str, phase: int) -> dict:
    return {
        "alias": alias,
        "desktop": "gnome",
        "kind": "extension",
        "source": "gnome-%s@curbsoftware" % alias,
        "uuid": "gnome-%s@curbsoftware" % alias,
        "tests": (("gjs-m", "dev-tools/test-gnome-%s.js" % alias),),
        "blocked": "source tree not built yet (phase %d of the ports effort)" % phase,
    }


def _kde(alias: str, phase: int, tz: bool = False) -> dict:
    item = {
        "alias": alias,
        "desktop": "kde",
        "kind": "plasmoid",
        "source": "kde-%s" % alias,
        "package_id": "com.curbsoftware.%s" % alias.replace("-", ""),
        "tests": (("python3", "dev-tools/test-tz-table.py"),) if tz else (),
        "blocked": "source tree not built yet (phase %d of the ports effort)" % phase,
    }
    if tz:
        item["generate"] = "tz-table"
        item["tzdata"] = "contents/ui/lib/tzdata.js"
    return item


PORTS = (
    {"alias": "world-clock", "desktop": "gnome", "kind": "extension",
     "source": "gnome-world-clock@curbsoftware",
     "uuid": "gnome-world-clock@curbsoftware",
     "tests": (("isolated-gjs-m", "dev-tools/test-gnome-world-clock.js"),)},
    {"alias": "color-clock", "desktop": "gnome", "kind": "extension",
     "source": "gnome-color-clock@curbsoftware",
     "uuid": "gnome-color-clock@curbsoftware",
     "tests": (("isolated-gjs-m", "dev-tools/test-gnome-color-clock.js"),)},
    {"alias": "workspace-grid", "desktop": "gnome", "kind": "extension",
     "source": "gnome-workspace-grid@curbsoftware",
     "uuid": "gnome-workspace-grid@curbsoftware",
     "tests": (("gjs-m", "dev-tools/test-gnome-workspace-grid.js"),)},
    {"alias": "workspace-names", "desktop": "gnome", "kind": "extension",
     "source": "gnome-workspace-names@curbsoftware",
     "uuid": "gnome-workspace-names@curbsoftware",
     "tests": (("gjs-m", "dev-tools/test-gnome-workspace-names.js"),)},
    {"alias": "command-launcher", "desktop": "gnome", "kind": "extension",
     "source": "gnome-command-launcher@curbsoftware",
     "uuid": "gnome-command-launcher@curbsoftware",
     "tests": ()},
    {"alias": "panel-profiles", "desktop": "gnome", "kind": "extension",
     "source": "gnome-panel-profiles@curbsoftware",
     "uuid": "gnome-panel-profiles@curbsoftware",
     "tests": (("isolated-gjs-m", "dev-tools/test-gnome-panel-profiles.js"),)},
    {"alias": "world-clock", "desktop": "kde", "kind": "plasmoid",
     "source": "kde-world-clock",
     "package_id": "com.curbsoftware.worldclock",
     "generate": "tz-table",
     "tzdata": "contents/ui/lib/tzdata.js",
     "tests": (("python3", "dev-tools/test-tz-table.py"),
               ("node", "kde-world-clock/tests/test-tz.js"))},
    {"alias": "color-clock", "desktop": "kde", "kind": "plasmoid",
     "source": "kde-color-clock",
     "package_id": "com.curbsoftware.colorclock",
     "generate": "tz-table",
     "tzdata": "contents/ui/lib/tzdata.js",
     "tests": (("python3", "dev-tools/test-tz-table.py"),
               ("node", "kde-color-clock/tests/test-color-engine.js"))},
    {"alias": "workspace-grid", "desktop": "kde", "kind": "plasmoid",
     "source": "kde-workspace-grid",
     "package_id": "com.curbsoftware.workspacegrid",
     "tests": ()},
    {"alias": "workspace-names", "desktop": "kde", "kind": "plasmoid",
     "source": "kde-workspace-names",
     "package_id": "com.curbsoftware.workspacenames",
     "tests": ()},
    {"alias": "command-launcher", "desktop": "kde", "kind": "plasmoid",
     "source": "kde-command-launcher",
     "package_id": "com.curbsoftware.commandlauncher",
     "tests": (("node", "kde-command-launcher/tests/test-launcher.js"),)},
    {"alias": "panel-profiles", "desktop": "kde", "kind": "plasmoid",
     "source": "kde-panel-profiles",
     "package_id": "com.curbsoftware.panelprofiles",
     "tests": (("node", "kde-panel-profiles/tests/test-layouts.js"),)},
)


def select_ports(values: list[str]) -> list[dict]:
    if not values or values == ["all"]:
        return list(PORTS)
    found = []
    for value in values:
        alias, _, desktop = value.partition("@")
        matches = [item for item in PORTS
                   if (item["alias"] == alias
                       and (not desktop or item["desktop"] == desktop))
                   or value in {item.get("uuid"), item["source"], item.get("package_id")}]
        if not matches:
            raise ValueError("Unknown port: " + value)
        for match in matches:
            if match not in found:
                found.append(match)
    return found


def em_dash_scan(source: Path) -> list[str]:
    """The repo bans em-dashes in every shipped or documented file."""
    failures = []
    for path in sorted(source.rglob("*")):
        if not path.is_file() or path.suffix not in TEXT_SUFFIXES:
            continue
        text = path.read_text(encoding="utf-8")
        count = text.count(EM_DASH)
        if count:
            failures.append("em-dash present (%d): %s"
                            % (count, path.relative_to(source)))
    return failures


def check_gnome(item: dict) -> tuple[list[str], list[str]]:
    failures: list[str] = []
    warnings: list[str] = []
    source = ROOT / item["source"]
    uuid = item["uuid"]

    if item.get("blocked"):
        failures.append(item["blocked"])
    if item.get("warning"):
        warnings.append(item["warning"])
    if not source.is_dir():
        failures.append("missing source directory: " + item["source"])
        return failures, warnings
    if source.name != uuid:
        failures.append("source directory does not match extension uuid: " + source.name)

    for name in ("metadata.json", "extension.js", "prefs.js"):
        if not (source / name).is_file():
            failures.append("missing required file: " + name)

    metadata_path = source / "metadata.json"
    metadata = {}
    if metadata_path.is_file():
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        except Exception as error:
            failures.append("metadata.json is invalid JSON: " + str(error))
    for field in ("uuid", "name", "description", "version", "shell-version"):
        if field not in metadata:
            failures.append("metadata.json missing field: " + field)
    if metadata.get("uuid") != uuid:
        failures.append("metadata uuid does not match the release uuid")
    shell_versions = metadata.get("shell-version")
    if isinstance(shell_versions, list) and shell_versions:
        for entry in shell_versions:
            if not isinstance(entry, str):
                warnings.append("shell-version entries should be strings: %r" % entry)

    failures.extend(em_dash_scan(source))
    return failures, warnings


def check_kde(item: dict) -> tuple[list[str], list[str]]:
    failures: list[str] = []
    warnings: list[str] = []
    source = ROOT / item["source"]
    package_id = item["package_id"]

    if item.get("blocked"):
        failures.append(item["blocked"])
    if item.get("warning"):
        warnings.append(item["warning"])
    if not source.is_dir():
        failures.append("missing source directory: " + item["source"])
        return failures, warnings

    for name in ("metadata.json", "contents/ui/main.qml", "contents/config/main.xml"):
        if not (source / name).is_file():
            failures.append("missing required file: " + name)

    metadata_path = source / "metadata.json"
    metadata = {}
    if metadata_path.is_file():
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        except Exception as error:
            failures.append("metadata.json is invalid JSON: " + str(error))
    plugin = metadata.get("KPlugin")
    if not isinstance(plugin, dict):
        failures.append("metadata.json missing the KPlugin object")
        plugin = {}
    for field in ("Id", "Name", "Description", "Version"):
        if field not in plugin:
            failures.append("KPlugin missing field: " + field)
    if plugin.get("Id") != package_id:
        failures.append("KPlugin Id does not match the release package id")
    if metadata.get("KPackageStructure") != "Plasma/Applet":
        failures.append("KPackageStructure must be Plasma/Applet")

    if item.get("generate") == "tz-table":
        tzdata = source / item["tzdata"]
        if not tzdata.is_file():
            warnings.append("timezone table missing; build generates it: "
                            "python3 dev-tools/ports-release.py build %s@kde" % item["alias"])
        elif tzdata.stat().st_mtime < GENERATOR.stat().st_mtime:
            warnings.append("timezone table is older than the generator; rerun build")

    failures.extend(em_dash_scan(source))
    return failures, warnings


def port_runtime_files(source: Path) -> list[Path]:
    files = []
    for path in source.rglob("*"):
        if not path.is_file():
            continue
        relative = path.relative_to(source)
        if relative.parts[0] in PORT_RUNTIME_DIR_EXCLUDES:
            continue
        if len(relative.parts) == 1 and relative.name in PORT_RUNTIME_ROOT_EXCLUDES:
            continue
        if any(part in PORT_RUNTIME_DIR_EXCLUDES for part in relative.parts[:-1]):
            continue
        if relative.suffix in PORT_RUNTIME_SUFFIX_EXCLUDES or relative.name.endswith("~"):
            continue
        files.append(relative)
    return sorted(files)


def stage_port(item: dict, destination: Path) -> Path:
    source = ROOT / item["source"]
    name = item.get("uuid") or item["package_id"]
    stage = destination / name
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir(parents=True)
    for relative in port_runtime_files(source):
        target = stage / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source / relative, target)
    return stage


def staged_checks(stage: Path, item: dict) -> list[str]:
    failures = []
    if not (stage / "metadata.json").is_file():
        failures.append("staged package is missing metadata.json at its root")
    if item["desktop"] == "gnome" and not (stage / "extension.js").is_file():
        failures.append("staged extension is missing extension.js at its root")
    if item["desktop"] == "kde" and not (stage / "contents/ui/main.qml").is_file():
        failures.append("staged plasmoid is missing contents/ui/main.qml")
    for path in stage.rglob("*"):
        if not path.is_file():
            continue
        relative = path.relative_to(stage)
        if relative.suffix in PORT_RUNTIME_SUFFIX_EXCLUDES or relative.name.endswith("~"):
            failures.append("temporary or generated junk staged: " + str(relative))
        if relative.parts[0] in {"tests", "docs", "screenshots", "fixtures"}:
            failures.append("dev-only directory staged: " + str(relative))
    return failures


def deterministic_zip_flat(stage: Path, output: Path) -> None:
    """Like spices-release.deterministic_zip but with no stage-name prefix.

    gnome-extensions install unpacks the zip directly into the extensions
    directory, so metadata.json must sit at the zip root.
    """
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        output.unlink()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(stage.rglob("*")):
            if not path.is_file():
                continue
            info = zipfile.ZipInfo(str(path.relative_to(stage)), date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o755 if os.access(path, os.X_OK) else 0o644) << 16
            archive.writestr(info, path.read_bytes())


def deterministic_tar(package_dir: Path, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        output.unlink()
    with output.open("wb") as raw:
        with tarfile.open(fileobj=raw, mode="w:gz", format=tarfile.GNU_FORMAT) as archive:
            for path in sorted(package_dir.rglob("*")):
                if not path.is_file():
                    continue
                info = archive.gettarinfo(str(path), arcname=str(path.relative_to(package_dir)))
                info.mtime = 315532800  # 1980-01-01, matching the zip stamp
                info.uid = 0
                info.gid = 0
                info.uname = ""
                info.gname = ""
                info.mode = 0o755 if os.access(path, os.X_OK) else 0o644
                with path.open("rb") as handle:
                    archive.addfile(info, handle)


def generate_assets(item: dict) -> bool:
    if item.get("generate") != "tz-table":
        return True
    target = ROOT / item["source"] / item["tzdata"]
    say("  generate " + display_path(target))
    return run_command(("python3", str(GENERATOR), "--out", str(target)))


def generic_port_test(item: dict) -> bool:
    source = ROOT / item["source"]
    if not source.is_dir():
        say("  FAIL missing source directory: " + item["source"])
        return False
    ok = True
    for path in sorted(source.rglob("*.json")):
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except Exception as error:
            say("  FAIL invalid JSON %s: %s" % (path.relative_to(ROOT), error))
            ok = False
    if item["desktop"] == "gnome":
        # Only lib/ is pure ESM; extension.js and prefs.js import St and
        # GTK, which no headless run can load. Those still get a syntax
        # check (node parses ESM when the suffix says so) and their gate
        # is the live checklist in each tree's DEVELOPMENT.md.
        for path in sorted((source / "lib").glob("*.js")) if (source / "lib").is_dir() else []:
            ok = run_command(("gjs", "-m", str(path.relative_to(ROOT)))) and ok
        for path in sorted(source.rglob("*.js")):
            if "tests" in path.relative_to(source).parts:
                continue
            with tempfile.NamedTemporaryFile(suffix=".mjs") as mirror:
                mirror.write(path.read_bytes())
                mirror.flush()
                result = subprocess.run(("node", "--check", mirror.name),
                                        cwd=ROOT, capture_output=True)
            if result.returncode != 0:
                say("  FAIL invalid ESM syntax %s: %s"
                    % (path.relative_to(ROOT), result.stderr.decode("utf-8", "replace").strip()))
                ok = False
    else:
        for path in sorted(source.rglob("*.js")):
            if "tests" in path.relative_to(source).parts:
                continue
            # QML libraries start with .pragma/.import lines that plain
            # JavaScript rejects; strip them for the syntax check only.
            text = path.read_text(encoding="utf-8")
            stripped = "\n".join(line for line in text.splitlines()
                                 if not line.startswith(".pragma") and
                                 not line.startswith(".import"))
            with tempfile.NamedTemporaryFile(suffix=".js", mode="w") as mirror:
                mirror.write(stripped)
                mirror.flush()
                result = subprocess.run(("node", "--check", mirror.name),
                                        cwd=ROOT, capture_output=True)
            if result.returncode != 0:
                say("  FAIL invalid JS %s: %s"
                    % (path.relative_to(ROOT), result.stderr.decode("utf-8", "replace").strip()))
                ok = False
    return ok


def check_item(item: dict) -> bool:
    failures, warnings = check_gnome(item) if item["desktop"] == "gnome" else check_kde(item)
    name = item.get("uuid") or item["package_id"]
    say("\nCHECK %s [%s]" % (name, item["desktop"]))
    for warning in warnings:
        say("  WARN " + warning)
    for failure in failures:
        say("  FAIL " + failure)
    if not failures:
        say("  PASS source layout")
    return not failures


def test_item(item: dict) -> bool:
    name = item.get("uuid") or item["package_id"]
    say("\nTEST %s [%s]" % (name, item["desktop"]))
    ok = generic_port_test(item)
    for command in item["tests"]:
        if command[0] == "isolated-gjs-m":
            # Store tests write settings; keep them off the real HOME.
            with tempfile.TemporaryDirectory(prefix="ports-test-") as config:
                env = dict(os.environ, XDG_CONFIG_HOME=config)
                ok = run_command(("gjs", "-m") + command[1:], env) and ok
        elif command[0] == "gjs-m":
            ok = run_command(("gjs", "-m") + command[1:]) and ok
        else:
            ok = run_command(command) and ok
    say("  " + ("PASS" if ok else "FAIL") + " test gate")
    return ok


def claim_output_dir(output_dir: Path) -> bool:
    if output_dir in {Path("/"), Path.home().resolve(), ROOT.resolve()}:
        say("  FAIL refusing unsafe output directory: " + str(output_dir))
        return False
    marker = output_dir / OUTPUT_MARKER
    if output_dir.exists() and any(output_dir.iterdir()) and not marker.is_file():
        say("  FAIL output directory is not owned by this release tool: " + str(output_dir))
        return False
    output_dir.mkdir(parents=True, exist_ok=True)
    marker.touch(exist_ok=True)
    return True


def build_item(item: dict, output_dir: Path) -> bool:
    if not generate_assets(item):
        say("  SKIP build because generation failed")
        return False
    if not check_item(item):
        say("  SKIP build because source checks failed")
        return False
    if not claim_output_dir(output_dir):
        return False
    desktop_dir = output_dir / item["desktop"]
    stage = stage_port(item, desktop_dir)
    failures = staged_checks(stage, item)
    if failures:
        for failure in failures:
            say("  FAIL " + failure)
        return False
    name = item.get("uuid") or item["package_id"]
    if item["desktop"] == "gnome":
        archive = desktop_dir / (name + ".zip")
        deterministic_zip_flat(stage, archive)
    else:
        archive = desktop_dir / (name + ".tar.gz")
        deterministic_tar(stage, archive)
    say("  BUILT " + display_path(stage))
    say("  BUILT " + display_path(archive))
    return True


def stage_cinnamon_payload(output_dir: Path) -> bool:
    """Flat runtime trees for the bundle AppImage.

    Includes every Cinnamon xlet, blocked ones too: blocked means "do
    not submit to the Spices registry", not "do not ship".
    """
    if not claim_output_dir(output_dir):
        return False
    destination = output_dir / "cinnamon"
    destination.mkdir(parents=True, exist_ok=True)
    for item in SR.EXTENSIONS:
        source = ROOT / item["source"]
        stage = destination / item["uuid"]
        if stage.exists():
            shutil.rmtree(stage)
        stage.mkdir(parents=True)
        for relative in SR.runtime_files(source):
            target = stage / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source / relative, target)
        say("  BUILT " + display_path(stage))
    return True


APPIMAGE_ASSETS = ROOT / "dev-tools" / "appimage"
BUNDLE_NAME = "curb-desktop-widgets"
APPIMAGETOOL_URL = ("https://github.com/AppImage/appimagetool/releases/download/"
                    "continuous/appimagetool-x86_64.AppImage")
PANEL_ALIASES = {"workspace-names", "command-launcher", "panel-profiles"}


def widget_surface(alias: str) -> str:
    return "panel" if alias in PANEL_ALIASES else "desktop"


def port_repo_name(item: dict) -> str:
    if item.get("repo"):
        return item["repo"]
    if item["desktop"] == "gnome":
        return item["uuid"].split("@")[0]
    return item["source"]


def bundle_version() -> str:
    path = APPIMAGE_ASSETS / "VERSION"
    try:
        return path.read_text(encoding="utf-8").strip()
    except OSError:
        return "0.0.0"


def read_metadata(source: Path) -> dict:
    try:
        return json.loads((source / "metadata.json").read_text(encoding="utf-8"))
    except Exception:
        return {}


def build_manifest(output_dir: Path) -> Path | None:
    """Assemble payload/manifest.json, the installer's single source of truth."""
    desktops: dict[str, list[dict]] = {"cinnamon": [], "gnome": [], "kde": []}

    for item in SR.EXTENSIONS:
        metadata = read_metadata(ROOT / item["source"])
        desktops["cinnamon"].append({
            "alias": item["alias"],
            "uuid": item["uuid"],
            "kind": item["kind"],
            "name": metadata.get("name", item["alias"]),
            "version": str(metadata.get("version", "")),
            "dir": "cinnamon/" + item["uuid"],
            "surface": widget_surface(item["alias"]),
        })
    for item in PORTS:
        if item.get("blocked"):
            continue
        metadata = read_metadata(ROOT / item["source"])
        if item["desktop"] == "gnome":
            desktops["gnome"].append({
                "alias": item["alias"],
                "uuid": item["uuid"],
                "name": metadata.get("name", item["alias"]),
                "version": str(metadata.get("version", "")),
                "zip": "gnome/%s.zip" % item["uuid"],
                "surface": widget_surface(item["alias"]),
            })
        else:
            plugin = metadata.get("KPlugin", {})
            desktops["kde"].append({
                "alias": item["alias"],
                "package_id": item["package_id"],
                "name": plugin.get("Name", item["alias"]),
                "version": str(plugin.get("Version", "")),
                "dir": "kde/" + item["package_id"],
                "surface": widget_surface(item["alias"]),
            })

    manifest = {
        "bundle": {"name": "CurbSoftware Desktop Widgets", "version": bundle_version()},
        "desktops": desktops,
    }
    path = output_dir / "manifest.json"
    path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def ensure_appimagetool(explicit: Path | None) -> Path | None:
    if explicit:
        return explicit if explicit.is_file() else None
    cache = ROOT / "dev-tools" / "cache" / "appimagetool-x86_64.AppImage"
    if cache.is_file():
        return cache
    say("  downloading appimagetool once into dev-tools/cache/")
    cache.parent.mkdir(parents=True, exist_ok=True)
    import urllib.request
    try:
        with urllib.request.urlopen(APPIMAGETOOL_URL, timeout=60) as response:
            cache.write_bytes(response.read())
    except Exception as error:
        say("  FAIL could not download appimagetool: " + str(error))
        return None
    cache.chmod(0o755)
    return cache


def build_bundle(output_dir: Path, appimagetool_arg: Path | None, arch: str) -> bool:
    say("\nBUNDLE " + BUNDLE_NAME)

    if not claim_output_dir(output_dir):
        return False

    appdir = output_dir / (BUNDLE_NAME + ".AppDir")
    if appdir.exists():
        shutil.rmtree(appdir)
    (appdir / "usr" / "bin").mkdir(parents=True)
    (appdir / "payload").mkdir(parents=True)

    shutil.copy2(APPIMAGE_ASSETS / "AppRun", appdir / "AppRun")
    (appdir / "AppRun").chmod(0o755)
    shutil.copy2(APPIMAGE_ASSETS / (BUNDLE_NAME + ".desktop"),
                 appdir / (BUNDLE_NAME + ".desktop"))
    shutil.copy2(APPIMAGE_ASSETS / (BUNDLE_NAME + ".png"),
                 appdir / (BUNDLE_NAME + ".png"))
    shutil.copy2(ROOT / "dev-tools" / "bundle-installer.py",
                 appdir / "usr" / "bin" / "bundle-installer.py")

    for area in ("cinnamon", "gnome", "kde"):
        source = output_dir / area
        if not source.is_dir():
            continue
        for entry in sorted(source.iterdir()):
            target = appdir / "payload" / area / entry.name
            if entry.is_dir():
                shutil.copytree(entry, target)
            else:
                shutil.copy2(entry, target)

    manifest = build_manifest(appdir / "payload")
    if manifest is None:
        say("  FAIL could not write the payload manifest")
        return False
    say("  BUILT " + display_path(manifest))

    tool = ensure_appimagetool(appimagetool_arg)
    output = output_dir / ("%s-%s.AppImage" % (BUNDLE_NAME, arch))
    if tool is None:
        say("  WARN appimagetool unavailable; the AppDir is complete at:")
        say("       " + display_path(appdir))
        say("       build an AppImage with: ARCH=%s %s %s %s"
            % (arch, "appimagetool", appdir, output))
        return True

    environment = dict(os.environ, ARCH=arch, APPIMAGE_EXTRACT_AND_RUN="1")
    result = subprocess.run([str(tool), str(appdir), str(output)],
                            cwd=ROOT, env=environment)
    if result.returncode != 0:
        say("  FAIL appimagetool exited " + str(result.returncode))
        return False
    say("  BUILT " + display_path(output))
    return True


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    commands = result.add_subparsers(dest="command", required=True)
    list_parser = commands.add_parser("list", help="show port status")
    list_parser.add_argument("--json", action="store_true", help="emit machine-readable metadata")
    for name in ("check", "test", "build"):
        sub = commands.add_parser(name)
        sub.add_argument("ports", nargs="*", default=["all"])
        if name == "build":
            sub.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
            sub.add_argument("--skip-cinnamon", action="store_true",
                             help="skip staging the Cinnamon bundle payload")
    bundle_parser = commands.add_parser(
        "bundle", help="build every unblocked port, then assemble the AppImage")
    bundle_parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    bundle_parser.add_argument("--appimagetool", type=Path,
                               help="path to an appimagetool binary")
    bundle_parser.add_argument("--arch", default="x86_64")
    return result


def main() -> int:
    args = parser().parse_args()

    if args.command == "bundle":
        output_dir = args.output_dir.resolve()
        passed = True
        for item in PORTS:
            if item.get("blocked"):
                continue
            passed = build_item(item, output_dir) and passed
        passed = stage_cinnamon_payload(output_dir) and passed
        if not passed:
            say("  SKIP bundle because builds failed")
            return 1
        return 0 if build_bundle(output_dir, args.appimagetool, args.arch) else 1

    try:
        items = select_ports(getattr(args, "ports", ["all"]))
    except ValueError as error:
        print(error, file=sys.stderr)
        return 2

    if args.command == "list":
        if args.json:
            payload = [{
                "alias": item["alias"],
                "desktop": item["desktop"],
                "kind": item["kind"],
                "uuid": item.get("uuid"),
                "package_id": item.get("package_id"),
                "source": item["source"],
                "repo": port_repo_name(item),
                "surface": widget_surface(item["alias"]),
                "status": "blocked" if item.get("blocked") else "candidate",
                "reason": item.get("blocked"),
            } for item in items]
            print(json.dumps(payload, indent=2, sort_keys=True))
            return 0
        for item in items:
            name = item.get("uuid") or item["package_id"]
            status = "BLOCKED" if item.get("blocked") else "CANDIDATE"
            say("%-9s %-6s %-10s %s" % (status, item["desktop"], item["kind"], name))
            if item.get("blocked"):
                say("  " + item["blocked"])
        return 0

    passed = True
    for item in items:
        if args.command == "check":
            passed = check_item(item) and passed
        elif args.command == "test":
            passed = test_item(item) and passed
        elif args.command == "build":
            passed = build_item(item, args.output_dir.resolve()) and passed
    if args.command == "build" and not args.skip_cinnamon:
        passed = stage_cinnamon_payload(args.output_dir.resolve()) and passed
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
