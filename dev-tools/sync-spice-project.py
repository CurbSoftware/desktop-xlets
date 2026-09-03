#!/usr/bin/env python3
"""Sync one-way release projects, publish standalone repos, and prepare one-spice registry pull requests."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time


ROOT = Path(__file__).resolve().parent.parent
RELEASE_TOOL = ROOT / "dev-tools" / "spices-release.py"
DEFAULT_PARENT = ROOT.parent / "cinnamon"
RETIRED_PARENT = ROOT.parent / "cinnamon-projects.retired"
DEFAULT_REMOTE_TEMPLATE = "git@github.com:CurbSoftware/{repo}.git"
MANIFEST = ".monorepo-sync.json"
MANIFEST_SCHEMA = 1


class SyncError(RuntimeError):
    """A user-correctable sync or release error."""


def say(message: str = "") -> None:
    print(message, flush=True)


def run(
    command: list[str],
    *,
    cwd: Path = ROOT,
    capture: bool = False,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    try:
        result = subprocess.run(
            command,
            cwd=cwd,
            text=True,
            stdout=subprocess.PIPE if capture else None,
            stderr=subprocess.PIPE if capture else None,
        )
    except FileNotFoundError as error:
        raise SyncError("command not found: " + command[0]) from error
    if check and result.returncode != 0:
        detail = ""
        if capture:
            detail = (result.stderr or result.stdout or "").strip()
        raise SyncError("command failed: " + " ".join(command) + ("\n" + detail if detail else ""))
    return result


def release_projects() -> list[dict]:
    result = run([sys.executable, str(RELEASE_TOOL), "list", "--json"], capture=True)
    try:
        projects = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise SyncError("release metadata is not valid JSON: " + str(error)) from error
    if not isinstance(projects, list):
        raise SyncError("release metadata must be a list")
    return projects


def select_projects(values: list[str], *, allow_many: bool) -> list[dict]:
    projects = release_projects()
    if not values or values == ["all"]:
        selected = [project for project in projects if project["status"] == "candidate"]
    else:
        selected = []
        for value in values:
            matches = [project for project in projects if value in {
                project["alias"], project["uuid"], project["source"]
            }]
            if not matches:
                raise SyncError("unknown spice: " + value)
            project = matches[0]
            if project["status"] == "blocked":
                raise SyncError(project["uuid"] + " is blocked: " + project["reason"])
            if project not in selected:
                selected.append(project)
    if not allow_many and len(selected) != 1:
        raise SyncError("this command requires exactly one spice")
    return selected


def safe_parent(path: Path) -> Path:
    resolved = path.expanduser().resolve()
    unsafe = {Path("/"), Path.home().resolve(), ROOT.resolve(), RETIRED_PARENT.resolve()}
    if resolved in unsafe:
        raise SyncError("refusing unsafe projects parent: " + str(resolved))
    if ROOT.resolve() in resolved.parents:
        raise SyncError("standalone projects must live outside the monorepo")
    if resolved == RETIRED_PARENT.resolve() or RETIRED_PARENT.resolve() in resolved.parents:
        raise SyncError("refusing retired projects tree: " + str(resolved))
    return resolved


def git_revision() -> str:
    result = run(["git", "rev-parse", "HEAD"], capture=True)
    return result.stdout.strip()


def source_is_dirty(project: dict) -> bool:
    result = run(
        ["git", "status", "--porcelain", "--", project["source"]],
        capture=True,
    )
    return bool(result.stdout.strip())


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_map(root: Path) -> dict[str, str]:
    return {
        path.relative_to(root).as_posix(): sha256(path)
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


def semantic_file_map(root: Path) -> dict[str, str]:
    values = {}
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(root).as_posix()
        content = path.read_bytes()
        if path.suffix in {".pot", ".po"}:
            lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
            lines = [
                line for line in lines
                if not re.match(r'^"POT-Creation-Date: ', line)
                and not re.match(r"^# [^,]+, [0-9]{4}\s*$", line)
            ]
            content = "".join(lines).encode("utf-8")
        values[relative] = hashlib.sha256(content).hexdigest()
    return values


def load_manifest(target: Path) -> dict | None:
    path = target / MANIFEST
    if not path.exists():
        return None
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise SyncError("invalid sync manifest in " + str(target) + ": " + str(error)) from error
    if not isinstance(value, dict) or value.get("schema") != MANIFEST_SCHEMA:
        raise SyncError("unsupported sync manifest in " + str(target))
    managed = value.get("managed_files")
    if not isinstance(managed, dict) or not all(
        isinstance(path, str) and isinstance(digest, str) for path, digest in managed.items()
    ):
        raise SyncError("sync manifest has invalid managed_files in " + str(target))
    return value


def path_has_symlink_parent(target: Path, relative: Path) -> bool:
    current = target
    for part in relative.parts[:-1]:
        current = current / part
        if current.is_symlink():
            return True
    return False


def drift_paths(target: Path, old: dict | None, incoming: dict[str, str]) -> list[str]:
    old_files = old["managed_files"] if old else {}
    drift = []
    for relative, expected in old_files.items():
        path = target / relative
        if path.is_symlink() or not path.is_file() or sha256(path) != expected:
            drift.append(relative)
    for relative in incoming:
        path = target / relative
        if relative not in old_files and (path.exists() or path.is_symlink()):
            drift.append(relative)
        if path_has_symlink_parent(target, Path(relative)):
            drift.append(relative)
    return sorted(set(drift))


def atomic_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary_name = tempfile.mkstemp(prefix=path.name + ".", dir=path.parent)
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as temporary:
            json.dump(value, temporary, indent=2, sort_keys=True)
            temporary.write("\n")
        os.replace(temporary_name, path)
    except Exception:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise


def prune_empty_parents(path: Path, target: Path) -> None:
    current = path.parent
    while current != target:
        try:
            current.rmdir()
        except OSError:
            return
        current = current.parent


def build_project(project: dict, temporary: Path) -> Path:
    output = temporary / "release"
    run([
        sys.executable,
        str(RELEASE_TOOL),
        "build",
        project["alias"],
        "--output-dir",
        str(output),
    ])
    stage = output / project["uuid"]
    if not stage.is_dir():
        raise SyncError("release builder did not create " + str(stage))
    return stage


def init_repository(target: Path) -> bool:
    if (target / ".git").exists():
        return False
    result = run(["git", "init", "--initial-branch=main"], cwd=target, check=False)
    if result.returncode != 0:
        run(["git", "init"], cwd=target)
        run(["git", "branch", "-M", "main"], cwd=target)
    return True


def set_remote(target: Path, remote: str) -> None:
    current = run(["git", "remote", "get-url", "origin"], cwd=target, capture=True, check=False)
    if current.returncode == 0:
        if current.stdout.strip() != remote:
            raise SyncError(
                "origin already points to " + current.stdout.strip() + "; refusing to replace it with " + remote
            )
        return
    run(["git", "remote", "add", "origin", remote], cwd=target)


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
        metadata = json.loads((target / "files" / project["uuid"] / "metadata.json").read_text())
        message = "Initial import of " + metadata["name"]
    run(["git", "commit", "-m", message], cwd=target)
    return True


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
    target = parent / project["uuid"].split("@")[0]
    if target.is_symlink():
        raise SyncError("refusing symlinked project target: " + str(target))
    with tempfile.TemporaryDirectory(prefix="spice-project-sync-") as temporary_name:
        stage = build_project(project, Path(temporary_name))
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
        if not changed and not removed and old is not None:
            say("SYNC " + project["uuid"] + "\n  clean: generated files already match")
        else:
            say("SYNC " + project["uuid"])
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

        current_revision = git_revision()
        current_dirty = source_is_dirty(project)
        manifest = {
            "schema": MANIFEST_SCHEMA,
            "generator": "dev-tools/sync-spice-project.py",
            "source_repository": "CurbSoftware/cinnamon-monorepo",
            "source_revision": current_revision,
            "source_worktree_dirty": current_dirty,
            "source_directory": project["source"],
            "spice": {
                "alias": project["alias"],
                "kind": project["kind"],
                "uuid": project["uuid"],
            },
            "managed_files": incoming,
        }
        if old and old_files == incoming and old.get("source_worktree_dirty") == current_dirty:
            manifest["source_revision"] = old.get("source_revision", manifest["source_revision"])
        atomic_json(target / MANIFEST, manifest)

        if initialize or commit or remote_template or push:
            init_repository(target)
        if remote_template:
            try:
                remote = remote_template.format(**project, repo=project["uuid"].split("@")[0])
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


def repo_name(project: dict) -> str:
    return project["uuid"].split("@")[0]


def remote_slug(remote: str) -> str:
    text = remote.rstrip("/")
    if text.endswith(".git"):
        text = text[: -len(".git")]
    if "://" in text:
        text = text.split("://", 1)[1]
    if ":" in text:
        text = text.split(":", 1)[1]
    parts = [part for part in text.split("/") if part]
    if len(parts) < 2:
        raise SyncError("cannot derive an owner/name from remote: " + remote)
    return parts[-2] + "/" + parts[-1]


def ensure_origin(target: Path, remote: str) -> None:
    if not (target / ".git").exists():
        return
    current = run(["git", "remote", "get-url", "origin"], cwd=target, capture=True, check=False)
    if current.returncode != 0:
        run(["git", "remote", "add", "origin", remote], cwd=target)
        return
    if current.stdout.strip() != remote:
        say("REMOTE " + str(target.name) + " -> " + remote)
        run(["git", "remote", "set-url", "origin", remote], cwd=target)


def ensure_standalone_repo(project: dict, parent: Path, remote_template: str) -> None:
    target = parent / repo_name(project)
    remote = remote_template.format(**project, repo=repo_name(project))
    slug = remote_slug(remote)
    if run(["gh", "repo", "view", slug], capture=True, check=False).returncode != 0:
        say("CREATE " + slug)
        # cwd must not be a git checkout or gh may treat the monorepo as --source.
        run(["gh", "repo", "create", slug, "--public", "--clone=false"], cwd=parent)
    if not target.exists():
        say("CLONE " + slug)
        run(["gh", "repo", "clone", slug, str(target)])
        # Adoption: clear the working tree so sync treats the clone as a fresh
        # target. History survives; staged deletions drop old-layout extras.
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


def default_registry_checkout(kind: str) -> Path:
    return ROOT.parent / ("cinnamon-spices-applets" if kind == "applet" else "cinnamon-spices-desklets")


def ensure_registry_checkout(kind: str, checkout: Path) -> None:
    # Shallow clone keeps this cheap; if git ever refuses a push from it,
    # delete the checkout and re-run with a full clone instead.
    # This fork stays on the personal account even though the standalone spice
    # repos live under CurbSoftware: Linux Mint expects the pull request to come
    # from the human named in info.json, and you cannot authenticate as an org.
    fork = "RobertAlexanderH/" + default_registry_checkout(kind).name
    upstream = "linuxmint/" + default_registry_checkout(kind).name
    if not checkout.exists():
        if run(["gh", "repo", "view", fork], capture=True, check=False).returncode != 0:
            say("FORK " + fork)
            run(["gh", "repo", "fork", upstream, "--clone=false"])
            time.sleep(5)
        say("CLONE " + fork + " (shallow)")
        run(["gh", "repo", "clone", fork, str(checkout), "--", "--depth=1"])
    if run(["git", "remote", "get-url", "upstream"], cwd=checkout, capture=True, check=False).returncode != 0:
        run(["git", "remote", "add", "upstream", "https://github.com/" + upstream + ".git"], cwd=checkout)
    run(["git", "fetch", "upstream", "master", "--depth=1"], cwd=checkout)


def ensure_release(project: dict, target: Path) -> None:
    metadata_path = target / "files" / project["uuid"] / "metadata.json"
    if not metadata_path.is_file():
        return
    version = json.loads(metadata_path.read_text(encoding="utf-8")).get("version")
    if not version:
        return
    tag = "v" + version
    origin = run(["git", "remote", "get-url", "origin"], cwd=target, capture=True, check=False)
    if origin.returncode != 0:
        return
    slug = remote_slug(origin.stdout.strip())
    existing = run(["git", "ls-remote", "--tags", slug, tag], capture=True, check=False)
    if existing.stdout.strip():
        return
    with tempfile.TemporaryDirectory(prefix="spice-release-pkg-") as temporary_name:
        output = Path(temporary_name)
        output.joinpath(".spices-release-output").touch()
        run([sys.executable, str(RELEASE_TOOL), "build", project["alias"], "--output-dir", str(output)])
        asset = output / (repo_name(project) + ".zip")
        shutil.copy2(output / (project["uuid"] + ".zip"), asset)
        say("RELEASE " + slug + " " + tag)
        run([
            "gh", "release", "create", tag,
            "--repo", slug,
            "--title", slug.split("/")[1] + " " + tag,
            "--notes", "Generated from CurbSoftware/cinnamon-monorepo.",
            str(asset),
        ], cwd=target)


def ensure_clean_checkout(checkout: Path, kind: str) -> None:
    if not checkout.is_dir() or not (checkout / ".git").exists():
        raise SyncError("registry checkout is not a Git repository: " + str(checkout))
    expected = "cinnamon-spices-applets" if kind == "applet" else "cinnamon-spices-desklets"
    origin = run(["git", "remote", "get-url", "origin"], cwd=checkout, capture=True, check=False)
    if origin.returncode == 0 and expected not in origin.stdout:
        raise SyncError("registry origin does not look like " + expected + ": " + origin.stdout.strip())
    if not (checkout / "validate-spice").is_file():
        raise SyncError("registry checkout has no validate-spice script: " + str(checkout))
    status = run(["git", "status", "--porcelain"], cwd=checkout, capture=True)
    if status.stdout.strip():
        raise SyncError("registry checkout must be clean before preparing a branch")


def official_pot_check(project: dict, checkout: Path) -> None:
    makepot = checkout / "cinnamon-spices-makepot"
    if not makepot.is_file():
        raise SyncError("registry checkout has no cinnamon-spices-makepot script")
    with tempfile.TemporaryDirectory(prefix="spice-pot-check-") as temporary_name:
        temporary = Path(temporary_name)
        stage = build_project(project, temporary)
        required = ["cinnamon-xlet-makepot", "msguniq", "msgattrib", "xgettext"]
        if any(stage.rglob("*.po")):
            required.append("intltool-update")
        missing = [command for command in required if shutil.which(command) is None]
        if missing:
            raise SyncError(
                "official POT check requires missing command(s): " + ", ".join(missing)
                + "\nInstall the matching distribution packages before preparing the registry PR."
            )
        before = semantic_file_map(stage)
        run([str(makepot), project["uuid"]], cwd=stage.parent)
        after = semantic_file_map(stage)
        changed = sorted(
            path for path in set(before) | set(after)
            if before.get(path) != after.get(path)
        )
        if changed:
            raise SyncError(
                "official cinnamon-spices-makepot changes generated release content:\n"
                + "\n".join("  " + path for path in changed)
                + "\nRefresh the POT in the monorepo, then sync again."
            )


def github_owner(remote: str) -> str:
    match = re.search(r"github\.com[/:]([^/]+)/", remote)
    if not match:
        raise SyncError("cannot determine GitHub fork owner from origin: " + remote)
    return match.group(1)


def copy_registry_stage(stage: Path, destination: Path, *, replace: bool) -> None:
    if destination.is_symlink():
        raise SyncError("refusing symlinked registry destination: " + str(destination))
    if destination.exists():
        if not replace:
            raise SyncError(
                "registry already contains " + destination.name
                + "; pass --replace-existing for an update after reviewing the current entry"
            )
        shutil.rmtree(destination)
    shutil.copytree(stage, destination)


def prepare_registry(project: dict, args: argparse.Namespace) -> None:
    checkout = args.registry_checkout.expanduser().resolve()
    ensure_clean_checkout(checkout, project["kind"])
    official_pot_check(project, checkout)
    do_commit = args.commit or args.push or args.open_pr
    do_push = args.push or args.open_pr
    origin = run(["git", "remote", "get-url", "origin"], cwd=checkout, capture=True, check=False)
    if do_push:
        if origin.returncode != 0:
            raise SyncError("registry push requires an origin remote")
        if github_owner(origin.stdout.strip()).casefold() == "linuxmint":
            raise SyncError("registry push requires a fork as origin, not the linuxmint upstream repository")
    if args.open_pr:
        author = json.loads(
            (ROOT / project["source"] / "info.json").read_text(encoding="utf-8")
        )["author"]
        login = run(["gh", "api", "user", "--jq", ".login"], capture=True).stdout.strip()
        if login.casefold() != author.casefold():
            raise SyncError(
                "authenticated GitHub user " + login + " does not match info.json author " + author
            )
    base_ref = args.base_ref
    if run(["git", "rev-parse", "--verify", base_ref], cwd=checkout, capture=True, check=False).returncode != 0:
        raise SyncError("base ref does not exist in registry checkout: " + base_ref)
    branch = args.branch or (project["alias"] + "-spices-submission")
    exists = run(
        ["git", "show-ref", "--verify", "refs/heads/" + branch],
        cwd=checkout,
        capture=True,
        check=False,
    ).returncode == 0
    if exists and not args.update_branch:
        raise SyncError("registry branch already exists: " + branch)
    if exists:
        run(["git", "switch", branch], cwd=checkout)
    else:
        run(["git", "switch", "-c", branch, base_ref], cwd=checkout)
    try:
        with tempfile.TemporaryDirectory(prefix="spice-registry-") as temporary_name:
            stage = build_project(project, Path(temporary_name))
            destination = checkout / project["uuid"]
            if destination.parent != checkout:
                raise SyncError("unsafe registry destination: " + str(destination))
            copy_registry_stage(stage, destination, replace=args.replace_existing)
        run([str(checkout / "validate-spice"), project["uuid"]], cwd=checkout)
        run(["git", "add", "-A", "--", project["uuid"]], cwd=checkout)
        staged_names = run(
            ["git", "diff", "--cached", "--name-only"], cwd=checkout, capture=True
        ).stdout.splitlines()
        if not staged_names or any(Path(name).parts[0] != project["uuid"] for name in staged_names):
            raise SyncError("registry staging escaped the selected UUID")
        staged = run(["git", "diff", "--cached", "--quiet"], cwd=checkout, check=False)
        if staged.returncode == 0:
            raise SyncError("generated spice produces no registry changes")
        if staged.returncode != 1:
            raise SyncError("could not inspect staged registry changes")

        runtime_metadata = json.loads(
            (destination / "files" / project["uuid"] / "metadata.json").read_text(encoding="utf-8")
        )
        action = "update" if args.replace_existing else "initial submission"
        title = runtime_metadata["name"] + ": " + action
        if do_commit:
            run(["git", "commit", "-m", title], cwd=checkout)
        if do_push:
            run(["git", "push", "-u", "origin", branch], cwd=checkout)
        if args.open_pr:
            owner = github_owner(origin.stdout.strip())
            registry = "linuxmint/cinnamon-spices-applets" if project["kind"] == "applet" else \
                "linuxmint/cinnamon-spices-desklets"
            body = (
                "## Summary\n\n"
                "- " + action.capitalize() + " for `" + project["uuid"] + "`\n"
                "- Generated from `CurbSoftware/cinnamon-monorepo`\n\n"
                "## Validation\n\n"
                "- [x] Monorepo source and packaging checks\n"
                "- [x] Official `validate-spice`\n"
                "- [ ] Maintainer review on supported Cinnamon versions\n"
            )
            with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False) as body_file:
                body_file.write(body)
                body_path = Path(body_file.name)
            try:
                run([
                    "gh", "pr", "create",
                    "--repo", registry,
                    "--base", "master",
                    "--head", owner + ":" + branch,
                    "--title", title,
                    "--body-file", str(body_path),
                ], cwd=checkout)
            finally:
                body_path.unlink(missing_ok=True)
        say("REGISTRY " + project["uuid"])
        say("  branch: " + branch)
        say("  checkout: " + str(checkout))
    except Exception:
        say("Registry preparation stopped on branch " + branch + ". The checkout was not reset.")
        raise


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    commands = result.add_subparsers(dest="command", required=True)

    sync = commands.add_parser("sync", help="update independent generated repositories")
    sync.add_argument("extensions", nargs="*", default=["all"])
    sync.add_argument("--parent", type=Path, default=DEFAULT_PARENT)
    sync.add_argument("--force", action="store_true", help="replace drifted generated files")
    sync.add_argument("--dry-run", action="store_true")
    sync.add_argument("--no-init", action="store_true", help="do not initialize missing Git repositories")
    sync.add_argument("--commit", action="store_true", help="commit managed changes in each project")
    sync.add_argument(
        "--remote-template",
        help="set origin using fields {alias}, {uuid}, {repo}, {kind}, and {source}",
    )
    sync.add_argument("--push", action="store_true", help="push committed standalone projects to origin/main")

    publish = commands.add_parser(
        "publish",
        help="clone or create each standalone repo, then sync, commit, and push to origin main",
    )
    publish.add_argument("extensions", nargs="*", default=["all"])
    publish.add_argument("--parent", type=Path, default=DEFAULT_PARENT)
    publish.add_argument(
        "--remote-template",
        default=DEFAULT_REMOTE_TEMPLATE,
        help="origin for standalone repos using fields {alias}, {uuid}, {repo}, {kind}, and {source}",
    )
    publish.add_argument("--dry-run", action="store_true")
    publish.add_argument(
        "--no-release",
        dest="release",
        action="store_false",
        help="do not create a GitHub release package for a new version",
    )

    submit = commands.add_parser(
        "submit",
        help="ensure the registry fork checkout, then test, prepare, push, and open the PR for one spice",
    )
    submit.add_argument("extension")
    submit.add_argument("--parent", type=Path, default=DEFAULT_PARENT)
    submit.add_argument("--base-ref", default="upstream/master")
    submit.add_argument("--branch")
    submit.add_argument("--update-branch", action="store_true")
    submit.add_argument("--replace-existing", action="store_true")
    submit.add_argument("--force", action="store_true", help="replace drifted standalone files")
    submit.add_argument("--live", action="store_true", help="include the live Cinnamon test gate")

    registry = commands.add_parser("prepare-pr", help="prepare one clean Cinnamon Spices registry branch")
    registry.add_argument("extension")
    registry.add_argument("--parent", type=Path, default=DEFAULT_PARENT)
    registry.add_argument("--registry-checkout", type=Path, required=True)
    registry.add_argument("--base-ref", default="master")
    registry.add_argument("--branch")
    registry.add_argument(
        "--update-branch",
        action="store_true",
        help="apply the stage onto an existing branch instead of refusing (updates an open PR)",
    )
    registry.add_argument("--replace-existing", action="store_true")
    registry.add_argument("--force", action="store_true", help="replace drifted standalone files")
    registry.add_argument("--live", action="store_true", help="include the live Cinnamon test gate")
    registry.add_argument("--commit", action="store_true")
    registry.add_argument("--push", action="store_true")
    registry.add_argument("--open-pr", action="store_true")
    return result


def main() -> int:
    args = parser().parse_args()
    try:
        if args.command == "sync":
            if args.push and not args.commit:
                raise SyncError("--push requires --commit")
            parent = safe_parent(args.parent)
            projects = select_projects(args.extensions, allow_many=True)
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
            projects = select_projects(args.extensions, allow_many=True)
            if not args.dry_run:
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
                    push=True,
                )
                if not args.dry_run and args.release:
                    ensure_release(project, target)
            return 0
        project = select_projects([args.extension], allow_many=False)[0]
        if args.command == "submit":
            checkout = default_registry_checkout(project["kind"])
            ensure_registry_checkout(project["kind"], checkout)
            args.registry_checkout = checkout
            args.commit = True
            args.push = True
            args.open_pr = True
        test_command = [sys.executable, str(RELEASE_TOOL), "test", project["alias"]]
        if args.live:
            test_command.append("--live")
        run(test_command)
        parent = safe_parent(args.parent)
        sync_project(
            project,
            parent=parent,
            force=args.force,
            dry_run=False,
            initialize=True,
            commit=True,
            remote_template=None,
            push=False,
        )
        prepare_registry(project, args)
        return 0
    except SyncError as error:
        print("ERROR: " + str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
