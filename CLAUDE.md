# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---
Do NOT use em-dashes nor emojis unless explicitly instructed to do so, ever.  Do not use "\u2014" symbol anywhere, change and code or text copy found during tasks to remove them.
Write all user facing text in a human-friendly way. Humanize writing by:
- using natural working voice: direct, clear, slightly informal. 
- cutting any sentence that doesn't add new information. 
- using short punchy sentences, rhetorical fragments, and analogies.
- avoiding overly promotional words like 'game-changing' or 'unlock.'
- including personal anecdotes where appropriate.
---

## Project Overview
This is a Cinnamon extensions monorepo containing workspace management and clock desklets/applets for the Cinnamon desktop environment.

## Architecture

### Active Extensions

#### Workspace Grid Desklet (`cinnamon-workspace-grid-desklet@curbsoftware/`)
- Displays a clickable grid of workspaces with their names
- Highlights the active workspace
- Supports auto-sizing or fixed row/column layout
- Add (trailing `+` tile), remove and rename workspaces via a per-tile right-click menu

#### Workspace Name Applet (`cinnamon-workspace-name-applet@curbsoftware/`)
- Panel applet showing the current workspace name (name / number / both)
- Menu lists all workspaces and can add, rename or remove the current one
- Demonstrates workspace event handling and name retrieval patterns

Both xlets share two modules, **duplicated verbatim** in each directory because
Cinnamon has no cross-xlet import path:
- `workspaceActions.js` — all add/remove/rename logic plus pure grid maths
- `renameDialog.js` — `ModalDialog` subclass wrapping an `St.Entry`

`dev-tools/test-workspace-actions.js` fails if the two copies drift apart.

#### World Clock Desklet (`cinnamon-world-clock-desklet@curbsoftware/`)
- Desktop clock desklet with timezone support

#### Color Timer Clock Desklet (`cinnamon-color-timer-clock-desklet@curbsoftware/`)
- Three cards (clock, countdown timer, chronometer) whose background colors
  follow per-card (time, color) stop schedules with smooth or stepped ramps
