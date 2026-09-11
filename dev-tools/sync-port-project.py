#!/usr/bin/env python3
"""Sync GNOME and KDE ports into standalone repos, plus the AppImage product."""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile


ROOT = Path(__file__).resolve().parent.parent
PORTS_TOOL = ROOT / "dev-tools" / "ports-release.py"
DEFAULT_PARENT = ROOT.parent / "ports"
DEFAULT_REMOTE_TEMPLATE = "git@github.com:CurbSoftware/{repo}.git"
BUNDLE_REPO = "curb-desktop-widgets"
BUNDLE_SOURCE = "dev-tools/appimage"
APPIMAGE_NAME = "curb-desktop-widgets-x86_64.AppImage"
EXTRA_ROOT_FILES = ("README.md", "LICENSE")


def _load_spice_sync():
    path = Path(__file__).resolve().parent / "sync-spice-project.py"
    spec = importlib.util.spec_from_file_location("sync_spice_project", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SP = _load_spice_sync()
SyncError = SP.SyncError
say = SP.say
run = SP.run
safe_parent = SP.safe_parent
file_map = SP.file_map
load_manifest = SP.load_manifest
drift_paths = SP.drift_paths
atomic_json = SP.atomic_json
prune_empty_parents = SP.prune_empty_parents
init_repository = SP.init_repository
set_remote = SP.set_remote
ensure_origin = SP.ensure_origin
remote_slug = SP.remote_slug
MANIFEST = SP.MANIFEST
MANIFEST_SCHEMA = SP.MANIFEST_SCHEMA


def bundle_project() -> dict:
    version = (ROOT / BUNDLE_SOURCE / "VERSION").read_text(encoding="utf-8").strip()
    return {
        "alias": "bundle",
        "desktop": "bundle",
        "kind": "appimage",
        "source": BUNDLE_SOURCE,
        "repo": BUNDLE_REPO,
        "uuid": None,
        "package_id": None,
        "status": "candidate",
        "version": version,
    }


def repo_name(project: dict) -> str:
    if project.get("repo"):
        return project["repo"]
    if project.get("desktop") == "gnome":
        return project["uuid"].split("@")[0]
    return project["source"]


def release_ports() -> list[dict]:
    result = run([sys.executable, str(PORTS_TOOL), "list", "--json"], capture=True)
    try:
        projects = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise SyncError("port metadata is not valid JSON: " + str(error)) from error
    if not isinstance(projects, list):
        raise SyncError("port metadata must be a list")
    return projects


def select_projects(values: list[str]) -> list[dict]:
    ports = release_ports()
    bundle = bundle_project()
    catalog = list(ports) + [bundle]
    if not values or values == ["all"]:
        selected = [project for project in catalog if project.get("status") == "candidate"]
        return selected
    selected = []
    for value in values:
        matches = [
            project for project in catalog
            if value in {
                project.get("alias"),
                project.get("uuid"),
                project.get("source"),
                project.get("package_id"),
                project.get("repo"),
                repo_name(project),
                "%s@%s" % (project.get("alias"), project.get("desktop")),
            }
        ]
        if not matches:
            raise SyncError("unknown port: " + value)
        for project in matches:
            if project.get("status") == "blocked":
                raise SyncError(repo_name(project) + " is blocked: " + (project.get("reason") or ""))
            if project not in selected:
                selected.append(project)
    return selected


def source_is_dirty(project: dict) -> bool:
    paths = [project["source"]]
    if project.get("desktop") == "bundle":
        paths.append("dev-tools/bundle-installer.py")
        paths.append("dev-tools/ports-release.py")
    result = run(["git", "status", "--porcelain", "--", *paths], capture=True)
    return bool(result.stdout.strip())


def display_name(target: Path, project: dict) -> str:
    metadata_path = target / "metadata.json"
    if metadata_path.is_file():
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        return metadata.get("name") or metadata.get("KPlugin", {}).get("Name") or repo_name(project)
    return repo_name(project)


def commit_project(target: Path, project: dict, old: dict | None, new_files: dict[str, str]) -> bool:
    tracked = sorted(set((old or {}).get("managed_files", {})) | set(new_files) | {MANIFEST})
    run(["git", "add", "-A", "--", *tracked], cwd=target)
    staged = run(["git", "diff", "--cached", "--quiet"], cwd=target, check=False)
    if staged.returncode == 0:
        say("  clean: no standalone commit needed")
        return False
    if staged.returncode != 1:
        raise SyncError("could not inspect staged standalone changes in " + str(target))
    has_head = run(["git", "rev-parse", "--verify", "HEAD"], cwd=target, capture=True, check=False)
    if has_head.returncode == 0:
        message = "chore: sync from cinnamon monorepo"
    else:
        message = "Initial import of " + display_name(target, project)
    run(["git", "commit", "-m", message], cwd=target)
    return True


def build_port_stage(project: dict, temporary: Path) -> Path:
    if project.get("desktop") == "bundle":
        stage = temporary / BUNDLE_REPO
        stage.mkdir(parents=True)
        source = ROOT / BUNDLE_SOURCE
        for name in EXTRA_ROOT_FILES:
            path = source / name
            if not path.is_file():
                raise SyncError("bundle product is missing " + name)
            shutil.copy2(path, stage / name)
        return stage

    output = temporary / "release"
    selector = "%s@%s" % (project["alias"], project["desktop"])
    run([
        sys.executable,
        str(PORTS_TOOL),
        "build",
        selector,
        "--output-dir",
        str(output),
        "--skip-cinnamon",
    ])
    name = project.get("uuid") or project["package_id"]
    stage = output / project["desktop"] / name
    if not stage.is_dir():
        raise SyncError("port builder did not create " + str(stage))
    source = ROOT / project["source"]
    for name in EXTRA_ROOT_FILES:
        path = source / name
        if path.is_file():
            shutil.copy2(path, stage / name)
    return stage


def sync_project(
    project: dict,
    *,
    parent: Path,
    force: bool,
    dry_run: bool,
    initialize: bool,
    commit: bool,
    remote_template: str | None,
    push: bool,
) -> Path:
    target = parent / repo_name(project)
    if target.is_symlink():
        raise SyncError("refusing symlinked project target: " + str(target))
    with tempfile.TemporaryDirectory(prefix="port-project-sync-") as temporary_name:
        stage = build_port_stage(project, Path(temporary_name))
        incoming = file_map(stage)
        old = load_manifest(target) if target.exists() else None
        if target.exists() and old is None:
            entries = [path.name for path in target.iterdir() if path.name != ".git"]
            if entries and not force:
                raise SyncError(
                    "target has no sync manifest and is not empty: " + str(target)
                    + "\nUse --force only after reviewing its contents."
                )
        drift = drift_paths(target, old, incoming) if target.exists() else []
        if drift and not force:
            preview = "\n".join("  " + path for path in drift[:20])
            raise SyncError(
                "standalone project has edits outside the monorepo:\n" + preview
                + ("\n  ..." if len(drift) > 20 else "")
                + "\nMove those edits into the monorepo or rerun with --force."
            )

        old_files = (old or {}).get("managed_files", {})
        changed = sorted(
            relative for relative, digest in incoming.items()
            if old_files.get(relative) != digest
        )
        removed = sorted(set(old_files) - set(incoming))
        label = repo_name(project)
        if not changed and not removed and old is not None:
            say("SYNC " + label + "\n  clean: generated files already match")
        else:
            say("SYNC " + label)
            say("  update: %d file(s), remove: %d file(s)" % (len(changed), len(removed)))
        if dry_run:
            say("  dry run: " + str(target))
            return target

        target.mkdir(parents=True, exist_ok=True)
        for relative in removed:
            path = target / relative
            if path.is_file() or path.is_symlink():
                path.unlink()
                prune_empty_parents(path, target)
        for relative in incoming:
            source = stage / relative
            destination = target / relative
            if destination.is_symlink():
                destination.unlink()
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)

        current_revision = SP.git_revision()
        current_dirty = source_is_dirty(project)
        identity = {
            "alias": project.get("alias"),
            "desktop": project.get("desktop"),
            "kind": project.get("kind"),
            "uuid": project.get("uuid"),
            "package_id": project.get("package_id"),
            "repo": repo_name(project),
        }
        manifest = {
            "schema": MANIFEST_SCHEMA,
            "generator": "dev-tools/sync-port-project.py",
            "source_repository": "CurbSoftware/cinnamon-monorepo",
            "source_revision": current_revision,
            "source_worktree_dirty": current_dirty,
            "source_directory": project["source"],
            "port": identity,
            "managed_files": incoming,
        }
        if old and old_files == incoming and old.get("source_worktree_dirty") == current_dirty:
            manifest["source_revision"] = old.get("source_revision", manifest["source_revision"])
        atomic_json(target / MANIFEST, manifest)

        if initialize or commit or remote_template or push:
            init_repository(target)
        if remote_template:
            try:
                remote = remote_template.format(**{**project, "repo": repo_name(project)})
            except KeyError as error:
                raise SyncError("unknown remote template field: " + str(error)) from error
            set_remote(target, remote)
        if commit:
            commit_project(target, project, old, incoming)
        if push:
            if not commit:
                raise SyncError("--push requires --commit")
            if not remote_template and run(
                ["git", "remote", "get-url", "origin"], cwd=target, capture=True, check=False
            ).returncode != 0:
                raise SyncError("--push requires an origin remote or --remote-template")
            run(["git", "push", "-u", "origin", "HEAD:main"], cwd=target)
        say("  project: " + str(target))
        return target


