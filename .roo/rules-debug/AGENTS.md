# AGENTS.md - Debug Mode

Non-obvious debugging rules for Cinnamon extensions.

## Debugging Commands

- View logs: `tail -f ~/.xsession-errors` - All extension errors appear here
- Reload Cinnamon: `cinnamon --replace &` - Required after code changes
- Install desklet: `cp -r extension-uuid ~/.local/share/cinnamon/desklets/`
- Install applet: `cp -r extension-uuid ~/.local/share/cinnamon/applets/`

## Common Issues

- Desklet/applet crashes often due to improper signal cleanup causing memory leaks
- `workspace-name-changed` signal is NOT available on all Cinnamon versions - check before connecting
- Settings schema typos cause silent failures - verify hyphenated keys match bound properties
- Mainloop timeout without `return false` causes infinite repeat execution

## Memory Leak Symptoms

- Extension becomes unresponsive after extended use
- Cinnamon process memory grows continuously
- Check `on_desklet_removed`/`on_applet_removed_from_panel` for missing disconnects

## Signal Debugging

- Use `SignalManager.SignalManager` to track all signals via `getSignals()`
- Check for duplicate connections (SignalManager prevents this by default)
- Verify signals are disconnected before object destruction

## Workspace API Gotchas

- `global.workspace_manager.get_active_workspace_index()` returns 0-based index
- Workspace name retrieval requires fallback chain: overrides → `get_name()` → `cached_name`
- Dynamic workspace count changes require grid rebuild and signal reconnection
