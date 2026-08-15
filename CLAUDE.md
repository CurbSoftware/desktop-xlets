# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

#### World Clock Desklet (`cinnamon-world-clock@curbsoftware/`)
- Desktop clock desklet with timezone support

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
python3 dev-tools/live-test-desklet.py     # live desklet edge-case matrix
python3 dev-tools/live-test-applet.py      # live applet test (restores enabled-applets)
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

### Extension Install Locations
- Desklets: `~/.local/share/cinnamon/desklets/`
- Applets: `~/.local/share/cinnamon/applets/`

## Key APIs and Patterns
- **Imports**: Use `imports.ui.desklet`, `imports.ui.applet`, `imports.gi.St`, `imports.ui.settings`
- **Xlet-local modules**: `imports.ui.deskletManager.desklets[uuid].<file>` /
  `imports.ui.appletManager.applets[uuid].<file>` (resolve lazily, inside `_init`)
- **Inheritance**: Extend `Desklet.Desklet.prototype` or `Applet.Applet.prototype`
- **Settings**: Use `Settings.DeskletSettings` or `Settings.AppletSettings` with JSON schema binding
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
