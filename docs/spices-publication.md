# Cinnamon Spices release flow

This monorepo stays the development source. Release artifacts are generated
from it. Each candidate is submitted in its own pull request to either
`linuxmint/cinnamon-spices-desklets` or `linuxmint/cinnamon-spices-applets`.

The generated standalone repositories live together in the sibling directory
`~/projects/cinnamon/`. Each directory there (named like the GitHub
repo, for example `cinnamon-color-timer-clock-desklet`) is a separate Git
repository mirroring its repo under
`github.com/CurbSoftware`. Never develop in those generated copies. Make the
change here, test it here, then sync it out.

## Current submission set

| Alias | Registry | Submission |
| --- | --- | --- |
| `world-clock` | desklets | independent new spice |
| `color-clock` | desklets | independent new spice |
| `workspace-grid` | desklets | independent new spice |
| `workspace-names` | applets | independent new spice, derived from `workspace-name@willurd` |
| `panel-profiles` | applets | independent new spice |
| `command-launcher` | applets | blocked as a new spice |

Command Launcher is nearly identical to the existing
`commandLauncher@scollins` registry entry. A duplicate under a new UUID is not
a sound submission. Any useful change should be prepared as a focused pull
request against that existing UUID, with its current author involved.

In Panel Workspace Name keeps `original_author: willurd` in `info.json`. Its pull
request must explain that it is a substantial new implementation derived from
the existing Workspace Name applet. Confirm the upstream licensing and
maintainer handoff with the Spices reviewers before asking them to merge it.

## Tooling

List the projects and any policy block:

```bash
python3 dev-tools/spices-release.py list
```

Run source-layout checks for every project independently:

```bash
python3 dev-tools/spices-release.py check all
```

Run headless tests for all six projects:

```bash
python3 dev-tools/spices-release.py test all
```

Add live Cinnamon tests when the xlets are installed and enabled:

```bash
python3 dev-tools/spices-release.py test all --live
```

## Independent project repositories

The one-shot path clones or creates each standalone GitHub repo (public,
under `CurbSoftware`), adopts an existing clone by resetting its working tree
to the generated layout, then syncs, commits, and pushes to `origin main`:

```bash
./dev-tools/publish-spices.sh
```

Name spices to subset, or preview with `--dry-run`:

```bash
./dev-tools/publish-spices.sh workspace-grid color-clock --dry-run
```

The default layout is:

```text
~/projects/cinnamon/
  cinnamon-world-clock-desklet/.git/
  cinnamon-color-timer-clock-desklet/.git/
  cinnamon-workspace-grid-desklet/.git/
  cinnamon-workspace-names-applet/.git/
  cinnamon-panel-profiles-applet/.git/
```

Each repository contains one official Spices-shaped project plus
`.monorepo-sync.json`. That manifest records the managed file hashes and source
revision. The sync refuses to overwrite a manual edit in a generated project.
Move that edit back into this monorepo and rerun the sync. `--force` is the
explicit escape hatch after the drift has been reviewed.

For step-by-step control without any network action, use the underlying sync
command directly:

```bash
python3 dev-tools/sync-spice-project.py sync all --commit
python3 dev-tools/sync-spice-project.py sync workspace-grid --commit
```

The remote template defaults to `git@github.com:CurbSoftware/{repo}.git` in
`publish`. The available template fields are `{alias}`, `{uuid}`, `{repo}`,
`{kind}`, and `{source}`.

The transition is reversible. The monorepo remains complete and runnable. To
roll back the split, stop syncing and move the sibling parent aside. No source
files or history need to be recovered from the generated repositories.

Build one submission. This runs its tests first and stops on any failed gate:

```bash
./dev-tools/release-spice.sh workspace-grid
```

The result is an independent Spices tree and deterministic ZIP under
`dist/spices/`:

```text
dist/spices/<uuid>/
dist/spices/<uuid>.zip
```

Build all releasable candidates by naming them explicitly. The blocked Command
Launcher is deliberately not hidden by an `all` release:

```bash
for spice in world-clock color-clock workspace-grid workspace-names panel-profiles; do
    ./dev-tools/release-spice.sh "$spice"
done
```

## Official validator

Use fresh forks or clean checkouts of both official repositories. The release
tool stages into a temporary directory, so it does not modify either checkout.

