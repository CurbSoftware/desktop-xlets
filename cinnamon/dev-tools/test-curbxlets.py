#!/usr/bin/env python3
"""CurbXlets manager, catalog, and installer checks.

Headless unittest suite for the widget window, install and placement
actions, the Cinnamon / GNOME / KDE catalog, and the versioned AppImage
name. GTK is realized on the current display and torn down immediately.
The suite does not enter Gtk.main, and it does not call gsettings,
gnome-extensions, kpackagetool, or qdbus.

    python3 cinnamon/dev-tools/test-curbxlets.py
"""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
import sys
import tempfile
import unittest
import zipfile
from argparse import Namespace
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO = ROOT.parent
PUBLISHED_DIR = Path("/home/user/projects/published/curbxlets")
ASSET = "CurbXlets-1.1.0-x86_64.AppImage"

CINNAMON_WIDGETS = (
    ("world-clock", "World Clock", "desklet", "desktop",
     "cinnamon-world-clock-desklet@curbsoftware"),
    ("color-clock", "Color Timer Clock", "desklet", "desktop",
     "cinnamon-color-timer-clock-desklet@curbsoftware"),
    ("workspace-grid", "Workspace Grid", "desklet", "desktop",
     "cinnamon-workspace-grid-desklet@curbsoftware"),
    ("workspace-names", "In Panel Workspace Name", "applet", "panel",
     "cinnamon-workspace-names-applet@curbsoftware"),
    ("panel-profiles", "Panel Profiles", "applet", "panel",
     "cinnamon-panel-profiles-applet@curbsoftware"),
    ("command-launcher", "Command Launcher", "applet", "panel",
     "cinnamon-command-launcher-applet@curbsoftware"),
)

GNOME_WIDGETS = (
    ("world-clock", "World Clock", "desktop", "gnome-world-clock@curbsoftware"),
    ("color-clock", "Color Timer Clock", "desktop", "gnome-color-clock@curbsoftware"),
    ("workspace-grid", "Workspace Grid", "desktop", "gnome-workspace-grid@curbsoftware"),
    ("workspace-names", "Workspace Names", "panel", "gnome-workspace-names@curbsoftware"),
    ("command-launcher", "Command Launcher", "panel", "gnome-command-launcher@curbsoftware"),
    ("panel-profiles", "Desktop Profiles", "panel", "gnome-panel-profiles@curbsoftware"),
)

KDE_WIDGETS = (
    ("world-clock", "World Clock", "desktop", "com.curbsoftware.worldclock"),
    ("color-clock", "Color Timer Clock", "desktop", "com.curbsoftware.colorclock"),
    ("workspace-grid", "Workspace Grid", "desktop", "com.curbsoftware.workspacegrid"),
    ("workspace-names", "Workspace Names", "panel", "com.curbsoftware.workspacenames"),
    ("command-launcher", "Command Launcher", "panel", "com.curbsoftware.commandlauncher"),
    ("panel-profiles", "Plasma Layouts", "panel", "com.curbsoftware.panelprofiles"),
)


def load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


BI = load("bundle_installer", ROOT / "dev-tools" / "bundle-installer.py")
PR = load("ports_release", ROOT / "dev-tools" / "ports-release.py")
SP = load("sync_port_project", ROOT / "dev-tools" / "sync-port-project.py")


@contextlib.contextmanager
def overrides(module, **attrs):
    saved = {name: getattr(module, name) for name in attrs}
    for name, value in attrs.items():
        setattr(module, name, value)
    try:
        yield
    finally:
        for name, value in saved.items():
            setattr(module, name, value)


@contextlib.contextmanager
def environ(**values):
    saved = {key: os.environ.get(key) for key in values}
    for key, value in values.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value
    try:
        yield
    finally:
        for key, old in saved.items():
            if old is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = old


@contextlib.contextmanager
def argv(*args):
    old = sys.argv
    sys.argv = list(args)
    try:
        yield
    finally:
        sys.argv = old


class MemorySettings:
    """Stand-in for gsettings. Missing keys read as an empty list."""

    def __init__(self):
        self.store: dict[tuple[str, str], list[str]] = {}

    def get(self, schema: str, key: str):
        return list(self.store.get((schema, key), []))

    def set_strv(self, schema: str, key: str, items: list[str], dry: bool) -> bool:
        if not dry:
            self.store[(schema, key)] = list(items)
        return True


def manifest_for(desktops: dict) -> dict:
    return {
        "bundle": {"name": "CurbSoftware Desktop Widgets", "version": "1.1.0"},
        "desktops": {
            "cinnamon": list(desktops.get("cinnamon", [])),
            "gnome": list(desktops.get("gnome", [])),
            "kde": list(desktops.get("kde", [])),
        },
    }


def write_manifest(root: Path, desktops: dict) -> dict:
    payload = manifest_for(desktops)
    (root / "manifest.json").write_text(json.dumps(payload), encoding="utf-8")
    return payload


def cinnamon_entry(alias="desk-clock", kind="desklet", name="Desk Clock", surface=None):
    uuid = "%s@tdd" % alias
    if surface is None:
        surface = "panel" if kind == "applet" else "desktop"
    return {
        "alias": alias,
        "uuid": uuid,
        "kind": kind,
        "name": name,
        "version": "1.1.0",
        "dir": "cinnamon/" + uuid,
        "surface": surface,
    }


def gnome_entry(alias="desk-clock", name="Desk Clock", surface="desktop"):
    uuid = "gnome-%s@tdd" % alias
    return {
        "alias": alias,
        "uuid": uuid,
        "name": name,
        "version": "1.0.0",
        "zip": "gnome/%s.zip" % uuid,
        "surface": surface,
    }


def kde_entry(alias="desk-clock", name="Desk Clock", surface="desktop", package_id=None):
    package = package_id or ("com.tdd.%s" % alias.replace("-", ""))
    return {
        "alias": alias,
        "package_id": package,
        "name": name,
        "version": "1.0.0",
        "dir": "kde/" + package,
        "surface": surface,
    }


def write_cinnamon_tree(root: Path, entry: dict) -> Path:
    source = root / entry["dir"]
    source.mkdir(parents=True, exist_ok=True)
    (source / "metadata.json").write_text(json.dumps({
        "uuid": entry["uuid"],
        "name": entry["name"],
        "version": entry["version"],
    }), encoding="utf-8")
    main = "desklet.js" if entry["kind"] == "desklet" else "applet.js"
    (source / main).write_text("// tdd\n", encoding="utf-8")
    return source


def write_gnome_zip(root: Path, entry: dict) -> Path:
    archive = root / entry["zip"]
    archive.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive, "w") as handle:
        handle.writestr("metadata.json", json.dumps({
            "uuid": entry["uuid"],
            "name": entry["name"],
            "version": entry["version"],
        }))
        handle.writestr("extension.js", "// tdd\n")
    return archive


def write_kde_tree(root: Path, entry: dict) -> Path:
    source = root / entry["dir"]
    ui = source / "contents" / "ui"
    ui.mkdir(parents=True, exist_ok=True)
    (source / "metadata.json").write_text(json.dumps({
        "KPlugin": {
            "Id": entry["package_id"],
            "Name": entry["name"],
            "Version": entry["version"],
        }
    }), encoding="utf-8")
    (ui / "main.qml").write_text("// tdd\n", encoding="utf-8")
    return source


def walk(widget):
    yield widget
    children = []
    getter = getattr(widget, "get_children", None)
    if getter is not None:
        children = list(getter())
    if not children:
        child_getter = getattr(widget, "get_child", None)
        if child_getter is not None:
            child = child_getter()
            if child is not None:
                children = [child]
    for child in children:
        yield from walk(child)


