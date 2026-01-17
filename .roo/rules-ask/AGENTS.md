# AGENTS.md - Ask Mode

Non-obvious documentation context for Cinnamon extensions.

## Project Structure

- Extensions use `UUID@domain` directory format (e.g., `workspace-grid-desklet@curb.software`)
- Main file must be `desklet.js` or `applet.js` (not `index.js`)
- Required: `metadata.json`, Optional but recommended: `settings-schema.json`, `stylesheet.css`

## Documentation Resources

- `cinnamon-docs/` contains extensive local documentation for Cinnamon APIs
- `CLAUDE.md` in project root provides project overview and key patterns
- Each extension has `DEVELOPMENT.md` with extension-specific guidance

## API Documentation Locations

- `cinnamon-docs/markdown/cinnamon-js-misc-signalManager-SignalManager.md` - Signal management
- `cinnamon-docs/markdown/cinnamon-js-ui-deskletManager.md` - Desklet system
- `cinnamon-docs/markdown/cinnamon-js-ui-appletManager.md` - Applet system
- `cinnamon-docs/markdown/cinnamon-js-ui-settings-*.md` - Settings system

## Non-Obvious API Behaviors

- `workspace-name-changed` signal is NOT available on all Cinnamon versions
- Settings schema keys use hyphens (`layout-mode`) but bound properties use camelCase
- `global.workspace_manager.get_active_workspace_index()` returns 0-based index
- Workspace name retrieval requires fallback chain: overrides → `get_name()` → `cached_name`

## Testing Workflow

- No build/test/lint infrastructure - extensions are interpreted JavaScript
- Manual testing via installation and Cinnamon reload: `cinnamon --replace &`
- Debug via `~/.xsession-errors` log file
- Settings accessible via `cinnamon-settings desklets extension-uuid`
