# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
This is a Cinnamon workspace switcher desklet that displays a clickable grid of workspaces with their names and highlights the active workspace. The main goal is to enhance the existing desklet to show user-assigned workspace names instead of just "Workspace N".

## Architecture

### Main Desklet (`workspace-grid-desklet@cinnamon-docs/`)
- **desklet.js**: Main desklet implementation that creates a grid layout of workspace buttons
- **WorkspaceController.js**: Manages workspace geometry and count within Cinnamon's workspace manager
- **metadata.json**: Desklet metadata including UUID, name, and description
- **settings-schema.json**: Configuration schema for layout modes, dimensions, and appearance

### Key Components
- **Grid Layout**: Auto-sizing or fixed row/column layout for workspace tiles
- **Workspace Names**: Retrieves names via `ws.get_name()` or `ws.cached_name` with fallback to "Workspace N"
- **Active Workspace Highlighting**: Uses CSS pseudo-class 'outlined' for current workspace
- **Settings System**: Binds to layout-mode, dimensions, spacing, and scroll behavior settings
- **Event Handling**: Workspace switching via click and optional scroll wheel navigation

### Reference Materials (`cinnamon-developer-docs/`)
- **write-applet.md**: Basic applet structure and API usage patterns
- **xlet-settings.md**: Settings system implementation with JSON schema and binding
- Contains crucial information about Cinnamon's module system and API patterns

### Reference Implementation (`workspace-name@willurd/`)
- **applet.js**: Shows how to retrieve workspace names using `Main.getWorkspaceName()`
- Demonstrates proper workspace event handling and name retrieval patterns

## Workspace Name Retrieval
The current implementation in `desklet.js:157-173` attempts to get workspace names but needs enhancement:
- Uses `ws.get_name()` method when available
- Falls back to `ws.cached_name` property
- Should potentially use `Main.getWorkspaceName()` pattern from reference applet

## Development Commands
No specific build, lint, or test commands identified. Cinnamon desklets are typically:
- Installed to `~/.local/share/cinnamon/desklets/` for user installation
- Reloaded via Cinnamon restart or desklet reload
- Debugged via `~/.xsession-errors` log file

## Key APIs and Patterns
- **Imports**: Use `imports.ui.desklet`, `imports.gi.St`, `imports.ui.settings`
- **Inheritance**: Extend `Desklet.Desklet.prototype`
- **Settings**: Use `Settings.DeskletSettings` with JSON schema binding
- **Workspace Manager**: Access via `global.workspace_manager`
- **Event Handling**: Connect to 'switch-workspace', 'workspace-added', 'workspace-removed'

## Common Issues
- Desklet crashes may be due to improper error handling or API version compatibility
- Workspace name signals may not be available on all Cinnamon versions
- Grid layout must handle dynamic workspace count changes
- CSS styling must inherit from Cinnamon theme system