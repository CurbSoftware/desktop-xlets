# Cinnamon Extensions & Documentation

This repository contains a collection of Cinnamon desktop environment extensions (Desklets and Applets) primarily under the `@curbsoftware` namespace, alongside extensive developer documentation.

## Key Components

### Extensions (`@curbsoftware`)
*   **`cinnamon-world-clock@curbsoftware` (Desklet):** Displays multiple world clocks in a grid. Configurable timezones and formats.
*   **`workspace-grid-desklet@curbsoftware` (Desklet):** Interactive grid of workspaces on the desktop for quick navigation and organization.
*   **`workspace-name@curbsoftware` (Applet):** Panel applet for workspace switching and naming.

### Documentation
*   **`cinnamon-docs/`:** Contains developer guides (`cinnamon-developer-docs/`) and reference materials.
*   **`AGENTS.md` & `CLAUDE.md`:** Critical internal documentation for AI agents, detailing specific coding patterns and "gotchas".

## Development Workflow

### 1. Installation
To test an extension, it must be installed into the Cinnamon user directory.

**For Desklets:**
```bash
cp -r <extension-uuid> ~/.local/share/cinnamon/desklets/
# Example:
# cp -r cinnamon-world-clock@curbsoftware ~/.local/share/cinnamon/desklets/TimeAndDate@desklet.user
```

**For Applets:**
```bash
cp -r <extension-uuid> ~/.local/share/cinnamon/applets/
```

*Note: You can also use a symlink for easier development.*

### 2. Applying Changes
After installing or modifying code, reload Cinnamon to apply changes:
```bash
cinnamon --replace &
```

### 3. Debugging
Monitor the session errors log for runtime issues and `global.log()` output:
```bash
tail -f ~/.xsession-errors
```

### 4. Configuration
*   **Settings Panel:** `cinnamon-settings desklets <uuid>` or `cinnamon-settings applets <uuid>`
*   **Metadata:** Some extensions (like the world clock) may use `metadata.json` directly for configuration.

## Critical Coding Guidelines

**Adhere strictly to these patterns to prevent instability and crashes.**

### Memory Management (CRITICAL)
*   **Cleanup:** ALL signals and timeouts must be explicitly removed in the cleanup methods (`on_desklet_removed` / `on_applet_removed_from_panel`).
*   **Timeouts:** Always check `if (this._timeout) Mainloop.source_remove(this._timeout)` before adding a new one or in cleanup.
*   **Signals:** Use `SignalManager` if available, or manually disconnect.

### Inheritance Pattern
Cinnamon extensions use a specific prototype inheritance pattern:
```javascript
function MyDesklet(metadata, desklet_id) {
    this._init(metadata, desklet_id);
}

MyDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function(metadata, desklet_id) {
        Desklet.Desklet.prototype._init.call(this, metadata, desklet_id);
        // ... initialization
    }
}
```

### Settings & Metadata
*   **Schema:** Settings are defined in `settings-schema.json` but keys in code are camelCase while schema keys use hyphens (e.g., `layout-mode` -> `this.layoutMode`).
*   **Metadata:** `metadata.json` defines the UUID and basic properties. Ensure the folder name matches the UUID for standard installation.

### UI & Styling
*   **St Toolkit:** Use `imports.gi.St` for UI widgets.
*   **CSS:** Use `stylesheet.css` for styling. Use `add_style_pseudo_class('name')` for state changes (like 'outlined' for active workspace).

## Project Structure
```
.
├── cinnamon-docs/               # Developer documentation & references
├── cinnamon-world-clock@.../    # World Clock Desklet
├── workspace-grid-desklet@.../  # Workspace Grid Desklet
├── workspace-name@.../          # In Panel Workspace Name Applet
├── AGENTS.md                    # Critical coding rules
└── CLAUDE.md                    # Additional context & architecture notes
```
