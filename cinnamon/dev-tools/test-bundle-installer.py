#!/usr/bin/env python3
"""Headless checks for the bundle installer helpers."""

from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


BI = load("bundle_installer", ROOT / "dev-tools" / "bundle-installer.py")
PR = load("ports_release", ROOT / "dev-tools" / "ports-release.py")


class DetectDesktop(unittest.TestCase):
    def test_prefers_cinnamon_in_xdg_current(self):
        env = {"XDG_CURRENT_DESKTOP": "X-Cinnamon:GNOME", "XDG_SESSION_DESKTOP": "plasma"}
        self.assertEqual(BI.detect_desktop(env=env), "cinnamon")

    def test_kde_from_plasma_token(self):
        env = {"XDG_CURRENT_DESKTOP": "KDE", "XDG_SESSION_DESKTOP": ""}
        self.assertEqual(BI.detect_desktop(env=env), "kde")

    def test_gnome_from_session_desktop(self):
        env = {"XDG_CURRENT_DESKTOP": "", "XDG_SESSION_DESKTOP": "gnome"}
        self.assertEqual(BI.detect_desktop(env=env), "gnome")

    def test_override_wins(self):
        env = {"XDG_CURRENT_DESKTOP": "GNOME"}
        self.assertEqual(BI.detect_desktop("kde", env), "kde")

    def test_unknown_without_binaries_when_env_injected(self):
        self.assertIsNone(BI.detect_desktop(env={}))


class OsAndVersion(unittest.TestCase):
    def test_os_release_pretty_name(self):
        text = 'NAME="Fedora Linux"\nPRETTY_NAME="Fedora Linux 41"\n'
        self.assertEqual(BI.parse_os_release(text), "Fedora Linux 41")

    def test_os_release_falls_back_to_name(self):
        self.assertEqual(BI.parse_os_release('NAME="Debian GNU/Linux"\n'), "Debian GNU/Linux")

    def test_environment_label(self):
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False) as handle:
            handle.write('PRETTY_NAME="Linux Mint 22"\n')
            path = Path(handle.name)
        try:
            label = BI.environment_label("cinnamon", session="x11", release_path=path)
            self.assertEqual(label, "Linux Mint 22 · Cinnamon · x11")
        finally:
            path.unlink()

    def test_parse_version_strips_v(self):
        self.assertEqual(BI.parse_version("v1.2.3"), (1, 2, 3))

    def test_version_newer(self):
        self.assertTrue(BI.version_newer("v1.1.0", "1.0.0"))
        self.assertFalse(BI.version_newer("1.1.0", "1.1.0"))
        self.assertFalse(BI.version_newer("1.0.0", "1.1.0"))


class GithubRelease(unittest.TestCase):
    def test_picks_named_asset(self):
        payload = {
            "tag_name": "v1.2.0",
            "assets": [
                {"name": "notes.txt", "browser_download_url": "https://example/notes"},
                {
                    "name": BI.ASSET_NAME,
                    "browser_download_url": "https://example/app",
                },
            ],
        }
        latest = BI.latest_release_from_json(payload)
        self.assertEqual(latest["tag"], "v1.2.0")
        self.assertEqual(latest["url"], "https://example/app")

    def test_missing_asset(self):
        latest = BI.latest_release_from_json({"tag_name": "v1.0.0", "assets": []})
        self.assertIsNone(latest["url"])


