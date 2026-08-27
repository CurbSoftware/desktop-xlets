#!/usr/bin/env python3
"""Validate, test, and build independent Cinnamon Spices submissions."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import zipfile


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT = ROOT / "dist" / "spices"
OUTPUT_MARKER = ".spices-release-output"
FORBIDDEN_METADATA = {"dangerous", "icon", "last-edited"}
ROOT_FILES = ("info.json", "screenshot.png", "README.md", "LICENSE")
RUNTIME_ROOT_EXCLUDES = {
    "CHANGELOG.md", "DEVELOPMENT.md", "LICENSE", "README.md", "RESEARCH.md",
    "info.json", "screenshot.png",
}
RUNTIME_DIR_EXCLUDES = {
    ".git", ".idea", ".vscode", "__pycache__", "docs", "fixtures",
    "screenshots", "tests",
}
RUNTIME_SUFFIX_EXCLUDES = {".mo", ".pyc", ".swp", ".swo"}


EXTENSIONS = (
    {
        "alias": "world-clock",
        "source": "cinnamon-world-clock-desklet@curbsoftware",
        "uuid": "cinnamon-world-clock-desklet@curbsoftware",
        "kind": "desklet",
        "tests": (("gjs", "dev-tools/test-clock-actions.js"),),
        "live": ("python3", "dev-tools/live-test-xlet-smoke.py", "world-clock"),
    },
    {
        "alias": "color-clock",
        "source": "cinnamon-color-timer-clock-desklet@curbsoftware",
        "uuid": "cinnamon-color-timer-clock-desklet@curbsoftware",
        "kind": "desklet",
        "tests": (
            ("gjs", "dev-tools/test-card-actions.js"),
            ("node", "cinnamon-color-timer-clock-desklet@curbsoftware/tests/test-cardActions.js"),
            ("python3", "cinnamon-color-timer-clock-desklet@curbsoftware/tests/test-timezone.py"),
        ),
        "live": ("python3", "dev-tools/live-test-color-desklet.py"),
    },
    {
        "alias": "workspace-grid",
        "source": "cinnamon-workspace-grid-desklet@curbsoftware",
        "uuid": "cinnamon-workspace-grid-desklet@curbsoftware",
        "kind": "desklet",
        "tests": (("gjs", "dev-tools/test-workspace-actions.js"),),
        "live": ("python3", "dev-tools/live-test-desklet.py"),
    },
    {
        "alias": "workspace-names",
        "source": "cinnamon-workspace-name-applet@curbsoftware",
        "uuid": "cinnamon-workspace-name-applet@curbsoftware",
        "kind": "applet",
        "tests": (("gjs", "dev-tools/test-workspace-actions.js"),),
        "live": ("python3", "dev-tools/live-test-applet.py"),
        "warning": (
            "This is derived from workspace-name@willurd. Keep original_author "
            "in info.json and call out the replacement scope in the pull request."
        ),
    },
    {
        "alias": "panel-profiles",
        "source": "cinnamon-panel-profiles-applet@curbsoftware",
        "uuid": "cinnamon-panel-profiles-applet@curbsoftware",
        "kind": "applet",
        "tests": (
            ("gjs", "dev-tools/test-pp-capture.js"),
            ("isolated-gjs", "dev-tools/test-pp-storage.js"),
            ("isolated-gjs", "dev-tools/test-pp-apply.js"),
        ),
        "live": ("python3", "dev-tools/live-test-panel-profiles.py"),
    },
    {
        "alias": "command-launcher",
        "source": "command-launcher@curbsoftware",
        "uuid": "cinnamon-command-launcher-applet@curbsoftware",
        "kind": "applet",
        "tests": (),
        "live": ("python3", "dev-tools/live-test-xlet-smoke.py", "command-launcher"),
        "blocked": (
            "The runtime is the existing commandLauncher@scollins spice with only "
            "a renamed keybinding ID. Do not submit it as a new duplicate spice. "
            "Prepare a focused update against the existing upstream UUID instead."
        ),
    },
)


def say(message: str = "") -> None:
    print(message, flush=True)


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def select(values: list[str]) -> list[dict]:
    if not values or values == ["all"]:
        return list(EXTENSIONS)
    found = []
    for value in values:
        matches = [item for item in EXTENSIONS if value in {
            item["alias"], item["uuid"], item["source"]
        }]
        if not matches:
            raise ValueError("Unknown extension: " + value)
        if matches[0] not in found:
            found.append(matches[0])
    return found


def read_json(path: Path, failures: list[str]) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except Exception as error:
        failures.append(str(path.relative_to(ROOT)) + ": invalid JSON: " + str(error))
        return {}
    if not isinstance(value, dict):
        failures.append(str(path.relative_to(ROOT)) + ": root must be an object")
        return {}
    return value


def png_size(path: Path) -> tuple[int, int] | None:
    try:
        with path.open("rb") as handle:
            if handle.read(8) != b"\x89PNG\r\n\x1a\n":
                return None
            length = struct.unpack(">I", handle.read(4))[0]
            chunk = handle.read(4)
            if chunk != b"IHDR" or length < 8:
                return None
            return struct.unpack(">II", handle.read(8))
    except OSError:
        return None


def source_checks(item: dict) -> tuple[list[str], list[str]]:
    failures: list[str] = []
    warnings: list[str] = []
    source = ROOT / item["source"]
    uuid = item["uuid"]
    main_file = item["kind"] + ".js"

    if item.get("blocked"):
        failures.append(item["blocked"])
    if item.get("warning"):
        warnings.append(item["warning"])
    if not source.is_dir():
        failures.append("missing source directory: " + item["source"])
        return failures, warnings
    if source.name != uuid:
        failures.append("source directory does not match metadata UUID: " + source.name)

    mandatory = ("metadata.json", main_file, "icon.png", "info.json", "screenshot.png")
    for name in mandatory:
        if not (source / name).is_file():
            failures.append("missing required file: " + name)

    metadata = read_json(source / "metadata.json", failures) if (source / "metadata.json").is_file() else {}
    info = read_json(source / "info.json", failures) if (source / "info.json").is_file() else {}
    for field in ("uuid", "name", "description"):
        if field not in metadata:
            failures.append("metadata.json missing field: " + field)
    if metadata.get("uuid") != uuid:
        failures.append("metadata UUID does not match release UUID")
    for field in sorted(FORBIDDEN_METADATA.intersection(metadata)):
        failures.append("metadata.json contains forbidden field: " + field)
    for field, value in metadata.items():
        try:
            str(value).encode("ascii")
        except UnicodeEncodeError:
            failures.append("metadata.json contains non-ASCII value: " + field)
    if not isinstance(metadata.get("max-instances", 1), int):
        failures.append("metadata max-instances must be an integer")

    author = info.get("author")
    if not isinstance(author, str) or not author.strip() or " " in author.strip():
        failures.append("info.json author must be one GitHub username")

    icon = png_size(source / "icon.png")
    if icon is None:
        failures.append("icon.png is not a readable PNG")
    elif icon[0] != icon[1]:
        failures.append("icon.png must be square")
    screenshot = png_size(source / "screenshot.png")
    if screenshot is None:
        failures.append("screenshot.png is not a readable PNG")
    elif screenshot[0] < 240 or (item["kind"] == "desklet" and screenshot[1] < 120) or \
            (item["kind"] == "applet" and screenshot[1] < 32):
        warnings.append("screenshot.png is unusually small: %dx%d" % screenshot)

    pot_files = sorted(source.glob("po/*.pot"))
    if len(pot_files) > 1:
        failures.append("po directory contains more than one POT file")
    for bad in sorted(source.rglob("*.mo")):
        failures.append("compiled translation must not ship: " + str(bad.relative_to(source)))
    if not (source / "LICENSE").is_file():
        warnings.append("LICENSE is absent. Confirm upstream licensing before submission.")
    return failures, warnings


def runtime_files(source: Path) -> list[Path]:
    files = []
    for path in source.rglob("*"):
        if not path.is_file():
            continue
        relative = path.relative_to(source)
        if relative.parts[0] in RUNTIME_DIR_EXCLUDES:
            continue
        if len(relative.parts) == 1 and relative.name in RUNTIME_ROOT_EXCLUDES:
            continue
        if any(part in RUNTIME_DIR_EXCLUDES for part in relative.parts[:-1]):
            continue
        if relative.suffix in RUNTIME_SUFFIX_EXCLUDES or relative.name.endswith("~"):
            continue
        files.append(relative)
    return sorted(files)


def build_stage(item: dict, destination: Path) -> Path:
    source = ROOT / item["source"]
    uuid = item["uuid"]
    stage = destination / uuid
    if stage.exists():
        shutil.rmtree(stage)
    runtime = stage / "files" / uuid
    runtime.mkdir(parents=True)
    for name in ROOT_FILES:
        path = source / name
        if path.is_file():
            shutil.copy2(path, stage / name)
    screenshots = source / "screenshots"
    if screenshots.is_dir():
        shutil.copytree(screenshots, stage / "screenshots")
    for relative in runtime_files(source):
        target = runtime / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source / relative, target)
    return stage


def staged_checks(stage: Path, item: dict) -> list[str]:
    failures = []
    uuid = item["uuid"]
    runtime = stage / "files" / uuid
    if sorted(path.name for path in (stage / "files").iterdir()) != [uuid]:
        failures.append("files directory must contain only the UUID directory")
    if not (runtime / (item["kind"] + ".js")).is_file():
        failures.append("staged runtime is missing its main file")
    if (stage / "icon.png").exists():
        failures.append("icon.png must not be at the spice root")
    for path in stage.rglob("*"):
        if path.is_file() and (path.suffix in RUNTIME_SUFFIX_EXCLUDES or path.name.endswith("~")):
            failures.append("temporary or compiled file staged: " + str(path.relative_to(stage)))
    return failures


def deterministic_zip(stage: Path, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        output.unlink()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(stage.rglob("*")):
            if not path.is_file():
                continue
            relative = Path(stage.name) / path.relative_to(stage)
            info = zipfile.ZipInfo(str(relative), date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o755 if os.access(path, os.X_OK) else 0o644) << 16
            archive.writestr(info, path.read_bytes())


def run_command(command: tuple[str, ...], env: dict[str, str] | None = None) -> bool:
    say("  run: " + " ".join(command))
    result = subprocess.run(command, cwd=ROOT, env=env)
    return result.returncode == 0


def generic_test(item: dict) -> bool:
    source = ROOT / item["source"]
    ok = True
    for path in sorted(source.rglob("*.json")):
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except Exception as error:
            say("  FAIL invalid JSON %s: %s" % (path.relative_to(ROOT), error))
            ok = False
    for path in sorted(source.rglob("*.js")):
        if any(part in {"tests"} for part in path.relative_to(source).parts):
            continue
        ok = run_command(("node", "--check", str(path.relative_to(ROOT)))) and ok
    for path in sorted(source.rglob("*.py")):
        try:
            compile(path.read_text(encoding="utf-8"), str(path), "exec")
        except Exception as error:
            say("  FAIL invalid Python %s: %s" % (path.relative_to(ROOT), error))
            ok = False
    return ok


def test_item(item: dict, live: bool) -> bool:
    say("\nTEST " + item["uuid"])
    ok = generic_test(item)
    for command in item["tests"]:
        if command[0] == "isolated-gjs":
            with tempfile.TemporaryDirectory(prefix="spices-test-") as config:
                env = os.environ.copy()
                env["XDG_CONFIG_HOME"] = config
                ok = run_command(("gjs",) + command[1:], env) and ok
        else:
            ok = run_command(command) and ok
    if live:
        ok = run_command(item["live"]) and ok
    say("  " + ("PASS" if ok else "FAIL") + " test gate")
    return ok


def check_item(item: dict) -> bool:
    failures, warnings = source_checks(item)
    say("\nCHECK " + item["uuid"])
    for warning in warnings:
        say("  WARN " + warning)
    for failure in failures:
        say("  FAIL " + failure)
    if not failures:
        say("  PASS source layout")
    return not failures


def build_item(item: dict, output_dir: Path) -> bool:
    if not check_item(item):
        say("  SKIP build because source checks failed")
        return False
    if output_dir in {Path("/"), Path.home().resolve(), ROOT.resolve()}:
        say("  FAIL refusing unsafe output directory: " + str(output_dir))
        return False
    marker = output_dir / OUTPUT_MARKER
    if output_dir.exists() and any(output_dir.iterdir()) and not marker.is_file():
        say("  FAIL output directory is not owned by this release tool: " + str(output_dir))
        return False
    output_dir.mkdir(parents=True, exist_ok=True)
    marker.touch(exist_ok=True)
    stage = build_stage(item, output_dir)
    failures = staged_checks(stage, item)
    if failures:
        for failure in failures:
            say("  FAIL " + failure)
        return False
    archive = output_dir / (item["uuid"] + ".zip")
    deterministic_zip(stage, archive)
    say("  BUILT " + display_path(stage))
    say("  BUILT " + display_path(archive))
    return True


def official_validate(item: dict, checkout: Path, output_dir: Path) -> bool:
    validator = checkout / "validate-spice"
    if not validator.is_file():
        say("  FAIL missing validator: " + str(validator))
        return False
    with tempfile.TemporaryDirectory(prefix="official-spice-") as temp:
        parent = Path(temp)
        stage = build_stage(item, parent)
        result = subprocess.run([str(validator), item["uuid"]], cwd=parent)
        return result.returncode == 0


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    commands = result.add_subparsers(dest="command", required=True)
    list_parser = commands.add_parser("list", help="show independent submission status")
    list_parser.add_argument("--json", action="store_true", help="emit machine-readable project metadata")
    for name in ("check", "test", "build", "release"):
        sub = commands.add_parser(name)
        sub.add_argument("extensions", nargs="*", default=["all"])
        if name in {"test", "release"}:
            sub.add_argument("--live", action="store_true")
        if name in {"build", "release"}:
            sub.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
        if name == "release":
            sub.add_argument("--applets-checkout", type=Path)
            sub.add_argument("--desklets-checkout", type=Path)
    return result


def main() -> int:
    args = parser().parse_args()
    try:
        items = select(getattr(args, "extensions", ["all"]))
    except ValueError as error:
        print(error, file=sys.stderr)
        return 2

    if args.command == "list":
        if args.json:
            payload = []
            for item in items:
                payload.append({
                    "alias": item["alias"],
                    "source": item["source"],
                    "uuid": item["uuid"],
                    "kind": item["kind"],
                    "status": "blocked" if item.get("blocked") else "candidate",
                    "reason": item.get("blocked"),
                    "warning": item.get("warning"),
                })
            print(json.dumps(payload, indent=2, sort_keys=True))
            return 0
        for item in items:
            status = "BLOCKED" if item.get("blocked") else "CANDIDATE"
            say("%-10s %-18s %s" % (status, item["kind"], item["uuid"]))
            if item.get("blocked"):
                say("  " + item["blocked"])
        return 0

    passed = True
    for item in items:
        if args.command == "check":
            passed = check_item(item) and passed
        elif args.command == "test":
            passed = test_item(item, args.live) and passed
        elif args.command == "build":
            passed = build_item(item, args.output_dir.resolve()) and passed
        elif args.command == "release":
            item_ok = test_item(item, args.live)
            item_ok = build_item(item, args.output_dir.resolve()) and item_ok
            checkout = args.applets_checkout if item["kind"] == "applet" else args.desklets_checkout
            if item_ok and checkout:
                item_ok = official_validate(item, checkout.resolve(), args.output_dir.resolve())
            elif item_ok:
                say("  WARN official validate-spice not run; pass the matching checkout")
            passed = item_ok and passed
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