def ensure_standalone_repo(project: dict, parent: Path, remote_template: str) -> None:
    name = repo_name(project)
    target = parent / name
    remote = remote_template.format(**{**project, "repo": name})
    slug = remote_slug(remote)
    if run(["gh", "repo", "view", slug], capture=True, check=False).returncode != 0:
        say("CREATE " + slug)
        run(["gh", "repo", "create", slug, "--public", "--clone=false"], cwd=parent)
    if not target.exists():
        say("CLONE " + slug)
        run(["gh", "repo", "clone", slug, str(target)])
        for entry in target.iterdir():
            if entry.name == ".git":
                continue
            if entry.is_dir() and not entry.is_symlink():
                shutil.rmtree(entry)
            else:
                entry.unlink()
        run(["git", "add", "-A"], cwd=target)
        return
    ensure_origin(target, remote)


def port_version(project: dict, target: Path) -> str | None:
    if project.get("desktop") == "bundle":
        return project.get("version")
    metadata_path = target / "metadata.json"
    if not metadata_path.is_file():
        return None
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    if project.get("desktop") == "kde":
        return metadata.get("KPlugin", {}).get("Version")
    value = metadata.get("version")
    return str(value) if value is not None else None


def ensure_release(project: dict, target: Path) -> None:
    version = port_version(project, target)
    if not version:
        return
    tag = "v" + str(version)
    origin = run(["git", "remote", "get-url", "origin"], cwd=target, capture=True, check=False)
    if origin.returncode != 0:
        return
    slug = remote_slug(origin.stdout.strip())
    existing = run(["gh", "release", "view", tag, "--repo", slug],
                   capture=True, check=False)
    if existing.returncode == 0:
        say("SKIP release " + slug + " " + tag + " (already published)")
        return

    with tempfile.TemporaryDirectory(prefix="port-release-pkg-") as temporary_name:
        output = Path(temporary_name)
        assets: list[Path] = []
        if project.get("desktop") == "bundle":
            bundle_dir = output / "bundle"
            run([
                sys.executable, str(PORTS_TOOL), "bundle",
                "--output-dir", str(bundle_dir),
            ])
            asset = bundle_dir / APPIMAGE_NAME
            if not asset.is_file():
                raise SyncError("bundle did not produce " + APPIMAGE_NAME)
            assets.append(asset)
        else:
            stage = build_port_stage(project, output)
            desktop_dir = stage.parent
            if project["desktop"] == "gnome":
                asset = desktop_dir / (project["uuid"] + ".zip")
            else:
                asset = desktop_dir / (project["package_id"] + ".tar.gz")
            if not asset.is_file():
                raise SyncError("port builder did not produce " + str(asset))
            assets.append(asset)
        say("RELEASE " + slug + " " + tag)
        run([
            "gh", "release", "create", tag,
            "--repo", slug,
            "--title", slug.split("/")[1] + " " + tag,
            "--notes", "Generated from CurbSoftware/cinnamon-monorepo.",
            *[str(path) for path in assets],
        ], cwd=target)


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    commands = result.add_subparsers(dest="command", required=True)

    sync = commands.add_parser("sync", help="update independent generated port repositories")
    sync.add_argument("ports", nargs="*", default=["all"])
    sync.add_argument("--parent", type=Path, default=DEFAULT_PARENT)
    sync.add_argument("--force", action="store_true", help="replace drifted generated files")
    sync.add_argument("--dry-run", action="store_true")
    sync.add_argument("--no-init", action="store_true")
    sync.add_argument("--commit", action="store_true")
    sync.add_argument(
        "--remote-template",
        help="set origin using fields {alias}, {uuid}, {repo}, {kind}, {source}, {desktop}",
    )
    sync.add_argument("--push", action="store_true")

    publish = commands.add_parser(
        "publish",
        help="clone or create each standalone repo, then sync, commit, and push to origin main",
    )
    publish.add_argument("ports", nargs="*", default=["all"])
    publish.add_argument("--parent", type=Path, default=DEFAULT_PARENT)
    publish.add_argument(
        "--remote-template",
        default=DEFAULT_REMOTE_TEMPLATE,
        help="origin for standalone repos using fields {alias}, {uuid}, {repo}, {kind}, {source}, {desktop}",
    )
    publish.add_argument("--dry-run", action="store_true")
    publish.add_argument(
        "--no-release",
        dest="release",
        action="store_false",
        help="do not create a GitHub release package for a new version",
    )
    return result