- Pure color engine + fit helpers in `cardActions.js` (fit maths copied
  verbatim from the world clock's `clockActions.js`); timer/chrono state
  persisted in hidden `generic` keys and survives reloads
- Timer/chrono controls are on-card St.Buttons, not menus

#### Panel Profiles Applet (`cinnamon-panel-profiles-applet@curbsoftware/`)
- Saves the full panel environment (panel keys, applet placement and each
  applet's settings) as named profiles and restores them transactionally,
  with rollback and startup recovery that waits for the expected displays
- Composition root in `applet.js`, dialogs in `dialogs.js`, pure headless
  modules in `lib/` (capture, storage, apply engine, topology, fingerprint)
- State and profiles live under `~/.config/cinnamon-panel-profiles/`

### Reference Materials (`cinnamon-docs/`)
- **cinnamon-developer-docs/**: Official Cinnamon developer documentation
  - **write-applet.md**: Basic applet structure and API usage patterns
  - **xlet-settings.md**: Settings system implementation with JSON schema and binding
- **cinnamon-spices-applets/**: Reference implementations from Cinnamon Spices repository

### Development Tools (`dev-tools/`)
Scripts and documentation for extension development.

## Development Commands

### Install Extensions
```bash
./dev-tools/install-extensions.sh                 # install all (copy; replaces prior)
./dev-tools/install-extensions.sh -m symlink      # dev symlinks (edits reflect live)
./dev-tools/install-extensions.sh --type desklets # desklets only
./dev-tools/install-extensions.sh -n '*clock*'    # match by UUID/dir glob
./dev-tools/install-extensions.sh --dry-run       # preview
./dev-tools/install-extensions.sh --uninstall     # remove installed extensions
./dev-tools/install-extensions.sh --help          # full reference
```
The script auto-discovers extensions and installs them to
`~/.local/share/cinnamon/{desklets,applets}/<uuid>/` (UUID-named dirs).

### Reload Extensions (No Restart) - Recommended
1. Press `Win+L` to open Looking Glass
2. Go to "Extensions" tab
3. Right-click extension → "Reload Code"

Scriptable equivalent (no GUI needed):
```bash
gdbus call --session --dest org.Cinnamon --object-path /org/Cinnamon \
  --method org.Cinnamon.ReloadXlet '<uuid>' DESKLET   # or APPLET
```

### Testing
```bash
gjs dev-tools/test-workspace-actions.js    # headless unit tests, no Cinnamon needed
gjs dev-tools/test-clock-actions.js        # world-clock helpers (headless)
gjs dev-tools/test-card-actions.js         # color-timer color engine (headless)
gjs dev-tools/test-pp-capture.js           # panel-profiles capture core (headless)
XDG_CONFIG_HOME=$(mktemp -d) gjs dev-tools/test-pp-storage.js  # panel-profiles storage (headless)
XDG_CONFIG_HOME=$(mktemp -d) gjs dev-tools/test-pp-apply.js    # panel-profiles apply engine (headless)
python3 dev-tools/live-test-desklet.py     # live desklet edge-case matrix
python3 dev-tools/live-test-applet.py      # live applet test (restores enabled-applets)
python3 dev-tools/live-test-color-desklet.py # live color-timer clock matrix (restores settings)
python3 dev-tools/live-test-panel-profiles.py # live panel-profiles acceptance matrix (restores settings)
```
The live drivers script the running desktop through `org.Cinnamon.Eval` (see
`dev-tools/cinnamon_eval.py`). They only remove workspaces they created and
assert the original workspace count, names, active index and panel layout are
restored. `St` cannot be loaded outside the Cinnamon process, so widget
behaviour is only testable live.

### VM Testing (Crash Isolation)
Credentials `cinnamon/cinnamon`. The domain name is host-specific — run
`virsh list --all` first and override if needed:
```bash
export CINNAMON_VM=linuxmint-user  # default is 'cinnamon-cinnanom'
./dev-tools/vm-config.sh bridge   # One-time: switch to bridged network
./dev-tools/vm-config.sh start    # Start VM (shows IP)
./dev-tools/vm-config.sh ssh      # SSH into VM, then run install-extensions.sh there
```

### Debug Logging
```javascript
global.log("Debug message");      // Info logging
global.logError("Error message"); // Error logging
```

### View Logs
```bash
tail -f ~/.xsession-errors | grep -i cinnamon
```

### Extension Settings and Screenshots
```bash
cinnamon-settings desklets '<uuid>'        # open settings directly (or applets)
./dev-tools/screenshot.sh out.png [X Y W H] # capture the live X11 session (visual QA)
```

### Extension Install Locations
- Desklets: `~/.local/share/cinnamon/desklets/`
- Applets: `~/.local/share/cinnamon/applets/`

## Key APIs and Patterns
- **Imports**: Use `imports.ui.desklet`, `imports.ui.applet`, `imports.gi.St`, `imports.ui.settings`
- **Xlet-local modules**: `imports.ui.deskletManager.desklets[uuid].<file>` /
  `imports.ui.appletManager.applets[uuid].<file>` (resolve lazily, inside `_init`)
- **Inheritance**: Extend `Desklet.Desklet.prototype` or `Applet.Applet.prototype`
- **Settings**: Use `Settings.DeskletSettings` or `Settings.AppletSettings` with JSON schema binding. Schema keys are hyphenated, bound properties camelCase (`"layout-mode"` → `this.layoutMode`). In-process `settings.setValue()` does NOT fire bind callbacks (compensate manually); the bound values themselves do refresh.
- **Identity**: `metadata.json` `uuid` MUST equal the directory name or Cinnamon refuses to load the xlet
- **Signal cleanup**: disconnect everything in `on_desklet_removed`/`on_applet_removed_from_panel` — `SignalManager.SignalManager` (`disconnectAllSignals()`) or tracked ids. `Mainloop` timeout callbacks must return `false` explicitly to stop repeating (an omitted return keeps the source armed)
- **Workspace Manager**: Access via `global.workspace_manager`
- **Event Handling**: Connect to 'switch-workspace', 'workspace-added', 'workspace-removed'
- **Workspace add/remove/rename**: Always go through `Main._addWorkspace()`,
  `Main._removeWorkspace(ws)`, `Main.setWorkspaceName(i, name)`. They already
  handle the names array and refuse to remove the last workspace.

## Common Issues
- Extension crashes may be due to improper error handling or API version compatibility
- **Workspace names live in `org.cinnamon.desktop.wm.preferences` key `workspace-names`.**
  `org.cinnamon workspace-name-overrides` is `['DEPRECATED']` and never changes.
  GSettings `connect('changed::<nonexistent-key>')` does not throw — the handler
  just silently never fires, so watching the wrong key looks like nothing is broken.
- `num-workspaces` is capped at 36 (`gsettings range org.cinnamon.desktop.wm.preferences num-workspaces`)
- **Never `Mainloop.idle_add` for user-visible actions.** Idle sits below
  Clutter's redraw priority and gets starved while menus/dialogs animate. Use
  `Mainloop.timeout_add(0, ...)`.
- `Desklet.destroy()` emits `destroy` immediately but defers
  `on_desklet_removed()` by a 500 ms fade. Hook both, with idempotent cleanup.
- Menu items must not act synchronously — `PopupMenuBase` closes the menu in its
  own `activate` handler, which runs *after* yours. Defer the real work.
- Popup menus parented to `Main.uiGroup` are not destroyed by
  `destroy_all_children()` on your own container. Track and destroy them.
- CSS styling must inherit from Cinnamon theme system
- `ReloadXlet` re-runs the xlet's main script (desklet.js/applet.js) but does
  NOT re-import helper modules (`imports.ui.deskletManager.desklets[uuid].<file>`
  stays cached) and does not re-read `stylesheet.css`. Editing a helper module
  or stylesheet requires restarting Cinnamon (`cinnamon --replace`).
- Live test drivers restore settings via `atexit` — kill them with anything
  but SIGTERM (a plain `timeout` skips the restore and contaminates the next
  run's saved "originals"; the drivers now route SIGTERM through sys.exit).

## Spices Publication

The full submission manual is `docs/spices-publication.md` — follow it for
new submissions. Summary of the flow:

- This monorepo (flat layout) is the dev home; each shipped xlet ALSO has a
  standalone repo under the CurbSoftware org holding the Spices layout
  (`info.json`, `screenshot.png`, `README.md`, `LICENSE` at root;
  `files/<uuid>/…` with everything Cinnamon installs).
- PRs go to `linuxmint/cinnamon-spices-desklets` from fork
  `RobertAlexanderH/cinnamon-spices-desklets`, branch `<name>-initial` off
  `upstream/master`, one UUID per PR. Run `./validate-spice <uuid>` and
  `./cinnamon-spices-makepot <uuid>` in a clone of the spices repo before
  submitting; sync any pot changes back here.
- Post-merge: bump `metadata.json` `version` on every functional change;
  NEVER edit `last-edited` (the website pipeline owns it); watch for issues
  titled `spice name: description`.

<!-- imported-from: codex:project:instructions -->
# AGENTS.md

This file provides guidance to agents when working with code in this repository.

Do NOT use em-dashes ever.  Do not use "—" symbol anywhere, change and code or text copy found during tasks to remove them.  Write in a humanistic way.


## Critical Commands

- Install extensions (desklets + applets): `./dev-tools/install-extensions.sh`
  - Dev symlinks: `./dev-tools/install-extensions.sh -m symlink`
  - Filter: `--type {desklets|applets|all}`, `-n '<glob>'` (UUID/dir)
  - Backup prior install: `--backup`; preview: `--dry-run`; restart: `--reload`
  - Remove: `./dev-tools/install-extensions.sh --uninstall`
  - Targets: `~/.local/share/cinnamon/{desklets,applets}/<uuid>/` (UUID-named)
- Reload Cinnamon: `cinnamon --replace &`
- View logs: `tail -f ~/.xsession-errors`
- Open settings: `cinnamon-settings desklets extension-uuid`

## Memory Leak Prevention

- ALL signals MUST be disconnected in cleanup (`on_desklet_removed`/`on_applet_removed_from_panel`)
- ALL timeouts MUST be removed via `Mainloop.source_remove()` before re-adding
- Use `SignalManager.SignalManager` for easier signal cleanup: `this._signalManager.disconnectAllSignals()`

## Critical Patterns

- Prototype inheritance: `__proto__: Desklet.Desklet.prototype` then `_init()` calls parent
- Settings binding: `this.settings.bind("key", "property", callback)` - key is hyphenated in schema
- Debounced updates: Check `if (this._timeout) Mainloop.source_remove(this._timeout)` before `Mainloop.timeout_add()`
- Workspace names: read/write via `Main.getWorkspaceName(i)` / `Main.setWorkspaceName(i, name)`. The backing store is `org.cinnamon.desktop.wm.preferences` key `workspace-names`
- Workspace add/remove: `Main._addWorkspace()` / `Main._removeWorkspace(ws)` — they maintain the names array and refuse to remove the last workspace
- Active workspace highlight: Use `add_style_pseudo_class('outlined')` not custom CSS classes
- Main file must be `desklet.js` or `applet.js` (not `index.js` or other names)

## Gotchas

- There is no `workspace-name-changed` signal. Watch `Gio.Settings({schema_id:'org.cinnamon.desktop.wm.preferences'})` for `changed::workspace-names`
- `org.cinnamon workspace-name-overrides` is `['DEPRECATED']` and never changes. GSettings `connect('changed::<nonexistent-key>')` does NOT throw — the handler just never fires, so a wrong key looks like working code
- Never `Mainloop.idle_add` for user-visible actions: idle sits below Clutter's redraw priority and starves while menus/dialogs animate. Use `Mainloop.timeout_add(0, ...)`
- `Desklet.destroy()` emits `destroy` immediately but defers `on_desklet_removed()` by a 500 ms fade — hook both, with idempotent cleanup
- Popup menus parented to `Main.uiGroup` survive `destroy_all_children()` on your own container; track and destroy them explicitly
- Settings schema keys use hyphens (`layout-mode`) but bound properties use camelCase (`layoutMode`)
- Extension directory format: `UUID@domain` (e.g., `cinnamon-workspace-grid-desklet@curbsoftware`). `metadata.json` `uuid` MUST equal the directory name or Cinnamon refuses to load it
- Mainloop timeout callback MUST return `false` to prevent repeat execution
- `global.workspace_manager.get_active_workspace_index()` returns 0-based index
