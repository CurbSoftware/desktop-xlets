# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Critical Commands

- Install desklet: `cp -r extension-uuid ~/.local/share/cinnamon/desklets/`
- Install applet: `cp -r extension-uuid ~/.local/share/cinnamon/applets/`
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
- Workspace names: Try `global.settings.get_strv("workspace-name-overrides")` first, fallback to `ws.get_name()` or `ws.cached_name`
- Active workspace highlight: Use `add_style_pseudo_class('outlined')` not custom CSS classes
- Main file must be `desklet.js` or `applet.js` (not `index.js` or other names)

## Gotchas

- `workspace-name-changed` signal is NOT available on all Cinnamon versions (commented out in existing code)
- Settings schema keys use hyphens (`layout-mode`) but bound properties use camelCase (`layoutMode`)
- Extension directory format: `UUID@domain` (e.g., `workspace-grid-desklet@curb.software`)
- Mainloop timeout callback MUST return `false` to prevent repeat execution
- `global.workspace_manager.get_active_workspace_index()` returns 0-based index