class SurfaceAndFilter(unittest.TestCase):
    def test_alias_surfaces_match_builder(self):
        for alias in ("world-clock", "color-clock", "workspace-grid"):
            self.assertEqual(BI.surface_for_alias(alias), "desktop")
            self.assertEqual(PR.widget_surface(alias), "desktop")
        for alias in ("workspace-names", "command-launcher", "panel-profiles"):
            self.assertEqual(BI.surface_for_alias(alias), "panel")
            self.assertEqual(PR.widget_surface(alias), "panel")

    def test_entry_surface_reads_manifest_field(self):
        self.assertEqual(BI.entry_surface({"surface": "panel", "alias": "world-clock"}), "panel")

    def test_filter_by_alias_uuid_and_package(self):
        entries = [
            {"alias": "world-clock", "uuid": "gnome-world-clock@curbsoftware"},
            {"alias": "workspace-names", "package_id": "com.curbsoftware.workspacenames"},
        ]
        chosen = BI.filter_entries(entries, ["world-clock"])
        self.assertEqual(len(chosen), 1)
        self.assertEqual(chosen[0]["alias"], "world-clock")
        chosen = BI.filter_entries(entries, ["com.curbsoftware.workspacenames"])
        self.assertEqual(chosen[0]["alias"], "workspace-names")

    def test_filter_unknown_raises(self):
        with self.assertRaises(ValueError):
            BI.filter_entries([{"alias": "world-clock"}], ["nope"])


class CinnamonEntries(unittest.TestCase):
    def test_first_desklet_instance(self):
        entry = BI.cinnamon_next_desklet_entry("clock@x", [])
        self.assertEqual(entry, "clock@x:1:100:100")

    def test_next_desklet_offsets(self):
        current = ["clock@x:1:100:100"]
        entry = BI.cinnamon_next_desklet_entry("clock@x", current)
        self.assertEqual(entry, "clock@x:2:140:100")

    def test_next_applet_uses_max_position(self):
        current = ["other@x:1:3", "clock@x:1:4"]
        entry = BI.cinnamon_next_applet_entry("clock@x", current)
        self.assertEqual(entry, "clock@x:1:5")

    def test_remove_last_matching_instance(self):
        current = ["a@x:1:1", "b@x:1:2", "a@x:1:3"]
        kept = BI.cinnamon_without_one("a@x", current)
        self.assertEqual(kept, ["a@x:1:1", "b@x:1:2"])

    def test_remove_all_matching(self):
        current = ["a@x:1:1", "b@x:1:2", "a@x:1:3"]
        kept = BI.cinnamon_without_one("a@x", current, all_instances=True)
        self.assertEqual(kept, ["b@x:1:2"])


class KdeScripts(unittest.TestCase):
    def test_add_desktop_script(self):
        script = BI.kde_add_script("com.curbsoftware.worldclock", "desktop")
        self.assertIn("desktops()", script)
        self.assertIn('addWidget("com.curbsoftware.worldclock")', script)
        self.assertNotIn("panels()", script)

    def test_add_panel_script(self):
        script = BI.kde_add_script("com.curbsoftware.workspacenames", "panel")
        self.assertIn("panels()", script)
        self.assertIn('addWidget("com.curbsoftware.workspacenames")', script)

    def test_remove_script_quotes_id(self):
        script = BI.kde_remove_script("com.curbsoftware.worldclock", all_instances=True)
        self.assertIn('"com.curbsoftware.worldclock"', script)
        self.assertIn("desktops()", script)
        self.assertIn("panels()", script)


class ManifestBuilder(unittest.TestCase):
    def test_bundle_version_file(self):
        self.assertEqual(PR.bundle_version(), "1.1.0")

    def test_port_repo_names(self):
        gnome = {"desktop": "gnome", "uuid": "gnome-world-clock@curbsoftware", "source": "gnome-world-clock@curbsoftware"}
        kde = {"desktop": "kde", "source": "kde-world-clock", "package_id": "com.curbsoftware.worldclock"}
        self.assertEqual(PR.port_repo_name(gnome), "gnome-world-clock")
        self.assertEqual(PR.port_repo_name(kde), "kde-world-clock")

    def test_build_manifest_writes_surface_and_alias(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = PR.build_manifest(Path(temporary))
            payload = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(payload["bundle"]["version"], "1.1.0")
        clocks = [item for item in payload["desktops"]["cinnamon"] if item["alias"] == "world-clock"]
        names = [item for item in payload["desktops"]["gnome"] if item["alias"] == "workspace-names"]
        self.assertEqual(clocks[0]["surface"], "desktop")
        self.assertEqual(names[0]["surface"], "panel")
        self.assertTrue(any(item["alias"] == "world-clock" for item in payload["desktops"]["kde"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
