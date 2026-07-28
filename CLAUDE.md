# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
This is a Cinnamon extensions monorepo containing workspace management and clock desklets/applets for the Cinnamon desktop environment.

## Architecture

### Active Extensions

#### Workspace Grid Desklet (`workspace-grid-desklet@curbsoftware/`)
- Displays a clickable grid of workspaces with their names
- Highlights the active workspace
- Supports auto-sizing or fixed row/column layout

#### Workspace Name Applet (`workspace-name@curbsoftware/`)
- Panel applet showing the current workspace name
- Demonstrates workspace event handling and name retrieval patterns

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

### VM Testing (Crash Isolation)
VM: `cinnamon-cinnanom` with credentials `cinnamon/cinnamon`
```bash
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
- **Inheritance**: Extend `Desklet.Desklet.prototype` or `Applet.Applet.prototype`
- **Settings**: Use `Settings.DeskletSettings` or `Settings.AppletSettings` with JSON schema binding
- **Workspace Manager**: Access via `global.workspace_manager`
- **Event Handling**: Connect to 'switch-workspace', 'workspace-added', 'workspace-removed'

## Common Issues
- Extension crashes may be due to improper error handling or API version compatibility
- Workspace name signals may not be available on all Cinnamon versions
- CSS styling must inherit from Cinnamon theme system