def row_text(row) -> str:
    import gi
    gi.require_version("Gtk", "3.0")
    from gi.repository import Gtk

    parts = []
    for widget in walk(row):
        if isinstance(widget, Gtk.Label):
            parts.append(widget.get_text())
    return "\n".join(parts)


def button_named(container, label: str):
    import gi
    gi.require_version("Gtk", "3.0")
    from gi.repository import Gtk

    found = [
        widget for widget in walk(container)
        if isinstance(widget, Gtk.Button) and widget.get_label() == label
    ]
    if len(found) != 1:
        raise AssertionError("%s matched %d buttons" % (label, len(found)))
    return found[0]


def row_named(window, name: str):
    matches = [row for row in window.list_box.get_children() if name in row_text(row)]
    if len(matches) != 1:
        raise AssertionError("%s matched %d rows" % (name, len(matches)))
    return matches[0]


@contextlib.contextmanager
def open_manager(manifest, desktop, root, **patches):
    """Build the manager window and return before the GTK main loop."""
    import gi
    gi.require_version("Gtk", "3.0")
    from gi.repository import GLib, Gtk

    before = {id(window) for window in Gtk.Window.list_toplevels()}
    captured: dict = {}
    original_main = Gtk.main
    original_quit = Gtk.main_quit

    def fake_main():
        fresh = [window for window in Gtk.Window.list_toplevels() if id(window) not in before]
        captured["windows"] = fresh
        for window in fresh:
            window.hide()

    # Connect happens inside launch_gui, so replace main_quit first.
    # Destroying the window would otherwise quit a loop that is not running.
    Gtk.main = fake_main
    Gtk.main_quit = lambda *_args: None
    attrs = {"update_status": lambda _manifest: {"local": "1.1.0"}}
    attrs.update(patches)
    try:
        with overrides(BI, **attrs):
            captured["code"] = BI.launch_gui(manifest, desktop, root)
            windows = captured.get("windows") or []
            if len(windows) != 1:
                raise AssertionError(
                    "manager opened %d windows (exit %s)"
                    % (len(windows), captured.get("code"))
                )
            yield windows[0]
            context = GLib.main_context_default()
            while context.pending():
                context.iteration(False)
    finally:
        Gtk.main = original_main
        Gtk.main_quit = original_quit
        for window in list(Gtk.Window.list_toplevels()):
            if id(window) not in before:
                window.destroy()