def main() -> int:
    args = parser().parse_args()
    try:
        if args.command == "sync":
            if args.push and not args.commit:
                raise SyncError("--push requires --commit")
            parent = safe_parent(args.parent)
            projects = select_projects(args.ports)
            for project in projects:
                sync_project(
                    project,
                    parent=parent,
                    force=args.force,
                    dry_run=args.dry_run,
                    initialize=not args.no_init,
                    commit=args.commit,
                    remote_template=args.remote_template,
                    push=args.push,
                )
            return 0
        if args.command == "publish":
            parent = safe_parent(args.parent)
            projects = select_projects(args.ports)
            say("%s %s" % ("DRY RUN" if args.dry_run else "PUBLISH", parent))
            for project in projects:
                say("  " + repo_name(project))
            if not args.dry_run:
                parent.mkdir(parents=True, exist_ok=True)
                for project in projects:
                    ensure_standalone_repo(project, parent, args.remote_template)
            for project in projects:
                target = sync_project(
                    project,
                    parent=parent,
                    force=False,
                    dry_run=args.dry_run,
                    initialize=True,
                    commit=True,
                    remote_template=args.remote_template,
                    push=not args.dry_run,
                )
                if not args.dry_run and args.release:
                    ensure_release(project, target)
            return 0
        raise SyncError("unknown command")
    except SyncError as error:
        print("ERROR: " + str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
