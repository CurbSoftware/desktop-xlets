# Workspace Switch Manager Applet - Development Guide

## Table of Contents
1. [Overview](#overview)
2. [Features](#features)
3. [Project Structure](#project-structure)
4. [Development Setup](#development-setup)
5. [Architecture](#architecture)
6. [API Reference](#api-reference)
7. [Applet Types](#applet-types)
8. [Settings System](#settings-system)
9. [Coding Patterns](#coding-patterns)
10. [Testing & Debugging](#testing--debugging)
11. [Documentation References](#documentation-references)
12. [Example Code References](#example-code-references)
13. [Future Development](#future-development)

---

## Overview

The Workspace Switch Manager is a Cinnamon panel applet that displays the current workspace name in the panel. Users can click the applet to see a dropdown menu of all workspaces and switch between them.

**UUID**: `cinnamon-workspace-name-applet@willurd`

**Type**: Cinnamon Applet (Panel)

**Goal**: Show workspaces as numbers, names, or visual representation with configurable display options.

---

## Features

### Current Features
- **Workspace Name Display**: Shows current workspace name in the panel
- **Click Menu**: Dropdown menu listing all workspaces
- **Quick Switch**: Click any workspace in menu to switch
- **Active Indicator**: Current workspace styled differently in menu
- **Auto-Update**: Label updates when workspace changes

### Planned Features
- Display as numbers only
- Display as names only
- Visual workspace representation (mini-grid)
- Configurable display modes via settings panel

---

## Project Structure

```
cinnamon-workspace-name-applet@curbsoftware/
├── applet.js               # Main applet implementation
├── metadata.json           # Applet metadata (UUID, name, description)
├── icon.png                # Applet icon for settings panel
├── README.md               # User-facing documentation
├── DEVELOPMENT.md          # This file
└── po/                     # Localization files
    ├── cinnamon-workspace-name-applet@willurd.pot  # Translation template
    ├── de.po               # German translations
    ├── es.po               # Spanish translations
    └── ...                 # Other language files
```

### File Descriptions

#### `applet.js`
Main entry point containing the `WorkspaceNameApplet` class that:
- Extends `Applet.TextApplet.prototype`
- Listens for workspace switch events
- Updates panel label with current workspace name
- Provides popup menu for workspace selection

#### `metadata.json`
Required metadata file:
```json
{
    "uuid": "cinnamon-workspace-name-applet@willurd",
    "name": "Workspace Name",
    "version": "v0.0.2",
    "description": "Show the current workspace name in the panel"
}
```

#### `icon.png`
Applet icon displayed in the Cinnamon Settings > Applets panel.

---

## Development Setup

### Step 1: Installation Directory
Applets are installed to `~/.local/share/cinnamon/applets/`:
```bash
# User installation
cp -r cinnamon-workspace-name-applet@curbsoftware ~/.local/share/cinnamon/applets/cinnamon-workspace-name-applet@willurd

# Or create symlink for development
ln -s $(pwd)/cinnamon-workspace-name-applet@curbsoftware ~/.local/share/cinnamon/applets/cinnamon-workspace-name-applet@willurd
```

**Important**: Directory name MUST match the UUID in metadata.json.

### Step 2: Add Applet to Panel
1. Right-click on the panel
2. Select "Applets"
3. Find "Workspace Name" in the list
4. Click the "+" button or drag to panel

### Step 3: Reload After Changes
```bash
# Method 1: Restart Cinnamon (preserves session)
cinnamon --replace &

# Method 2: Remove and re-add applet from panel
# (Sometimes faster for testing small changes)
```

### Step 4: View Logs
```bash
# Monitor applet logs
tail -f ~/.xsession-errors | grep -i cinnamon-workspace-name-applet

# Search for specific errors
grep -i "error\|cinnamon-workspace-name-applet" ~/.xsession-errors
```

---

## Architecture

### Class Hierarchy
```
Applet.TextApplet (imports.ui.applet)
    └── WorkspaceNameApplet
            ├── _init(metadata, orientation, panel_height, instanceId)
            ├── on_applet_clicked(event)
            ├── log(message)
            ├── logError(message)
            ├── updateLabel()
            ├── updateMenu()
            └── activateWorkspace(workspace)
```

### Applet Inheritance Chain
From `cinnamon-docs/markdown/cinnamon-js-ui-applet-section.md`:
```
Applet.Applet           # Base class - minimal functionality
    └── Applet.IconApplet       # Adds icon support
            └── Applet.TextIconApplet   # Adds label + icon
    └── Applet.TextApplet       # Text label only (used by this applet)
```

### Signal Connections
| Signal | Source | Purpose |
|--------|--------|---------|
| `switch-workspace` | `global.window_manager` | Update label when workspace changes |
| `changed::cinnamon-workspace-name-applet-overrides` | `global.settings` | Update label when names change |

### UI Components
```
actor (St.BoxLayout)
    └── _applet_label (St.Label)  # Panel text

menu (Applet.AppletPopupMenu)
    └── menuItems[] (PopupMenu.PopupMenuItem)
```

---

## API Reference

### Imports Required
```javascript
const Applet = imports.ui.applet;          // Base applet classes
const Main = imports.ui.main;              // Main UI utilities
const PopupMenu = imports.ui.popupMenu;    // Menu widgets
const Lang = imports.lang;                 // Language utilities
```

### Applet Base Class Methods
From `cinnamon-docs/markdown/cinnamon-js-ui-applet-Applet.md`:

| Method | Description |
|--------|-------------|
| `_init(orientation, panelHeight, instance_id)` | Constructor |
| `set_applet_tooltip(text, use_markup)` | Set hover tooltip |
| `set_applet_enabled(enabled)` | Enable/disable applet |
| `on_applet_clicked(event)` | Override for click handling |
| `on_applet_middle_clicked(event)` | Override for middle-click |
| `on_applet_added_to_panel()` | Called when added to panel |
| `on_applet_removed_from_panel()` | Called when removed - cleanup here |
| `on_applet_reloaded()` | Called when reloaded |
| `on_orientation_changed(orientation)` | Called when panel orientation changes |
| `on_panel_height_changed()` | Called when panel height changes |
| `setAllowedLayout(layout)` | Set allowed panel orientations |
| `highlight(boolean)` | Turn on/off highlight |

### Applet Properties
| Property | Type | Description |
|----------|------|-------------|
| `actor` | St.BoxLayout | Main actor |
| `instance_id` | int | Unique instance ID |
| `_uuid` | string | Applet UUID |
| `_panelLocation` | St.BoxLayout | Panel sector |
| `panel` | Panel.Panel | Parent panel |
| `_meta` | JSON | Metadata object |
| `_menuManager` | PopupMenuManager | Menu manager |
| `_applet_context_menu` | AppletContextMenu | Right-click menu |
| `_applet_tooltip` | PanelItemTooltip | Hover tooltip |

### TextApplet Additional Methods
From `cinnamon-docs/markdown/cinnamon-js-ui-applet-TextApplet.md`:

| Method | Description |
|--------|-------------|
| `set_applet_label(text)` | Set the panel label text |

### TextIconApplet Additional Methods
From `cinnamon-docs/markdown/cinnamon-js-ui-applet-TextIconApplet.md`:

| Method | Description |
|--------|-------------|
| `set_applet_label(text)` | Set label text |
| `set_applet_icon_name(icon_name)` | Set icon by name |
| `set_applet_icon_path(path)` | Set icon by file path |
| `set_applet_icon_symbolic_name(name)` | Set symbolic icon |
| `hide_applet_label(hide)` | Show/hide the label |
| `hide_applet_icon()` | Hide the icon |

### Workspace API
```javascript
// Get active workspace (using global.screen - older API)
let activeWorkspace = global.screen.get_active_workspace();

// Get active workspace index
let index = global.screen.get_active_workspace_index();

// Get workspace count
let count = global.screen.n_workspaces;

// Get workspace by index
let ws = global.screen.get_workspace_by_index(index);

// Get workspace name (using Main helper)
let name = Main.getWorkspaceName(index);

// Activate a workspace
workspace.activate(global.get_current_time());
```

**Note**: Newer Cinnamon versions use `global.workspace_manager` instead of `global.screen`:
```javascript
// Newer API
global.workspace_manager.get_active_workspace_index();
global.workspace_manager.n_workspaces;
global.workspace_manager.get_workspace_by_index(index);
```

---

## Applet Types

### Available Base Classes

#### 1. Applet.Applet
Minimal base class - provides only container and basic events.
```javascript
MyApplet.prototype = {
    __proto__: Applet.Applet.prototype,
    // Must manually create all UI elements
};
```

#### 2. Applet.IconApplet
Adds icon support.
```javascript
MyApplet.prototype = {
    __proto__: Applet.IconApplet.prototype,

    _init: function(orientation, panel_height, instance_id) {
        Applet.IconApplet.prototype._init.call(this, orientation, panel_height, instance_id);
        this.set_applet_icon_name("workspace-switcher");
    }
};
```

#### 3. Applet.TextApplet
Adds text label (current implementation).
```javascript
MyApplet.prototype = {
    __proto__: Applet.TextApplet.prototype,

    _init: function(orientation, panel_height, instance_id) {
        Applet.TextApplet.prototype._init.call(this, orientation, panel_height, instance_id);
        this.set_applet_label("Workspace 1");
    }
};
```

#### 4. Applet.TextIconApplet
Adds both icon and text label.
```javascript
MyApplet.prototype = {
    __proto__: Applet.TextIconApplet.prototype,

    _init: function(orientation, panel_height, instance_id) {
        Applet.TextIconApplet.prototype._init.call(this, orientation, panel_height, instance_id);
        this.set_applet_icon_symbolic_name("workspace-switcher-symbolic");
        this.set_applet_label("Workspace 1");
    }
};
```

### Choosing the Right Base Class
| Requirement | Base Class |
|-------------|------------|
| Text only | `TextApplet` |
| Icon only | `IconApplet` |
| Text + Icon | `TextIconApplet` |
| Custom UI | `Applet` |

---

## Settings System

### Creating settings-schema.json
To add configurable settings, create `settings-schema.json`:

```json
{
  "display-mode": {
    "type": "combobox",
    "default": "name",
    "description": "Display mode",
    "options": {
      "Name only": "name",
      "Number only": "number",
      "Number + Name": "both",
      "Visual grid": "visual"
    }
  },
  "show-menu-on-click": {
    "type": "checkbox",
    "default": true,
    "description": "Show workspace menu on click"
  },
  "scroll-to-switch": {
    "type": "checkbox",
    "default": false,
    "description": "Use scroll wheel to switch workspaces"
  }
}
```

### Binding Settings in applet.js
```javascript
const Settings = imports.ui.settings;

_init: function(metadata, orientation, panel_height, instanceId) {
    Applet.TextApplet.prototype._init.call(this, orientation, panel_height, instanceId);

    // Initialize settings
    this.settings = new Settings.AppletSettings(this, metadata.uuid, instanceId);

    // Bind settings to properties
    this.settings.bind("display-mode", "displayMode", this.updateLabel);
    this.settings.bind("show-menu-on-click", "showMenuOnClick");
    this.settings.bind("scroll-to-switch", "scrollToSwitch", this._onScrollSettingChanged);

    // Properties are now available as this.displayMode, this.showMenuOnClick, etc.
}
```

### Opening Settings Panel
```bash
cinnamon-settings applets cinnamon-workspace-name-applet@willurd
```

---

## Coding Patterns

### Pattern 1: Applet Initialization
```javascript
function WorkspaceNameApplet(metadata, orientation, panel_height, instanceId) {
    this._init(metadata, orientation, panel_height, instanceId);
}

WorkspaceNameApplet.prototype = {
    __proto__: Applet.TextApplet.prototype,

    _init: function(metadata, orientation, panel_height, instanceId) {
        // MUST call parent _init first
        Applet.TextApplet.prototype._init.call(this, orientation, panel_height, instanceId);

        this.metadata = metadata;

        try {
            // Connect signals
            global.window_manager.connect('switch-workspace', Lang.bind(this, this.updateLabel));

            // Set up menu
            this.menu = new Applet.AppletPopupMenu(this, orientation);
            this.menuManager = new PopupMenu.PopupMenuManager(this);
            this.menuManager.addMenu(this.menu);

            // Initial update
            this.updateLabel();
        } catch (e) {
            global.logError(this.metadata.uuid + " Exception: " + e.toString());
        }
    }
};

// Entry point - MUST return applet instance
function main(metadata, orientation, panel_height, instanceId) {
    return new WorkspaceNameApplet(metadata, orientation, panel_height, instanceId);
}
```

### Pattern 2: Click Handler with Menu
```javascript
on_applet_clicked: function(event) {
    this.updateMenu();  // Rebuild menu with current workspaces
    this.menu.toggle(); // Show/hide menu
}
```

### Pattern 3: Dynamic Menu Building
```javascript
updateMenu: function() {
    // Clear existing items
    this.menu.removeAll();

    // Get workspace count
    let workspaceCount = global.screen.n_workspaces;
    let activeIndex = global.screen.get_active_workspace_index();

    for (let i = 0; i < workspaceCount; i++) {
        let workspaceName = Main.getWorkspaceName(i);
        let workspace = global.screen.get_workspace_by_index(i);

        // Create menu item
        let menuItem = new PopupMenu.PopupMenuItem(workspaceName);

        // Style active workspace differently
        if (i === activeIndex) {
            menuItem.actor.reactive = false;
            menuItem.actor.can_focus = false;
            menuItem.label.add_style_class_name('popup-subtitle-menu-item');
        }

        // Connect click handler
        menuItem.connect('activate', Lang.bind(this, function() {
            this.activateWorkspace(workspace);
        }));

        this.menu.addMenuItem(menuItem);
    }
}
```

### Pattern 4: Workspace Activation
```javascript
activateWorkspace: function(workspace) {
    workspace.activate(global.get_current_time());
}
```

### Pattern 5: Update on Signal
```javascript
_init: function(...) {
    // Connect to workspace switch signal
    global.window_manager.connect('switch-workspace', Lang.bind(this, this.updateLabel));

    // Connect to workspace name changes
    global.settings.connect('changed::cinnamon-workspace-name-applet-overrides', Lang.bind(this, this.updateLabel));
}

updateLabel: function() {
    let activeWorkspace = global.screen.get_active_workspace();
    let name = Main.getWorkspaceName(activeWorkspace.index());
    this.set_applet_label(name);
}
```

### Pattern 6: Logging
```javascript
log: function(message) {
    global.log('[' + this.metadata.uuid + '] ' + message);
}

logError: function(message) {
    global.logError('[' + this.metadata.uuid + '] ' + message);
}
```

### Pattern 7: Using SignalManager (Recommended)
From `cinnamon-docs/markdown/cinnamon-js-misc-signalManager-SignalManager.md`:

```javascript
const SignalManager = imports.misc.signalManager;

_init: function(...) {
    // Create signal manager
    this._signalManager = new SignalManager.SignalManager(null);

    // Connect signals through manager
    this._signalManager.connect(global.window_manager, 'switch-workspace',
        (...args) => this.updateLabel(...args));
    this._signalManager.connect(global.settings, 'changed::cinnamon-workspace-name-applet-overrides',
        (...args) => this.updateLabel(...args));
}

on_applet_removed_from_panel: function() {
    // Disconnect ALL signals at once
    this._signalManager.disconnectAllSignals();
}
```

---

## Testing & Debugging

### Debug Logging
```javascript
// Custom log with applet prefix
log: function(message) {
    global.log('[' + this.metadata.uuid + '] ' + message);
}

// Usage
this.log('Updating label');
this.log('Active workspace: ' + index);
```

### View Logs
```bash
# Watch live logs
tail -f ~/.xsession-errors | grep -i cinnamon-workspace-name-applet

# Search for errors
grep -E "(error|cinnamon-workspace-name-applet)" ~/.xsession-errors -i
```

### Common Issues

#### Issue: Applet shows "undefined"
**Cause**: `global.screen` API deprecated in newer Cinnamon
**Solution**: Use `global.workspace_manager` instead:
```javascript
// Old (deprecated)
global.screen.get_active_workspace();

// New
global.workspace_manager.get_active_workspace();
```

#### Issue: Menu not showing
**Cause**: Menu not properly initialized
**Solution**: Ensure menu creation in `_init`:
```javascript
this.menu = new Applet.AppletPopupMenu(this, orientation);
this.menuManager = new PopupMenu.PopupMenuManager(this);
this.menuManager.addMenu(this.menu);
```

#### Issue: Signals not disconnected
**Cause**: Missing cleanup
**Solution**: Use SignalManager or manually disconnect:
```javascript
on_applet_removed_from_panel: function() {
    if (this._signalId) {
        global.window_manager.disconnect(this._signalId);
    }
}
```

### Test Workspace Operations
```bash
# Get workspace names
gsettings get org.cinnamon cinnamon-workspace-name-applet-overrides

# Set workspace names
gsettings set org.cinnamon cinnamon-workspace-name-applet-overrides "['Web', 'Code', 'Chat']"
```

---

## Documentation References

### Cinnamon Developer Docs (Local)
| Document | Path | Content |
|----------|------|---------|
| Settings Tutorial | `cinnamon-docs/cinnamon-developer-docs/xlet-settings.md` | Settings API overview |
| Settings Reference | `cinnamon-docs/cinnamon-developer-docs/xlet-settings-ref.md` | Widget types |
| Importer Guide | `cinnamon-docs/cinnamon-developer-docs/importer.md` | Module imports |

### API Documentation (Local Markdown)
| Document | Path | Content |
|----------|------|---------|
| Applet Base | `cinnamon-docs/markdown/cinnamon-js-ui-applet-Applet.md` | Base applet API |
| IconApplet | `cinnamon-docs/markdown/cinnamon-js-ui-applet-IconApplet.md` | Icon applet |
| TextApplet | `cinnamon-docs/markdown/cinnamon-js-ui-applet-TextApplet.md` | Text applet |
| TextIconApplet | `cinnamon-docs/markdown/cinnamon-js-ui-applet-TextIconApplet.md` | Text+icon applet |
| AppletSettings | `cinnamon-docs/markdown/cinnamon-js-ui-settings-AppletSettings.md` | Settings provider |
| AppletPopupMenu | `cinnamon-docs/markdown/cinnamon-js-ui-applet-AppletPopupMenu.md` | Left-click menu |
| AppletContextMenu | `cinnamon-docs/markdown/cinnamon-js-ui-applet-AppletContextMenu.md` | Right-click menu |
| PopupMenu | `cinnamon-docs/markdown/cinnamon-js-ui-popupMenu-section.md` | Menu widgets |
| SignalManager | `cinnamon-docs/markdown/cinnamon-js-misc-signalManager-SignalManager.md` | Signal management |

---

## Example Code References

### Example Applets (Local)
| Example | Path | Features Demonstrated |
|---------|------|-----------------------|
| 1440 Timer | `cinnamon-docs/cinnamon-spices-applets/1440@jvlianodorneles/` | TextApplet, timer, tooltip |
| Cinnamenu | `cinnamon-docs/cinnamon-spices-applets/Cinnamenu@json/` | Complex menu, settings |
| Command Runner | `cinnamon-docs/cinnamon-spices-applets/CommandRunner@appdevsw/` | Command execution, GUI |
| Cassia Window List | `cinnamon-docs/cinnamon-spices-applets/CassiaWindowList@klangman/` | Window management |
| Exit | `cinnamon-docs/cinnamon-spices-applets/Exit@claudiux/` | System actions, icons |

### Key Patterns from Examples

#### From 1440@jvlianodorneles (Simple TextApplet)
```javascript
function MyApplet(orientation, panel_height, instance_id) {
    this._init(orientation, panel_height, instance_id);
}

MyApplet.prototype = {
    __proto__: Applet.TextApplet.prototype,

    _init: function(orientation, panel_height, instance_id) {
        Applet.TextApplet.prototype._init.call(this, orientation, panel_height, instance_id);
        this.set_applet_tooltip(_("Time remaining"));
        this._updateTime();
    },

    on_applet_removed_from_panel: function() {
        if (this.updateLoop) {
            Mainloop.source_remove(this.updateLoop);
        }
    },

    _updateTime: function() {
        this.set_applet_label("Text here");
        this.updateLoop = Mainloop.timeout_add_seconds(60, Lang.bind(this, this._updateTime));
    }
};
```

---

## Future Development

### Implementing Display Modes

#### Mode 1: Number Only
```javascript
updateLabel: function() {
    let index = global.workspace_manager.get_active_workspace_index();
    this.set_applet_label((index + 1).toString());
}
```

#### Mode 2: Name Only (Current)
```javascript
updateLabel: function() {
    let index = global.workspace_manager.get_active_workspace_index();
    let name = Main.getWorkspaceName(index);
    this.set_applet_label(name);
}
```

#### Mode 3: Number + Name
```javascript
updateLabel: function() {
    let index = global.workspace_manager.get_active_workspace_index();
    let name = Main.getWorkspaceName(index);
    this.set_applet_label((index + 1) + ": " + name);
}
```

#### Mode 4: Visual Grid
Requires switching to `Applet.Applet` base and creating custom UI:
```javascript
_buildVisualGrid: function() {
    this.actor.destroy_all_children();

    let grid = new St.BoxLayout({ style_class: 'workspace-grid' });
    let count = global.workspace_manager.n_workspaces;
    let active = global.workspace_manager.get_active_workspace_index();

    for (let i = 0; i < count; i++) {
        let box = new St.Bin({
            style_class: i === active ? 'workspace-dot-active' : 'workspace-dot'
        });
        grid.add(box);
    }

    this.actor.add(grid);
}
```

### Settings Schema for Display Modes
```json
{
  "display-mode": {
    "type": "combobox",
    "default": "name",
    "description": "How to display the current workspace",
    "options": {
      "Name only": "name",
      "Number only": "number",
      "Number + Name": "both",
      "Visual dots": "visual"
    }
  }
}
```

---

## Quick Reference Card

### Essential Imports
```javascript
const Applet = imports.ui.applet;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const Lang = imports.lang;
const Settings = imports.ui.settings;
const SignalManager = imports.misc.signalManager;
```

### Minimal Applet Template
```javascript
const Applet = imports.ui.applet;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const Lang = imports.lang;

function MyApplet(metadata, orientation, panel_height, instanceId) {
    this._init(metadata, orientation, panel_height, instanceId);
}

MyApplet.prototype = {
    __proto__: Applet.TextApplet.prototype,

    _init: function(metadata, orientation, panel_height, instanceId) {
        Applet.TextApplet.prototype._init.call(this, orientation, panel_height, instanceId);

        this.set_applet_tooltip("My Applet");
        this.set_applet_label("Hello");

        // Setup menu
        this.menu = new Applet.AppletPopupMenu(this, orientation);
        this.menuManager = new PopupMenu.PopupMenuManager(this);
        this.menuManager.addMenu(this.menu);
    },

    on_applet_clicked: function(event) {
        this.menu.toggle();
    },

    on_applet_removed_from_panel: function() {
        // Cleanup
    }
};

function main(metadata, orientation, panel_height, instanceId) {
    return new MyApplet(metadata, orientation, panel_height, instanceId);
}
```

### Workspace API Quick Reference
```javascript
// Get active workspace index
global.workspace_manager.get_active_workspace_index()

// Get workspace count
global.workspace_manager.n_workspaces

// Get workspace by index
global.workspace_manager.get_workspace_by_index(i)

// Get workspace name
Main.getWorkspaceName(index)

// Activate workspace
workspace.activate(global.get_current_time())
```

### Command Reference
```bash
# Reload Cinnamon
cinnamon --replace &

# Open applet settings
cinnamon-settings applets cinnamon-workspace-name-applet@willurd

# View logs
tail -f ~/.xsession-errors

# Get/set workspace names
gsettings get org.cinnamon cinnamon-workspace-name-applet-overrides
gsettings set org.cinnamon cinnamon-workspace-name-applet-overrides "['Web', 'Code', 'Chat']"
```

### Signal Connection Pattern
```javascript
// Connect
this._switchId = global.window_manager.connect('switch-workspace',
    Lang.bind(this, this.updateLabel));

// Disconnect (in on_applet_removed_from_panel)
global.window_manager.disconnect(this._switchId);
```