```bash
./dev-tools/release-spice.sh panel-profiles \
    --applets-checkout /path/to/cinnamon-spices-applets

./dev-tools/release-spice.sh workspace-grid \
    --desklets-checkout /path/to/cinnamon-spices-desklets
```

Without a checkout, the local gates still run and the artifact is built, but
the tool prints a warning that the official `validate-spice` was not run.

## What the builder ships

Every generated submission has the official layout:

```text
<uuid>/
  info.json
  screenshot.png
  README.md
  LICENSE (when the project declares one)
  files/
    <uuid>/
      metadata.json
      icon.png
      applet.js or desklet.js
      runtime helpers, settings, styles, and translations
```

Development files such as `DEVELOPMENT.md`, test suites, fixtures, research,
and internal docs stay out of the runtime ZIP. The builder also rejects
compiled translations, temporary editor files, mismatched UUIDs, forbidden
metadata keys, non-square icons, missing screenshots, and malformed JSON.

## Pull request sequence

The registry command performs one narrow flow: sync and commit the standalone
project, run its headless tests, check the POT with the official generator,
create one branch from the requested base, copy one UUID, run the official
validator, and stage only that UUID. Volatile POT dates are ignored during the
comparison. A real message or source-reference difference stops before the
registry branch is created. The command does not commit, push, or open a pull
request unless asked.

The official POT flow needs `cinnamon-xlet-makepot` and GNU gettext. A spice
that already ships translated `.po` files also needs `intltool-update`. On
Linux Mint, install the `intltool` package before preparing In Panel Workspace Name.

```bash
python3 dev-tools/sync-spice-project.py prepare-pr workspace-grid \
  --registry-checkout /path/to/cinnamon-spices-desklets \
  --base-ref upstream/master
```

The one-shot path is the wrapper. It forks the registry repository when
needed, clones it shallowly on demand into the sibling
`cinnamon-spices-desklets` (or `cinnamon-spices-applets`) directory, then runs
the full prepare sequence including commit, push, and PR creation:

```bash
./dev-tools/submit-spice.sh workspace-grid
```

Run it only when the spice is fully ready; it opens a real pull request.
Pass `--replace-existing` to update an entry that is already in the registry.

Review the staged registry diff:

```bash
cd /path/to/cinnamon-spices-desklets
./validate-spice cinnamon-workspace-grid-desklet@curbsoftware
git diff --cached
```

For a one-shot release after the same checks have already been reviewed, start
from a clean registry checkout and ask the tool to commit, push, and open the
pull request:

```bash
python3 dev-tools/sync-spice-project.py prepare-pr workspace-grid \
  --registry-checkout /path/to/cinnamon-spices-desklets \
  --base-ref upstream/master \
  --open-pr
```

`--open-pr` explicitly enables the registry commit and push. `--push` enables
the commit and push without opening a pull request. `--commit` creates only the
local registry commit. Pass `--live` when the current Cinnamon session is part
of the final release gate. Existing registry entries require the explicit
`--replace-existing` flag.

For each spice, also complete these checks:

1. Run `release-spice.sh` with the matching fresh official checkout.
2. Confirm the automated `cinnamon-spices-makepot` comparison passes.
3. Run `validate-spice <uuid>` again inside the registry checkout.
4. Confirm the branch contains only that UUID directory.
5. Review the complete diff and test the staged copy with the official
   `test-spice` helper.
6. Open one pull request for that one spice.

The GitHub account opening each new-spice pull request must match the
`author` value in `info.json`. The current candidate files use
`RobertAlexanderH`.

## Final human checks

- Read the current Spices README and contributing guide before every batch.
- Verify screenshots show the actual Cinnamon xlet, not a mockup.
- Test on the oldest Cinnamon version claimed by the metadata and on the
  current supported release.
- Check a light and dark Cinnamon theme.
- Check horizontal and vertical panels for applets.
- Check one and multiple monitors for workspace and panel tools.
- Confirm every signal, timeout, dialog, tooltip, file monitor, and menu is
  released during xlet removal.
- Review generated artifacts for credentials, local paths, user profile data,
  and compiled files.
- Do not combine multiple UUIDs in one pull request.

## Authentication

Publishing requires a working GitHub credential for the fork. Verify it before
starting the registry branches:

```bash
gh auth status
git ls-remote origin HEAD
```

Local validation and artifact generation do not require GitHub authentication.
