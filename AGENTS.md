# AGENTS.md

This file provides guidance to agents when working with code in this repository.

Do NOT use em-dashes ever. Do not use the "—" symbol anywhere. Change code or text found in tasks to remove it. Write in a humanistic way.


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
- GNOME and KDE ports: `python3 dev-tools/ports-release.py list|check|test|build|bundle`
- Publish GNOME/KDE/AppImage repos: `./dev-tools/publish-ports.sh` (parent `~/projects/cinnamon/ports/`)

## Memory Leak Prevention

- ALL signals MUST be disconnected in cleanup (`on_desklet_removed`/`on_applet_removed_from_panel`)
- ALL timeouts MUST be removed via `Mainloop.source_remove()` before re-adding
- Use `SignalManager.SignalManager` for easier signal cleanup: `this._signalManager.disconnectAllSignals()`

## Critical Patterns

- Prototype inheritance: `__proto__: Desklet.Desklet.prototype` then `_init()` calls parent
- Settings binding: `this.settings.bind("key", "property", callback)` - key is hyphenated in schema
- Debounced updates: Check `if (this._timeout) Mainloop.source_remove(this._timeout)` before `Mainloop.timeout_add()`
- Workspace names: read/write via `Main.getWorkspaceName(i)` / `Main.setWorkspaceName(i, name)`. The backing store is `org.cinnamon.desktop.wm.preferences` key `workspace-names`
- Workspace add/remove: `Main._addWorkspace()` / `Main._removeWorkspace(ws)` - they maintain the names array and refuse to remove the last workspace
- Active workspace highlight: Use `add_style_pseudo_class('outlined')` not custom CSS classes
- Main file must be `desklet.js` or `applet.js` (not `index.js` or other names)

## Gotchas

- There is no `workspace-name-changed` signal. Watch `Gio.Settings({schema_id:'org.cinnamon.desktop.wm.preferences'})` for `changed::workspace-names`
- `org.cinnamon workspace-name-overrides` is `['DEPRECATED']` and never changes. GSettings `connect('changed::<nonexistent-key>')` does NOT throw - the handler just never fires, so a wrong key looks like working code
- Never `Mainloop.idle_add` for user-visible actions: idle sits below Clutter's redraw priority and starves while menus/dialogs animate. Use `Mainloop.timeout_add(0, ...)`
- `Desklet.destroy()` emits `destroy` immediately but defers `on_desklet_removed()` by a 500 ms fade - hook both, with idempotent cleanup
- Popup menus parented to `Main.uiGroup` survive `destroy_all_children()` on your own container; track and destroy them explicitly
- Settings schema keys use hyphens (`layout-mode`) but bound properties use camelCase (`layoutMode`)
- Extension directory format: `UUID@domain` (e.g., `cinnamon-workspace-grid-desklet@curbsoftware`). `metadata.json` `uuid` MUST equal the directory name or Cinnamon refuses to load it
- Mainloop timeout callback MUST return `false` to prevent repeat execution
- `global.workspace_manager.get_active_workspace_index()` returns 0-based index

## GNOME and KDE Ports

- Trees: `gnome-<family>@curbsoftware/` (GNOME Shell 45+ ESM) and
  `kde-<family>/` (Plasma 6 QML). Separate codebases per desktop; pure
  logic is copied per tree with parallel tests, never imported across
  trees.
- GNOME GObject subclasses MUST use `GObject.registerClass`.
- GNOME settings: JSON in `~/.config/<uuid>/settings.json` via the
  tree's `lib/store.js`; no gschema.
- KDE timezone data: only from `dev-tools/gen-tz-table.py` output
  (`tzdata.js`), never hand written. QML cannot spawn commands or
  write files; document the seam and degrade with an explanation.
- Version bump on every functional change: `metadata.json` `version`
  (GNOME) or `KPlugin.Version` (KDE).
- No em-dashes, no emojis; `ports-release.py check` enforces it.
- Standalone port repos: `./dev-tools/publish-ports.sh` into `~/projects/cinnamon/ports/`.