class AssetName(unittest.TestCase):
    def test_version_file_is_1_1_0(self):
        text = (ROOT / "dev-tools" / "appimage" / "VERSION").read_text(encoding="utf-8")
        self.assertEqual(text.strip(), "1.1.0")

    def test_installer_builder_and_sync_share_the_asset_name(self):
        self.assertEqual(BI.ASSET_NAME, ASSET)
        self.assertEqual(BI._shipped_asset_name(), ASSET)
        self.assertEqual(PR.bundle_filename(), ASSET)
        self.assertEqual(PR.bundle_filename("x86_64"), ASSET)
        self.assertEqual(SP.APPIMAGE_NAME, ASSET)
        self.assertEqual(PR.bundle_version(), "1.1.0")

    def test_builder_calls_bundle_filename(self):
        text = (ROOT / "dev-tools" / "ports-release.py").read_text(encoding="utf-8")
        self.assertIn("output_dir / bundle_filename(arch)", text)
        self.assertNotIn("curb-desktop-widgets-x86_64.AppImage", text)
        sync = (ROOT / "dev-tools" / "sync-port-project.py").read_text(encoding="utf-8")
        self.assertIn("CurbXlets-%s-x86_64.AppImage", sync)

    def test_version_file_next_to_the_script_wins(self):
        with tempfile.TemporaryDirectory() as temporary:
            origin = Path(temporary) / "bundle-installer.py"
            origin.write_text("# tdd\n", encoding="utf-8")
            version = origin.parent / "appimage" / "VERSION"
            version.parent.mkdir()
            version.write_text("  9.9.9 \n", encoding="utf-8")
            manifest = origin.parent / "payload" / "manifest.json"
            manifest.parent.mkdir()
            manifest.write_text(json.dumps({"bundle": {"version": "1.0.0"}}), encoding="utf-8")
            self.assertEqual(BI._shipped_asset_name(origin), "CurbXlets-9.9.9-x86_64.AppImage")

    def test_packed_manifest_names_the_image_without_a_version_file(self):
        """The script lives in usr/bin inside the image. VERSION is not there."""
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            origin = root / "usr" / "bin" / "bundle-installer.py"
            origin.parent.mkdir(parents=True)
            origin.write_text("# tdd\n", encoding="utf-8")
            manifest = root / "payload" / "manifest.json"
            manifest.parent.mkdir()
            manifest.write_text(
                json.dumps({"bundle": {"name": "CurbSoftware Desktop Widgets", "version": "1.1.0"}}),
                encoding="utf-8",
            )
            self.assertEqual(BI._shipped_asset_name(origin), ASSET)

    def test_manifest_version_is_read_when_present(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            origin = root / "usr" / "bin" / "bundle-installer.py"
            origin.parent.mkdir(parents=True)
            origin.write_text("# tdd\n", encoding="utf-8")
            manifest = root / "payload" / "manifest.json"
            manifest.parent.mkdir()
            manifest.write_text(json.dumps({"bundle": {"version": "4.5.6"}}), encoding="utf-8")
            self.assertEqual(BI._shipped_asset_name(origin), "CurbXlets-4.5.6-x86_64.AppImage")

    def test_missing_bundle_version_in_the_manifest_uses_1_1_0(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            origin = root / "usr" / "bin" / "tool.py"
            origin.parent.mkdir(parents=True)
            origin.write_text("# tdd\n", encoding="utf-8")
            manifest = root / "payload" / "manifest.json"
            manifest.parent.mkdir()
            manifest.write_text("{}", encoding="utf-8")
            self.assertEqual(BI._shipped_asset_name(origin), ASSET)

    def test_broken_manifest_does_not_raise(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            origin = root / "usr" / "bin" / "tool.py"
            origin.parent.mkdir(parents=True)
            origin.write_text("# tdd\n", encoding="utf-8")
            manifest = root / "payload" / "manifest.json"
            manifest.parent.mkdir()
            manifest.write_text("{", encoding="utf-8")
            self.assertEqual(BI._shipped_asset_name(origin), ASSET)

    def test_nothing_on_disk_falls_back_to_the_versioned_name(self):
        with tempfile.TemporaryDirectory() as temporary:
            origin = Path(temporary) / "bundle-installer.py"
            origin.write_text("# tdd\n", encoding="utf-8")
            self.assertEqual(BI._shipped_asset_name(origin), ASSET)

    def test_release_json_selects_the_versioned_asset(self):
        payload = {
            "tag_name": "v1.1.0",
            "assets": [
                {"name": "curb-desktop-widgets-x86_64.AppImage", "browser_download_url": "https://example/old"},
                {"name": "notes.txt", "browser_download_url": "https://example/notes"},
                {"name": ASSET, "browser_download_url": "https://example/curbxlets"},
            ],
        }
        latest = BI.latest_release_from_json(payload, asset_name=ASSET)
        self.assertEqual(latest["url"], "https://example/curbxlets")
        self.assertEqual(latest["tag"], "v1.1.0")

    def test_published_image_uses_the_versioned_name(self):
        if not PUBLISHED_DIR.is_dir():
            self.skipTest("published curbxlets directory is not on this machine")
        image = PUBLISHED_DIR / ASSET
        self.assertTrue(image.is_file(), image)
        self.assertEqual(image.name, BI.ASSET_NAME)


class Logic(unittest.TestCase):
    def test_dispatch_tables_point_at_the_desktop_functions(self):
        self.assertIs(BI.INSTALLERS["cinnamon"], BI.install_cinnamon)
        self.assertIs(BI.INSTALLERS["gnome"], BI.install_gnome)
        self.assertIs(BI.INSTALLERS["kde"], BI.install_kde)
        self.assertIs(BI.UNINSTALLERS["cinnamon"], BI.uninstall_cinnamon)
        self.assertIs(BI.UNINSTALLERS["gnome"], BI.uninstall_gnome)
        self.assertIs(BI.UNINSTALLERS["kde"], BI.uninstall_kde)
        self.assertIs(BI.ADD_INSTANCE["cinnamon"], BI.add_instance_cinnamon)
        self.assertIs(BI.ADD_INSTANCE["gnome"], BI.add_instance_gnome)
        self.assertIs(BI.ADD_INSTANCE["kde"], BI.add_instance_kde)
        self.assertIs(BI.REMOVE_INSTANCE["cinnamon"], BI.remove_instance_cinnamon)
        self.assertIs(BI.REMOVE_INSTANCE["gnome"], BI.remove_instance_gnome)
        self.assertIs(BI.REMOVE_INSTANCE["kde"], BI.remove_instance_kde)

    def test_cinnamon_beats_a_later_gnome_token(self):
        env = {"XDG_CURRENT_DESKTOP": "X-Cinnamon:GNOME", "XDG_SESSION_DESKTOP": "plasma"}
        self.assertEqual(BI.detect_desktop(env=env), "cinnamon")

    def test_plasma_token_is_kde(self):
        self.assertEqual(BI.detect_desktop(env={"XDG_CURRENT_DESKTOP": "ubuntu:Plasma"}), "kde")

    def test_session_desktop_is_the_fallback(self):
        env = {"XDG_CURRENT_DESKTOP": "", "XDG_SESSION_DESKTOP": "gnome"}
        self.assertEqual(BI.detect_desktop(env=env), "gnome")

    def test_override_wins_over_the_session(self):
        self.assertEqual(BI.detect_desktop("kde", {"XDG_CURRENT_DESKTOP": "GNOME"}), "kde")

    def test_injected_empty_env_does_not_scan_path(self):
        self.assertIsNone(BI.detect_desktop(env={}))

    def test_session_type_reads_the_env(self):
        self.assertEqual(BI.session_type({"XDG_SESSION_TYPE": "wayland"}), "wayland")
        self.assertEqual(BI.session_type({}), "unknown")

    def test_parse_version_edges(self):
        self.assertEqual(BI.parse_version("v1.2.3"), (1, 2, 3))
        self.assertEqual(BI.parse_version("1.2"), (1, 2, 0))
        self.assertEqual(BI.parse_version("V1"), (1, 0, 0))
        self.assertEqual(BI.parse_version("1.2.3-rc1"), (1, 2, 3))
        self.assertEqual(BI.parse_version(""), (0, 0, 0))

    def test_version_newer(self):
        self.assertTrue(BI.version_newer("1.1.1", "1.1.0"))
        self.assertTrue(BI.version_newer("v1.1.0", "1.0.9"))
        self.assertFalse(BI.version_newer("1.1.0", "1.1.0"))
        self.assertFalse(BI.version_newer("1.0.0", "1.1.0"))

    def test_environment_label_uses_the_desktop_name(self):
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False) as handle:
            handle.write('PRETTY_NAME="Linux Mint 22"\n')
            path = Path(handle.name)
        try:
            label = BI.environment_label("cinnamon", session="x11", release_path=path)
        finally:
            path.unlink()
        self.assertEqual(label, "Linux Mint 22 · Cinnamon · x11")

    def test_filter_is_case_insensitive_and_dedupes(self):
        entries = [
            {"alias": "world-clock", "uuid": "gnome-world-clock@curbsoftware"},
            {"alias": "workspace-names", "package_id": "com.curbsoftware.workspacenames"},
        ]
        chosen = BI.filter_entries(entries, ["World-Clock", "world-clock"])
        self.assertEqual([item["alias"] for item in chosen], ["world-clock"])
        chosen = BI.filter_entries(entries, ["COM.CURBSOFTWARE.WORKSPACENAMES"])
        self.assertEqual(chosen[0]["alias"], "workspace-names")

    def test_filter_unknown_widget_raises(self):
        with self.assertRaises(ValueError):
            BI.filter_entries([{"alias": "world-clock"}], ["missing"])

    def test_resolve_entries_by_desktop(self):
        manifest = manifest_for({"cinnamon": [{"alias": "world-clock"}]})
        self.assertEqual(BI.resolve_entries(manifest, "gnome", None), [])
        chosen = BI.resolve_entries(manifest, "cinnamon", ["world-clock"])
        self.assertEqual(chosen[0]["alias"], "world-clock")

    def test_entry_surface_fallbacks(self):
        self.assertEqual(BI.entry_surface({"surface": "panel", "alias": "world-clock"}), "panel")
        self.assertEqual(BI.entry_surface({"kind": "applet", "alias": "world-clock"}), "panel")
        self.assertEqual(BI.entry_surface({"kind": "desklet", "alias": "workspace-names"}), "desktop")
        self.assertEqual(BI.entry_surface({"alias": "color-clock"}), "desktop")
        self.assertEqual(BI.entry_surface({"alias": "panel-profiles"}), "panel")

    def test_surfaces_agree_for_every_shipped_alias(self):
        aliases = {alias for alias, *_rest in CINNAMON_WIDGETS}
        self.assertEqual(aliases, {alias for alias, *_rest in GNOME_WIDGETS})
        self.assertEqual(aliases, {alias for alias, *_rest in KDE_WIDGETS})
        for alias in aliases:
            self.assertEqual(BI.surface_for_alias(alias), PR.widget_surface(alias))

    def test_want_gui_only_when_no_action_and_a_display_exists(self):
        self.assertTrue(BI.want_gui(Namespace(action="gui", list=False, dry_run=False)))
        self.assertFalse(BI.want_gui(Namespace(action="install", list=False, dry_run=False)))
        self.assertFalse(BI.want_gui(Namespace(action=None, list=True, dry_run=False)))
        self.assertFalse(BI.want_gui(Namespace(action=None, list=False, dry_run=True)))
        with environ(DISPLAY=None, WAYLAND_DISPLAY=None):
            self.assertFalse(BI.want_gui(Namespace(action=None, list=False, dry_run=False)))

    def test_confirm_yes_and_dry_run_skip_the_prompt(self):
        self.assertTrue(BI.confirm("install", "cinnamon", Namespace(dry_run=True, yes=False)))
        self.assertTrue(BI.confirm("install", "cinnamon", Namespace(dry_run=False, yes=True)))

    def test_confirm_refuses_a_non_interactive_stdin(self):
        class Silent:
            def isatty(self):
                return False

        old = sys.stdin
        sys.stdin = Silent()
        try:
            allowed = BI.confirm("install", "cinnamon", Namespace(dry_run=False, yes=False))
        finally:
            sys.stdin = old
        self.assertFalse(allowed)

    def test_gsettings_quotes_apostrophes_and_backslashes(self):
        seen = []

        def which(tool):
            return tool == "gsettings"

        def run(command, dry=False):
            seen.append(command)
            return True, ""

        with overrides(BI, which=which, run=run):
            ok = BI.gsettings_set_strv(
                "org.cinnamon",
                "enabled-desklets",
                ["o'clock@x:1:100:100", "a\\b@x:1:1"],
                False,
            )
        self.assertTrue(ok)
        self.assertEqual(seen[0][:4], ["gsettings", "set", "org.cinnamon", "enabled-desklets"])
        serialized = seen[0][-1]
        self.assertIn("'o\\'clock@x:1:100:100'", serialized)
        self.assertIn("'a\\\\b@x:1:1'", serialized)

    def test_describe_states(self):
        lines = []
        with overrides(BI, log=lambda message="": lines.append(message)):
            BI.describe({"name": "World Clock", "version": "1.1.0"}, None)
            BI.describe({"name": "World Clock", "version": "1.1.0"}, "1.1.0")
            BI.describe({"name": "World Clock", "version": "1.1.0"}, "1.0.0", extra="disabled")
        self.assertIn("not installed", lines[0])
        self.assertIn("installed, version 1.1.0", lines[1])
        self.assertIn("bundle has 1.1.0", lines[2])
        self.assertIn("disabled", lines[2])

    def test_desklet_instance_ids_ignore_other_uuids(self):
        current = ["other@x:9:10:10"]
        entry = BI.cinnamon_next_desklet_entry("clock@x", current)
        self.assertEqual(entry, "clock@x:1:100:100")

    def test_applet_position_starts_at_one(self):
        self.assertEqual(BI.cinnamon_next_applet_entry("names@x", []), "names@x:1:1")
        self.assertEqual(
            BI.cinnamon_next_applet_entry("names@x", ["names@x:1:1", "other@x:1:4"]),
            "names@x:1:5",
        )

    def test_remove_one_keeps_the_earlier_instance(self):
        current = ["a@x:1:1", "b@x:1:2", "a@x:2:3"]
        self.assertEqual(BI.cinnamon_without_one("a@x", current), ["a@x:1:1", "b@x:1:2"])
        self.assertEqual(
            BI.cinnamon_without_one("a@x", current, all_instances=True),
            ["b@x:1:2"],
        )

    def test_kde_scripts_target_one_surface(self):
        desktop = BI.kde_add_script("com.curbsoftware.worldclock", "desktop")
        panel = BI.kde_add_script("com.curbsoftware.workspacenames", "panel")
        self.assertIn("desktops()", desktop)
        self.assertNotIn("panels()", desktop)
        self.assertIn('addWidget("com.curbsoftware.worldclock")', desktop)
        self.assertIn("panels()", panel)
        self.assertIn('addWidget("com.curbsoftware.workspacenames")', panel)
        one = BI.kde_remove_script("com.curbsoftware.worldclock", surface="desktop", all_instances=False)
        every = BI.kde_remove_script("com.curbsoftware.worldclock", all_instances=True)
        self.assertIn("drop(desktops(), false)", one)
        self.assertNotIn("panels()", one)
        self.assertIn('"com.curbsoftware.worldclock"', every)
        self.assertIn("drop(desktops(), true)", every)
        self.assertIn("drop(panels(), true)", every)

    def test_update_outside_an_appimage_does_not_download(self):
        with environ(APPIMAGE=None):
            self.assertIsNone(BI.appimage_path())
            ok, message = BI.apply_appimage_update("https://example/app", False)
        self.assertFalse(ok)
        self.assertIn("not running from an AppImage", message)

    def test_dry_run_update_stops_before_a_download(self):
        with tempfile.NamedTemporaryFile() as handle:
            with environ(APPIMAGE=handle.name):
                self.assertEqual(BI.appimage_path(), Path(handle.name))
                ok, message = BI.apply_appimage_update("https://example/app", True)
        self.assertTrue(ok)
        self.assertEqual(message, "")

    def test_appimage_env_ignores_a_missing_file(self):
        with environ(APPIMAGE="/tmp/curbxlets-missing-image.AppImage"):
            self.assertIsNone(BI.appimage_path())


class Catalog(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory()
        path = PR.build_manifest(Path(cls._tmp.name))
        cls.manifest = json.loads(path.read_text(encoding="utf-8"))

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def test_bundle_identity(self):
        self.assertEqual(self.manifest["bundle"]["name"], "CurbSoftware Desktop Widgets")
        self.assertEqual(self.manifest["bundle"]["version"], "1.1.0")

    def test_cinnamon_gnome_and_kde_catalogs(self):
        cinnamon = self.manifest["desktops"]["cinnamon"]
        gnome = self.manifest["desktops"]["gnome"]
        kde = self.manifest["desktops"]["kde"]
        self.assertEqual(
            [(item["alias"], item["name"], item["kind"], item["surface"], item["uuid"]) for item in cinnamon],
            list(CINNAMON_WIDGETS),
        )
        self.assertEqual(
            [(item["alias"], item["name"], item["surface"], item["uuid"]) for item in gnome],
            list(GNOME_WIDGETS),
        )
        self.assertEqual(
            [(item["alias"], item["name"], item["surface"], item["package_id"]) for item in kde],
            list(KDE_WIDGETS),
        )
        for item in cinnamon + gnome + kde:
            self.assertTrue(item["version"])
            self.assertEqual(item["surface"], BI.surface_for_alias(item["alias"]))

    def test_command_launcher_ships_even_though_spices_submission_is_blocked(self):
        blocked = [item for item in PR.SR.EXTENSIONS if item["alias"] == "command-launcher"]
        self.assertEqual(len(blocked), 1)
        self.assertTrue(blocked[0].get("blocked"))
        shipped = [item for item in self.manifest["desktops"]["cinnamon"] if item["alias"] == "command-launcher"]
        self.assertEqual(shipped[0]["uuid"], "cinnamon-command-launcher-applet@curbsoftware")


class FrontendWidgets(unittest.TestCase):
    def test_cinnamon_widgets_have_a_main_file_and_matching_uuid(self):
        by_alias = {item["alias"]: item for item in PR.SR.EXTENSIONS}
        for alias, _name, kind, _surface, uuid in CINNAMON_WIDGETS:
            item = by_alias[alias]
            source = ROOT / item["source"]
            meta = json.loads((source / "metadata.json").read_text(encoding="utf-8"))
            self.assertEqual(meta["uuid"], uuid)
            self.assertEqual(meta["name"], _name)
            main = source / (kind + ".js")
            self.assertTrue(main.is_file(), main)
            if not item.get("blocked"):
                self.assertEqual(source.name, uuid)

    def test_gnome_widgets_have_extension_js(self):
        for alias, name, surface, uuid in GNOME_WIDGETS:
            source = ROOT / ("gnome-%s@curbsoftware" % alias)
            meta = json.loads((source / "metadata.json").read_text(encoding="utf-8"))
            self.assertEqual(meta["uuid"], uuid)
            self.assertEqual(meta["name"], name)
            self.assertEqual(source.name, uuid)
            self.assertTrue((source / "extension.js").is_file())
            self.assertEqual(BI.surface_for_alias(alias), surface)

    def test_kde_widgets_have_main_qml(self):
        for alias, name, surface, package_id in KDE_WIDGETS:
            source = ROOT / ("kde-%s" % alias)
            meta = json.loads((source / "metadata.json").read_text(encoding="utf-8"))
            plugin = meta["KPlugin"]
            self.assertEqual(plugin["Id"], package_id)
            self.assertEqual(plugin["Name"], name)
            self.assertTrue((source / "contents" / "ui" / "main.qml").is_file())
            self.assertEqual(BI.surface_for_alias(alias), surface)

    def test_root_copies_match_the_source_identity(self):
        for alias, name, _surface, uuid in GNOME_WIDGETS:
            source = json.loads((ROOT / ("gnome-%s@curbsoftware" % alias) / "metadata.json").read_text(encoding="utf-8"))
            copy = json.loads((REPO / "gnome" / alias / "metadata.json").read_text(encoding="utf-8"))
            self.assertEqual(copy["uuid"], uuid)
            self.assertEqual(copy["uuid"], source["uuid"])
            self.assertEqual(copy["name"], name)
            self.assertEqual(str(copy["version"]), str(source["version"]))
            self.assertTrue((REPO / "gnome" / alias / "extension.js").is_file())
        for alias, name, _surface, package_id in KDE_WIDGETS:
            source = json.loads((ROOT / ("kde-%s" % alias) / "metadata.json").read_text(encoding="utf-8"))
            copy = json.loads((REPO / "kde" / alias / "metadata.json").read_text(encoding="utf-8"))
            self.assertEqual(copy["KPlugin"]["Id"], package_id)
            self.assertEqual(copy["KPlugin"]["Id"], source["KPlugin"]["Id"])
            self.assertEqual(copy["KPlugin"]["Name"], name)
            self.assertEqual(str(copy["KPlugin"]["Version"]), str(source["KPlugin"]["Version"]))
            self.assertTrue((REPO / "kde" / alias / "contents" / "ui" / "main.qml").is_file())


class Backend(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = Path(self.tmp.name) / "home"
        self.home.mkdir()
        self.payload = Path(self.tmp.name) / "payload"
        self.payload.mkdir()
        self.settings = MemorySettings()
        self.commands = []

        def run(command, dry=False):
            self.commands.append(list(command))
            raise AssertionError("backend test spawned a command: %s" % command)

        self._ctx = overrides(
            BI,
            which=lambda tool: False,
            run=run,
            gsettings_get=self.settings.get,
            gsettings_set_strv=self.settings.set_strv,
        )
        self._ctx.__enter__()
        self._home = BI.Path.home
        BI.Path.home = lambda: self.home
        for probe in (
            BI.cinnamon_target("desklet", "probe@tdd"),
            BI.gnome_target("probe@tdd"),
            BI.kde_target("com.tdd.probe"),
        ):
            if self.home not in probe.parents:
                raise RuntimeError("home patch missed: %s" % probe)

    def tearDown(self):
        BI.Path.home = self._home
        self._ctx.__exit__(None, None, None)
        self.tmp.cleanup()

    def test_cinnamon_install_copies_a_desklet_and_enables_it(self):
        entry = cinnamon_entry()
        write_cinnamon_tree(self.payload, entry)
        self.assertTrue(BI.install_cinnamon(entry, self.payload, False))
        target = BI.cinnamon_target("desklet", entry["uuid"])
        self.assertTrue((target / "desklet.js").is_file())
        self.assertEqual(json.loads((target / "metadata.json").read_text(encoding="utf-8"))["uuid"], entry["uuid"])
        enabled = self.settings.store[("org.cinnamon", "enabled-desklets")]
        self.assertEqual(enabled, ["%s:1:100:100" % entry["uuid"]])
        self.assertNotIn(("org.cinnamon", "enabled-applets"), self.settings.store)
        self.assertEqual(self.commands, [])

    def test_cinnamon_applet_lands_in_applets_and_on_the_panel_key(self):
        entry = cinnamon_entry(alias="panel-names", kind="applet", name="Panel Names", surface="panel")
        write_cinnamon_tree(self.payload, entry)
        self.assertTrue(BI.install_cinnamon(entry, self.payload, False))
        target = BI.cinnamon_target("applet", entry["uuid"])
        self.assertTrue((target / "applet.js").is_file())
        self.assertFalse(BI.cinnamon_target("desklet", entry["uuid"]).exists())
        self.assertEqual(
            self.settings.store[("org.cinnamon", "enabled-applets")],
            ["%s:1:1" % entry["uuid"]],
        )

    def test_cinnamon_reinstall_replaces_the_tree(self):
        entry = cinnamon_entry()
        source = write_cinnamon_tree(self.payload, entry)
        BI.install_cinnamon(entry, self.payload, False)
        (source / "desklet.js").write_text("// replaced\n", encoding="utf-8")
        self.assertTrue(BI.install_cinnamon(entry, self.payload, False))
        target = BI.cinnamon_target("desklet", entry["uuid"])
        self.assertEqual((target / "desklet.js").read_text(encoding="utf-8"), "// replaced\n")
        self.assertEqual(len(self.settings.store[("org.cinnamon", "enabled-desklets")]), 1)

    def test_cinnamon_enable_is_idempotent_and_add_places_another_instance(self):
        entry = cinnamon_entry()
        write_cinnamon_tree(self.payload, entry)
        BI.install_cinnamon(entry, self.payload, False)
        BI.cinnamon_enable(entry["kind"], entry["uuid"], False)
        self.assertEqual(len(self.settings.store[("org.cinnamon", "enabled-desklets")]), 1)
        self.assertTrue(BI.add_instance_cinnamon(entry, "desktop", False))
        self.assertEqual(
            self.settings.store[("org.cinnamon", "enabled-desklets")],
            ["%s:1:100:100" % entry["uuid"], "%s:2:140:100" % entry["uuid"]],
        )

    def test_cinnamon_panel_request_for_a_desklet_warns_and_still_places(self):
        entry = cinnamon_entry(name="Desk Clock")
        write_cinnamon_tree(self.payload, entry)
        warnings = []
        with overrides(BI, warn=lambda message: warnings.append(message)):
            self.assertTrue(BI.add_instance_cinnamon(entry, "panel", False))
        self.assertTrue(any("belongs on the desktop" in message for message in warnings))
        self.assertEqual(len(self.settings.store[("org.cinnamon", "enabled-desklets")]), 1)

    def test_cinnamon_remove_one_then_all(self):
        entry = cinnamon_entry()
        write_cinnamon_tree(self.payload, entry)
        BI.install_cinnamon(entry, self.payload, False)
        BI.add_instance_cinnamon(entry, "desktop", False)
        self.assertTrue(BI.remove_instance_cinnamon(entry, False, all_instances=False))
        self.assertEqual(
            self.settings.store[("org.cinnamon", "enabled-desklets")],
            ["%s:1:100:100" % entry["uuid"]],
        )
        self.assertTrue(BI.remove_instance_cinnamon(entry, False, all_instances=True))
        self.assertEqual(self.settings.store[("org.cinnamon", "enabled-desklets")], [])

    def test_cinnamon_remove_missing_instance_returns_false(self):
        entry = cinnamon_entry()
        self.assertFalse(BI.remove_instance_cinnamon(entry, False))

    def test_cinnamon_missing_payload_fails_closed(self):
        entry = cinnamon_entry()
        warnings = []
        with overrides(BI, err=lambda message: warnings.append(message)):
            self.assertFalse(BI.install_cinnamon(entry, self.payload, False))
        self.assertFalse(BI.cinnamon_target("desklet", entry["uuid"]).exists())
        self.assertTrue(warnings)

    def test_cinnamon_dry_run_writes_nothing(self):
        entry = cinnamon_entry()
        write_cinnamon_tree(self.payload, entry)
        self.assertTrue(BI.install_cinnamon(entry, self.payload, True))
        self.assertFalse(BI.cinnamon_target("desklet", entry["uuid"]).exists())
        self.assertEqual(self.settings.store, {})

    def test_cinnamon_uninstall_removes_files_and_instances(self):
        entry = cinnamon_entry()
        write_cinnamon_tree(self.payload, entry)
        BI.install_cinnamon(entry, self.payload, False)
        BI.add_instance_cinnamon(entry, "desktop", False)
        target = BI.cinnamon_target("desklet", entry["uuid"])
        self.assertTrue(BI.uninstall_cinnamon(entry, False))
        self.assertFalse(target.exists())
        self.assertEqual(self.settings.store[("org.cinnamon", "enabled-desklets")], [])

    def test_cinnamon_install_still_copies_when_gsettings_is_missing(self):
        entry = cinnamon_entry()
        write_cinnamon_tree(self.payload, entry)
        warnings = []
        with overrides(BI, gsettings_get=lambda schema, key: None, warn=lambda message: warnings.append(message)):
            self.assertTrue(BI.install_cinnamon(entry, self.payload, False))
        self.assertTrue((BI.cinnamon_target("desklet", entry["uuid"]) / "desklet.js").is_file())
        self.assertTrue(any("gsettings unavailable" in message for message in warnings))

    def test_gnome_install_extracts_the_zip_and_enables_the_uuid(self):
        entry = gnome_entry()
        write_gnome_zip(self.payload, entry)
        self.assertTrue(BI.install_gnome(entry, self.payload, False))
        target = BI.gnome_target(entry["uuid"])
        self.assertTrue((target / "extension.js").is_file())
        self.assertTrue((target / "metadata.json").is_file())
        self.assertEqual(self.settings.store[("org.gnome.shell", "enabled-extensions")], [entry["uuid"]])
        self.assertTrue(BI.files_installed_gnome(entry))
        self.assertTrue(BI.uuid_enabled_gnome(entry["uuid"]))

    def test_gnome_second_add_does_not_enable_twice(self):
        entry = gnome_entry(name="Desk Clock")
        write_gnome_zip(self.payload, entry)
        BI.install_gnome(entry, self.payload, False)
        self.assertTrue(BI.add_instance_gnome(entry, "desktop", False))
        self.assertEqual(self.settings.store[("org.gnome.shell", "enabled-extensions")], [entry["uuid"]])

    def test_gnome_surface_mismatch_warns_and_still_enables(self):
        entry = gnome_entry(name="Desk Clock", surface="desktop")
        write_gnome_zip(self.payload, entry)
        warnings = []
        with overrides(BI, warn=lambda message: warnings.append(message)):
            self.assertTrue(BI.add_instance_gnome(entry, "panel", False))
        self.assertTrue(any("belongs on the desktop" in message for message in warnings))
        self.assertIn(entry["uuid"], self.settings.store[("org.gnome.shell", "enabled-extensions")])

    def test_gnome_missing_zip_fails(self):
        entry = gnome_entry()
        self.assertFalse(BI.install_gnome(entry, self.payload, False))
        self.assertFalse(BI.gnome_target(entry["uuid"]).exists())

    def test_gnome_uninstall_removes_the_extension_and_the_enabled_key(self):
        entry = gnome_entry()
        write_gnome_zip(self.payload, entry)
        BI.install_gnome(entry, self.payload, False)
        target = BI.gnome_target(entry["uuid"])
        self.assertTrue(BI.uninstall_gnome(entry, False))
        self.assertFalse(target.exists())
        self.assertEqual(self.settings.store[("org.gnome.shell", "enabled-extensions")], [])

    def test_kde_install_copies_the_plasmoid(self):
        entry = kde_entry()
        write_kde_tree(self.payload, entry)
        self.assertTrue(BI.install_kde(entry, self.payload, False))
        target = BI.kde_target(entry["package_id"])
        self.assertTrue((target / "contents" / "ui" / "main.qml").is_file())
        plugin = json.loads((target / "metadata.json").read_text(encoding="utf-8"))["KPlugin"]
        self.assertEqual(plugin["Id"], entry["package_id"])
        self.assertTrue(BI.files_installed_kde(entry))

    def test_kde_place_desktop_and_panel_scripts(self):
        entry = kde_entry()
        scripts = []

        def eval_script(script, dry):
            scripts.append((script, dry))
            return True, ""

        with overrides(BI, kde_eval=eval_script):
            self.assertTrue(BI.add_instance_kde(entry, "desktop", False))
            self.assertTrue(BI.add_instance_kde(entry, "panel", False))
            self.assertTrue(BI.remove_instance_kde(entry, False, all_instances=False))
            self.assertTrue(BI.remove_instance_kde(entry, False, all_instances=True))
        self.assertIn("desktops()", scripts[0][0])
        self.assertIn('addWidget("%s")' % entry["package_id"], scripts[0][0])
        self.assertIn("panels()", scripts[1][0])
        self.assertIn("drop(desktops(), false)", scripts[2][0])
        self.assertIn("drop(panels(), true)", scripts[3][0])

    def test_kde_missing_payload_fails(self):
        entry = kde_entry()
        self.assertFalse(BI.install_kde(entry, self.payload, False))
        self.assertFalse(BI.kde_target(entry["package_id"]).exists())

    def test_kde_uninstall_removes_the_copied_plasmoid(self):
        entry = kde_entry()
        write_kde_tree(self.payload, entry)
        BI.install_kde(entry, self.payload, False)
        target = BI.kde_target(entry["package_id"])
        self.assertTrue(BI.uninstall_kde(entry, False))
        self.assertFalse(target.exists())

    def _run_main(self, *args):
        stdout = io.StringIO()
        stderr = io.StringIO()
        with argv("bundle-installer.py", *args), environ(CURB_BUNDLE_PAYLOAD=str(self.payload)):
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                code = BI.main()
        return code, stdout.getvalue(), stderr.getvalue()

    def test_cli_install_status_add_and_uninstall(self):
        clock = cinnamon_entry(alias="world-clock", name="World Clock")
        other = cinnamon_entry(alias="panel-names", kind="applet", name="Panel Names", surface="panel")
        write_cinnamon_tree(self.payload, clock)
        write_cinnamon_tree(self.payload, other)
        write_manifest(self.payload, {"cinnamon": [clock, other]})

        code, stdout, _stderr = self._run_main("install", "--desktop", "cinnamon", "--yes", "--only", "world-clock")
        self.assertEqual(code, 0, stdout)
        self.assertTrue((BI.cinnamon_target("desklet", clock["uuid"]) / "desklet.js").is_file())
        self.assertFalse(BI.cinnamon_target("applet", other["uuid"]).exists())
        self.assertIn("install complete", stdout)

        code, stdout, _stderr = self._run_main("status", "--desktop", "cinnamon", "--only", "world-clock")
        self.assertEqual(code, 0, stdout)
        self.assertIn("World Clock", stdout)
        self.assertIn("installed, version 1.1.0", stdout)
        self.assertIn("enabled, 1 instance(s)", stdout)

        code, stdout, _stderr = self._run_main(
            "add-instance", "--desktop", "cinnamon", "world-clock", "--surface", "desktop",
        )
        self.assertEqual(code, 0, stdout)
        enabled = self.settings.store[("org.cinnamon", "enabled-desklets")]
        self.assertEqual(len(enabled), 2)
        self.assertTrue(enabled[1].endswith(":140:100"))

        code, stdout, _stderr = self._run_main("uninstall", "--desktop", "cinnamon", "--yes", "--only", "world-clock")
        self.assertEqual(code, 0, stdout)
        self.assertFalse(BI.cinnamon_target("desklet", clock["uuid"]).exists())
        self.assertEqual(self.settings.store[("org.cinnamon", "enabled-desklets")], [])

    def test_cli_unknown_widget(self):
        entry = cinnamon_entry()
        write_cinnamon_tree(self.payload, entry)
        write_manifest(self.payload, {"cinnamon": [entry]})
        code, _stdout, stderr = self._run_main("install", "--desktop", "cinnamon", "--yes", "--only", "nope")
        self.assertEqual(code, BI.EXIT_FAILED)
        self.assertIn("unknown widget", stderr)
        self.assertFalse(BI.cinnamon_target("desklet", entry["uuid"]).exists())

    def test_add_instance_accepts_the_widget_after_flags(self):
        with argv(
            "bundle-installer.py",
            "add-instance",
            "--desktop",
            "cinnamon",
            "world-clock",
            "--surface",
            "panel",
        ):
            args = BI.parser().parse_intermixed_args()
        self.assertEqual(args.action, "add-instance")
        self.assertEqual(args.widget, "world-clock")
        self.assertEqual(args.desktop, "cinnamon")
        self.assertEqual(args.surface, "panel")

    def test_cli_add_instance_needs_a_widget(self):
        write_manifest(self.payload, {"cinnamon": [cinnamon_entry()]})
        code, _stdout, stderr = self._run_main("add-instance", "--desktop", "cinnamon")
        self.assertEqual(code, BI.EXIT_FAILED)
        self.assertIn("needs a widget", stderr)

    def test_cli_aborts_when_confirm_returns_false(self):
        entry = cinnamon_entry()
        write_cinnamon_tree(self.payload, entry)
        write_manifest(self.payload, {"cinnamon": [entry]})
        with overrides(BI, confirm=lambda *args, **kwargs: False):
            code, stdout, _stderr = self._run_main("install", "--desktop", "cinnamon")
        self.assertEqual(code, 0)
        self.assertIn("Aborted.", stdout)
        self.assertFalse(BI.cinnamon_target("desklet", entry["uuid"]).exists())

    def test_cli_list_prints_every_desktop(self):
        clock = cinnamon_entry(name="World Clock")
        gnome = gnome_entry(name="World Clock")
        kde = kde_entry(name="World Clock")
        write_manifest(self.payload, {"cinnamon": [clock], "gnome": [gnome], "kde": [kde]})
        code, stdout, _stderr = self._run_main("--list")
        self.assertEqual(code, 0, stdout)
        self.assertIn("CurbSoftware Desktop Widgets version 1.1.0", stdout)
        for desktop in ("cinnamon:", "gnome:", "kde:"):
            self.assertIn(desktop, stdout)
        self.assertEqual(stdout.count("World Clock"), 3)

    def test_cli_refuses_root(self):
        write_manifest(self.payload, {"cinnamon": [cinnamon_entry()]})
        with overrides(BI.os, geteuid=lambda: 0):
            code, _stdout, stderr = self._run_main("install", "--desktop", "cinnamon", "--yes")
        self.assertEqual(code, BI.EXIT_FAILED)
        self.assertIn("running as root", stderr)

    def test_cli_cannot_detect_the_desktop(self):
        write_manifest(self.payload, {"cinnamon": [cinnamon_entry()]})
        with overrides(BI, detect_desktop=lambda override=None, env=None: None):
            code, _stdout, stderr = self._run_main("status")
        self.assertEqual(code, BI.EXIT_UNSUPPORTED)
        self.assertIn("could not detect the desktop", stderr)

    def test_gnome_and_kde_cli_install(self):
        gnome = gnome_entry(name="World Clock")
        kde = kde_entry(name="World Clock")
        write_gnome_zip(self.payload, gnome)
        write_kde_tree(self.payload, kde)
        write_manifest(self.payload, {"gnome": [gnome]})
        code, stdout, _stderr = self._run_main("install", "--desktop", "gnome", "--yes")
        self.assertEqual(code, 0, stdout)
        self.assertTrue((BI.gnome_target(gnome["uuid"]) / "extension.js").is_file())
        self.assertEqual(self.settings.store[("org.gnome.shell", "enabled-extensions")], [gnome["uuid"]])

        write_manifest(self.payload, {"kde": [kde]})
        code, stdout, _stderr = self._run_main("install", "--desktop", "kde", "--yes")
        self.assertEqual(code, 0, stdout)
        self.assertTrue((BI.kde_target(kde["package_id"]) / "contents" / "ui" / "main.qml").is_file())


class ManagerWindow(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import gi
        gi.require_version("Gtk", "3.0")
        from gi.repository import Gtk

        ok, _argv = Gtk.init_check([])
        if not ok:
            raise unittest.SkipTest("GTK could not open a display")
        cls.Gtk = Gtk
        cls._tmp = tempfile.TemporaryDirectory()
        path = PR.build_manifest(Path(cls._tmp.name))
        cls.manifest = json.loads(path.read_text(encoding="utf-8"))
        cls.root = Path(cls._tmp.name)

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def test_do_add_override_leaves_the_window_with_no_child(self):
        """The failure mode: a do_add method replaces Gtk.Container.add."""
        stderr = io.StringIO()
        Gtk = self.Gtk

        class Blank(Gtk.Window):
            def __init__(self):
                Gtk.Window.__init__(self, title="blank")
                self.add(Gtk.Box())

            def do_add(self, entry, surface):
                return None

        with contextlib.redirect_stderr(stderr):
            window = Blank()
        try:
            self.assertIsNone(window.get_child())
        finally:
            window.destroy()

    def test_window_child_is_the_widget_list_not_an_empty_window(self):
        entries = self.manifest["desktops"]["cinnamon"]
        with open_manager(self.manifest, "cinnamon", self.root) as window:
            self.assertEqual(window.get_title(), "CurbSoftware Desktop Widgets")
            child = window.get_child()
            self.assertIsNotNone(child)
            self.assertIsInstance(child, self.Gtk.Box)
            descendants = list(walk(child))
            self.assertIn(window.list_box, descendants)
            self.assertIsInstance(window.list_box, self.Gtk.ListBox)
            rows = window.list_box.get_children()
            self.assertEqual(len(rows), len(entries))
            self.assertGreater(len(rows), 0)
            for entry, row in zip(entries, rows):
                self.assertIn(entry["name"], row_text(row))
            shown = "\n".join(row_text(row) for row in rows)
            for name in ("World Clock", "Color Timer Clock", "Workspace Grid"):
                self.assertIn(name, shown)
            self.assertIn("place_entry", type(window).__dict__)
            self.assertNotIn("do_add", type(window).__dict__)
            self.assertNotIn("do_remove", type(window).__dict__)

    def test_handler_names_are_not_gtk_virtuals(self):
        text = (ROOT / "dev-tools" / "bundle-installer.py").read_text(encoding="utf-8")
        for name in ("do_add", "do_remove", "do_size_allocate", "do_draw"):
            self.assertNotIn("def %s(" % name, text)
        self.assertIn("def place_entry(", text)

    def test_each_desktop_lists_its_own_widgets(self):
        for desktop in ("cinnamon", "gnome", "kde"):
            entries = self.manifest["desktops"][desktop]
            with open_manager(self.manifest, desktop, self.root) as window:
                child = window.get_child()
                self.assertIsNotNone(child)
                self.assertIn(window.list_box, list(walk(child)))
                rows = window.list_box.get_children()
                self.assertEqual(len(rows), len(entries))
                shown = "\n".join(row_text(row) for row in rows)
                for entry in entries:
                    self.assertIn(entry["name"], shown)
                header = BI.environment_label(desktop)
                labels = [
                    widget.get_text()
                    for widget in walk(child)
                    if isinstance(widget, self.Gtk.Label)
                ]
                self.assertIn(header, labels)

    def test_empty_catalog_still_attaches_a_child(self):
        empty = manifest_for({})
        with open_manager(empty, "cinnamon", self.root) as window:
            self.assertIsNotNone(window.get_child())
            self.assertIn(window.list_box, list(walk(window.get_child())))
            self.assertEqual(window.list_box.get_children(), [])

    def test_install_then_placement_buttons(self):
        desk = cinnamon_entry(alias="desk-clock", name="Desk Clock", surface="desktop")
        panel = cinnamon_entry(alias="panel-names", kind="applet", name="Panel Names", surface="panel")
        manifest = manifest_for({"cinnamon": [desk, panel]})
        installed = set()
        calls = []

        def files(entry):
            return entry["alias"] in installed

        def install(entry, root, dry):
            installed.add(entry["alias"])
            calls.append(("install", entry["alias"], dry))
            return True

        def place(entry, surface, dry):
            calls.append(("place", entry["alias"], surface, dry))
            return True

        def uninstall(entry, dry):
            installed.discard(entry["alias"])
            calls.append(("uninstall", entry["alias"], dry))
            return True

        def remove(entry, dry, all_instances=False):
            calls.append(("remove", entry["alias"], all_instances))
            return True

        patches = {
            "FILES_INSTALLED": {"cinnamon": files, "gnome": files, "kde": files},
            "INSTALLERS": {"cinnamon": install, "gnome": install, "kde": install},
            "UNINSTALLERS": {"cinnamon": uninstall, "gnome": uninstall, "kde": uninstall},
            "ADD_INSTANCE": {"cinnamon": place, "gnome": place, "kde": place},
            "REMOVE_INSTANCE": {"cinnamon": remove, "gnome": remove, "kde": remove},
            "cinnamon_enabled_entries": lambda kind, uuid: [],
        }
        with open_manager(manifest, "cinnamon", self.root, **patches) as window:
            clock = row_named(window, "Desk Clock")
            names = row_named(window, "Panel Names")
            self.assertIn("not installed", row_text(clock))
            self.assertTrue(button_named(clock, "Install").get_sensitive())
            self.assertFalse(button_named(clock, "Uninstall").get_sensitive())
            self.assertFalse(button_named(clock, "Add to desktop").get_sensitive())
            self.assertFalse(button_named(clock, "Add to panel").get_sensitive())
            self.assertFalse(button_named(clock, "Remove instance").get_sensitive())

            button_named(clock, "Install").clicked()
            clock = row_named(window, "Desk Clock")
            clock_text = row_text(clock)
            self.assertNotIn("not installed", clock_text)
            self.assertIn("installed", clock_text)
            self.assertFalse(button_named(clock, "Install").get_sensitive())
            self.assertTrue(button_named(clock, "Uninstall").get_sensitive())
            self.assertTrue(button_named(clock, "Add to desktop").get_sensitive())
            self.assertFalse(button_named(clock, "Add to panel").get_sensitive())
            self.assertTrue(button_named(clock, "Remove instance").get_sensitive())

            button_named(clock, "Add to desktop").clicked()
            button_named(row_named(window, "Desk Clock"), "Remove instance").clicked()
            button_named(row_named(window, "Desk Clock"), "Uninstall").clicked()

            button_named(row_named(window, "Panel Names"), "Install").clicked()
            names = row_named(window, "Panel Names")
            self.assertFalse(button_named(names, "Add to desktop").get_sensitive())
            self.assertTrue(button_named(names, "Add to panel").get_sensitive())
            button_named(names, "Add to panel").clicked()

        self.assertEqual(calls[0], ("install", "desk-clock", False))
        self.assertEqual(calls[1], ("place", "desk-clock", "desktop", False))
        self.assertEqual(calls[2], ("remove", "desk-clock", False))
        self.assertEqual(calls[3], ("uninstall", "desk-clock", False))
        self.assertEqual(calls[4], ("install", "panel-names", False))
        self.assertEqual(calls[5], ("place", "panel-names", "panel", False))

    def test_kde_row_can_place_on_desktop_or_panel(self):
        entry = kde_entry(name="Desk Clock", surface="desktop")
        manifest = manifest_for({"kde": [entry]})
        installed = {entry["alias"]}
        calls = []
        patches = {
            "FILES_INSTALLED": {
                "cinnamon": lambda item: False,
                "gnome": lambda item: False,
                "kde": lambda item: item["alias"] in installed,
            },
            "ADD_INSTANCE": {
                "cinnamon": lambda *args: False,
                "gnome": lambda *args: False,
                "kde": lambda item, surface, dry: calls.append((item["alias"], surface)) or True,
            },
        }
        with open_manager(manifest, "kde", self.root, **patches) as window:
            row = row_named(window, "Desk Clock")
            self.assertTrue(button_named(row, "Add to desktop").get_sensitive())
            self.assertTrue(button_named(row, "Add to panel").get_sensitive())
            button_named(row, "Add to desktop").clicked()
            button_named(row_named(window, "Desk Clock"), "Add to panel").clicked()
        self.assertEqual(calls, [("desk-clock", "desktop"), ("desk-clock", "panel")])

    def test_install_all_and_uninstall_all(self):
        desk = cinnamon_entry(alias="desk-clock", name="Desk Clock")
        panel = cinnamon_entry(alias="panel-names", kind="applet", name="Panel Names", surface="panel")
        manifest = manifest_for({"cinnamon": [desk, panel]})
        installed = set()
        calls = []

        def files(entry):
            return entry["alias"] in installed

        def install(entry, root, dry):
            installed.add(entry["alias"])
            calls.append(("install", entry["alias"]))
            return True

        def uninstall(entry, dry):
            installed.discard(entry["alias"])
            calls.append(("uninstall", entry["alias"]))
            return True

        patches = {
            "FILES_INSTALLED": {"cinnamon": files, "gnome": files, "kde": files},
            "INSTALLERS": {"cinnamon": install, "gnome": install, "kde": install},
            "UNINSTALLERS": {"cinnamon": uninstall, "gnome": uninstall, "kde": uninstall},
            "cinnamon_enabled_entries": lambda kind, uuid: [],
        }
        with open_manager(manifest, "cinnamon", self.root, **patches) as window:
            button_named(window, "Install all").clicked()
            for name in ("Desk Clock", "Panel Names"):
                text = row_text(row_named(window, name))
                self.assertNotIn("not installed", text)
                self.assertIn("installed", text)
            button_named(window, "Uninstall all").clicked()
            self.assertIn("not installed", row_text(row_named(window, "Desk Clock")))
            self.assertIn("not installed", row_text(row_named(window, "Panel Names")))
        self.assertEqual(
            calls,
            [
                ("install", "desk-clock"),
                ("install", "panel-names"),
                ("uninstall", "desk-clock"),
                ("uninstall", "panel-names"),
            ],
        )

    def test_gnome_row_shows_enabled_after_install(self):
        entry = gnome_entry(name="Desk Clock", surface="desktop")
        manifest = manifest_for({"gnome": [entry]})
        state = {"installed": False, "enabled": False}
        calls = []

        def files(_entry):
            return state["installed"]

        def install(_entry, root, dry):
            state["installed"] = True
            state["enabled"] = True
            calls.append("install")
            return True

        patches = {
            "FILES_INSTALLED": {"cinnamon": files, "gnome": files, "kde": files},
            "INSTALLERS": {"cinnamon": install, "gnome": install, "kde": install},
            "uuid_enabled_gnome": lambda uuid: state["enabled"],
        }
        with open_manager(manifest, "gnome", self.root, **patches) as window:
            self.assertIn("not installed", row_text(row_named(window, "Desk Clock")))
            button_named(row_named(window, "Desk Clock"), "Install").clicked()
            text = row_text(row_named(window, "Desk Clock"))
            self.assertIn("enabled", text)
            self.assertNotIn("not installed", text)
        self.assertEqual(calls, ["install"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
