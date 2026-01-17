# AGENTS.md - Code Mode

Non-obvious coding rules for Cinnamon extensions.

## Memory Leak Prevention (CRITICAL)

- ALL signals MUST be disconnected in cleanup (`on_desklet_removed`/`on_applet_removed_from_panel`)
- ALL timeouts MUST be removed via `Mainloop.source_remove()` before re-adding
- Use `SignalManager.SignalManager` for easier signal cleanup: `this._signalManager.disconnectAllSignals()`

## Inheritance Pattern

- Prototype inheritance: `__proto__: Desklet.Desklet.prototype` then `_init()` calls parent
- Must call `Desklet.Desklet.prototype._init.call(this, metadata, deskletId)` in constructor

## Settings Binding

- `this.settings.bind("key", "property", callback)` - key is hyphenated in schema
- Settings schema keys use hyphens (`layout-mode`) but bound properties use camelCase (`layoutMode`)

## Debounced Updates

- Check `if (this._timeout) Mainloop.source_remove(this._timeout)` before `Mainloop.timeout_add()`
- Mainloop timeout callback MUST return `false` to prevent repeat execution

## Workspace API

- `global.workspace_manager.get_active_workspace_index()` returns 0-based index
- Workspace names: Try `global.settings.get_strv("workspace-name-overrides")` first, fallback to `ws.get_name()` or `ws.cached_name`

## File Naming

- Main file must be `desklet.js` or `applet.js` (not `index.js` or other names)
- Extension directory format: `UUID@domain` (e.g., `workspace-grid-desklet@curb.software`)

## Signal Gotchas

- `workspace-name-changed` signal is NOT available on all Cinnamon versions (commented out in existing code)
- SignalManager automatically prevents duplicate connections unless `force: true` is passed
