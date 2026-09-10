# How this repo works

One repo holds every CurbSoftware Cinnamon extension, their GNOME Shell and
KDE Plasma ports, and all the development tooling. You develop here, test
here, and push generated copies out to per-spice repositories when a release
is ready. Nothing ships straight from a lone folder on your desktop. One
home, one history.

Remote: [CurbSoftware/cinnamon-monorepo](https://github.com/CurbSoftware/cinnamon-monorepo).

## Layout at a glance

```text
cinnamon-monorepo/
  cinnamon-world-clock-desklet@curbsoftware/        desklet, ship
  cinnamon-color-timer-clock-desklet@curbsoftware/  desklet, ship
  cinnamon-workspace-grid-desklet@curbsoftware/     desklet, ship
  cinnamon-workspace-names-applet@curbsoftware/      applet, ship
  cinnamon-panel-profiles-applet@curbsoftware/      applet, ship
  command-launcher@curbsoftware/                    applet, blocked from Spices
  gnome-<family>@curbsoftware/                      GNOME Shell ports (six trees)
  kde-<family>/                                     Plasma plasmoid ports (six trees)
  dev-tools/                                        install, test, build, publish, bundle
  docs/                                             guides and release manuals
  cinnamon-docs/                                    official Cinnamon docs and Spices examples (reference only)
  CLAUDE.md / AGENTS.md / README.md                 orientation
```

Each xlet directory is a flat Cinnamon extension: `metadata.json`, the main
`desklet.js` or `applet.js`, `settings-schema.json`, `stylesheet.css`,
`icon.png`, plus packaging files for Spices (`info.json`, `screenshot.png`,
`README.md`, `LICENSE`) and local extras that never ship (`DEVELOPMENT.md`,
`tests/`, research notes).

The directory name must equal the `uuid` inside `metadata.json` or Cinnamon
refuses to load the xlet. No exceptions.

## The ports (GNOME Shell and KDE Plasma)

Every family also ships as a GNOME extension (`gnome-<family>@curbsoftware/`)
and a Plasma plasmoid (`kde-<family>/`). Ports are separate codebases per
desktop, by decision: same xlet, three runtimes, no shared-source build
step and no cross-tree imports. Pure logic is copied into each tree and
guarded by parallel headless tests, extending the copy-and-diverge
convention the Cinnamon side already uses.

- GNOME ports: Shell 45+ ESM, JSON settings in `~/.config/`
  (no gschema, deliberately), desktop widgets on the background group
  with Alt+drag movement, editing through libadwaita preferences
  windows. Panel Profiles becomes Desktop Profiles (extensions and
  monitor layouts, a different domain on GNOME).
- KDE ports: Plasma 6 QML. One plasmoid serves panel and desktop.
  Timezone maths runs on a generated table (window 2020 to 2050,
  rebuilt by `dev-tools/gen-tz-table.py`). Panel Profiles becomes
  Plasma Layouts, with apply capability-probed against the executable
  dataengine.

The ports build with `python3 dev-tools/ports-release.py` (list, check,
test, build, bundle) into `dist/ports/`, including the
`curb-desktop-widgets` bundle AppImage that installs the matching
variants on Cinnamon, GNOME or KDE. The Cinnamon Spices pipeline is
untouched by all of this. Full reference:
[`docs/ports-guide.md`](ports-guide.md).

## The extensions

### World Clock (desklet)

Desktop clock with timezone support. Fit helpers in `clockActions.js` decide
how the time, date, and timezone labels scale to the configured width. The
color timer clock borrows its fit maths verbatim.

### Color Timer Clock (desklet)

Three cards: clock, countdown timer, chronometer. Each card's background
color follows a per-card schedule of (time, color) stops with smooth or
stepped ramps. The pure color engine and fit helpers live in `cardActions.js`.
Timer and chronometer state persists in hidden `generic` settings keys and
survives reloads. Controls are on-card buttons, not menus. All three cards
share one set of font size caps (`time-size`, `date-size`, `label-size` in
`settings-schema.json`); the code then shrinks from those caps so text stays
inside the card.

### Workspace Grid (desklet)

A clickable grid of workspaces with names, active-workspace highlight, auto
or fixed rows and columns, and add, remove, and rename from a per-tile menu.

### In Panel Workspace Name (applet)

Panel applet showing the current workspace name (name, number, or both), with
a menu that lists workspaces and can add, rename, or remove the current one.
Derived from `workspace-name@willurd`; `info.json` keeps `original_author`
and the Spices pull request must say so.

### Panel Profiles (applet)

Saves the panel world and the desklet world as separate named profile kinds,
restores them transactionally with rollback, and only ever applies on an
explicit click. Composition root in `applet.js`, save dialog in `dialogs.js`,
pure headless modules in `lib/` (capture, storage, apply engine, topology,
fingerprint), and two custom settings widgets in Python. State and profiles
live under `~/.config/cinnamon-panel-profiles/`.

### Command Launcher (applet)

Works, but is nearly identical to the existing `commandLauncher@scollins`
Spices entry, so it is blocked from new-spice submission. Improvements belong
in focused pull requests against that upstream UUID. The release tooling
excludes it from `all` automatically.

### Shared modules

Cinnamon has no cross-xlet import path, so `workspaceActions.js` and
`renameDialog.js` are duplicated verbatim in both workspace xlets.
`dev-tools/test-workspace-actions.js` fails if the copies drift. Keep that
contract: edit one copy, copy it verbatim to the other, run the test.

## dev-tools/

Install and run:

- `install-extensions.sh` - install all xlets to `~/.local/share/cinnamon/`.
  `-m symlink` gives live-edit links, `-n '*clock*'` filters, `--uninstall`
  removes, `--dry-run` previews.
- `screenshot.sh` - capture the live X11 session for visual checks.
- `vm-config.sh` - start and SSH into the test VM for crash isolation.

Headless tests (no Cinnamon needed, plain `gjs` or `node`):

- `test-workspace-actions.js`, `test-clock-actions.js`, `test-card-actions.js`
- `test-pp-capture.js`, `test-pp-storage.js`, `test-pp-apply.js` (the storage
  and apply ones want a throwaway `XDG_CONFIG_HOME`)

Live drivers (script the running desktop through `org.Cinnamon.Eval` via
`cinnamon_eval.py`; they restore what they touch):

- `live-test-desklet.py`, `live-test-applet.py`,
  `live-test-color-desklet.py`, `live-test-panel-profiles.py`,
  `live-test-xlet-smoke.py`

Release pipeline:

- `spices-release.py` - validates source layout, runs gates, builds the
  official Spices tree and a deterministic ZIP under `dist/spices/`.
  `release-spice.sh <alias>` is the thin wrapper.
- `sync-spice-project.py` - syncs generated trees into standalone repos,
  prepares registry branches. Three user-facing commands:
  - `publish` (wrapper `publish-spices.sh`): clone or create each standalone
    repo, sync, commit, push to `origin main`.
  - `prepare-pr`: the fine-grained registry sequence with explicit flags.
  - `submit` (wrapper `submit-spice.sh <alias>`): fork and shallow-clone the
    registry on demand, run every gate, push the branch, open the PR. Run it
    only when the spice is ready.

Details for every script: [`dev-tools/README.md`](../dev-tools/README.md).

## Testing model

Headless tests cover the pure logic: fit maths, color ramps, grid maths,
storage, the apply engine. They run anywhere `gjs` does.

Everything touching `St` widgets, real menus, or the window manager needs a
live Cinnamon session. That is what the live drivers are for. They create
what they need, assert outcomes, and restore the original workspace count,
names, active index, and settings on exit. Kill them with anything but
SIGTERM and the restore is skipped, contaminating the next run.

The inner loop while developing: edit, `install-extensions.sh -m symlink`
once, then reload the single xlet through Looking Glass (`Win+L`, Extensions
tab, Reload Code) or `org.Cinnamon.ReloadXlet`. Note that reload re-runs only
the main script; helper modules and stylesheets need a Cinnamon restart.

## Publishing, in one paragraph

The monorepo is the only source of truth. `publish-spices.sh` writes each
shippable xlet into its own repo under `~/projects/cinnamon/`
(named like its GitHub repo), commits, and pushes to `CurbSoftware/<name>`
on `main`. When a spice is ready for the public registry, `submit-spice.sh
<alias>` prepares a one-UUID branch against `linuxmint/cinnamon-spices-*`,
runs the official validator, pushes to your fork, and opens the pull request.
Generated repos carry a `.monorepo-sync.json` manifest; if you hand-edit one,
sync refuses to overwrite until you move the edit back here or pass `--force`.

Full manual, including validator requirements and human release checks:
[`spices-publication.md`](spices-publication.md).

## Conventions worth knowing

- Version bumps: bump `metadata.json` `version` on every functional change.
  Never edit `last-edited`; the Spices website pipeline owns it.
- Settings keys are hyphenated in the schema, camelCase when bound.
- Workspace names live in the `workspace-names` key of
  `org.cinnamon.desktop.wm.preferences`. Always go through
  `Main._addWorkspace()`, `Main._removeWorkspace()`, and
  `Main.setWorkspaceName()`.
- Clean up signals and timeouts in `on_desklet_removed` /
  `on_applet_removed_from_panel`. `SignalManager` makes this one call.
- The full gotcha list (idle priority, deferred menu actions, popup menu
  parenting, GSettings silent no-ops) lives in `CLAUDE.md` and `AGENTS.md`.
  Read both before touching widget code.
