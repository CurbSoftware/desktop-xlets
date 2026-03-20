# Cinnamon World Clock Desklet - Development Guide

## Table of Contents
1. [Overview](#overview)
2. [Features](#features)
3. [Project Structure](#project-structure)
4. [Development Setup](#development-setup)
5. [Architecture](#architecture)
6. [API Reference](#api-reference)
7. [Configuration System](#configuration-system)
8. [Localization](#localization)
9. [Coding Patterns](#coding-patterns)
10. [Testing & Debugging](#testing--debugging)
11. [Documentation References](#documentation-references)
12. [Example Code References](#example-code-references)
13. [Future Development](#future-development)

---

## Overview

The Cinnamon World Clock Desklet displays time, date, and timezone information on the desktop. Users can configure the display format, font sizes, and timezone to create multiple clock instances for different time zones.

**UUID**: `TimeAndDate@desklet.user`

**Type**: Cinnamon Desklet

**Goal**: Create a grid of world clocks where users can add/remove clocks, change sizes, and rearrange via drag-and-drop.

---

## Features

### Current Features
- **Time Display**: Shows current time with configurable format (e.g., `%H:%M:%S`)
- **Date Display**: Shows current date with configurable format (e.g., `%A, %e %B`)
- **Timezone Support**: Display time for any valid IANA timezone
- **Timezone Label**: Shows the timezone name below date
- **Configurable Fonts**: Separate font sizes for time, date, and timezone
- **Context Menu**: Quick access to edit configuration and help
- **Live Updates**: Refreshes every second

### Planned Features (Grid Functionality)
- Add and remove multiple clocks
- Resize individual clocks
- Drag-and-drop rearrangement
- Grid layout management

### Clock Configuration Options
| Setting | Type | Description | Example |
|---------|------|-------------|---------|
| `name` | string | Clock display name | `"Time Los Angeles"` |
| `timeFormat` | string | Time format string | `"%H:%M:%S"` |
| `timeSize` | string | Font size for time | `"40pt"` |
| `dateFormat` | string | Date format string | `"%A, %e %B"` |
| `dateSize` | string | Font size for date | `"15pt"` |
| `timezone` | string | IANA timezone | `"America/Los_Angeles"` |
| `timezoneSize` | string | Font size for timezone label | `"12pt"` |

---

## Project Structure

```
cinnamon-world-clock-desklet@curbsoftware/
├── desklet.js              # Main desklet implementation
├── metadata.json           # Desklet metadata
├── settings-schema.json    # Desklet settings (grid + clock list)
├── stylesheet.css          # CSS styles for the desklet
├── icon.png                # Desklet icon for settings panel
├── README.md               # User-facing documentation
├── DEVELOPMENT.md          # This file
└── po/                     # Localization files
    ├── TimeAndDate@desklet.user.pot   # Translation template
    ├── es.po               # Spanish translations
    ├── de.po               # German translations
    ├── fr.po               # French translations
    └── ...                 # Other language files
```

### File Descriptions

#### `desklet.js`
Main entry point containing the `MyDesklet` class that:
- Extends `Desklet.Desklet.prototype`
- Reads configuration from `settings-schema.json`
- Renders a grid of `ClockWidget` actors
- Updates display every second using `Mainloop.timeout_add_seconds`
- Handles drag-and-drop reordering via `imports.ui.dnd`
- Converts timezones using JavaScript `Intl.DateTimeFormat`

#### `metadata.json`
Standard metadata: UUID, name, description, author.

#### `settings-schema.json`
Settings and storage for the grid and clock list (generic JSON), consumed via `Settings.DeskletSettings`.

#### `stylesheet.css`
CSS styling for the clock containers and labels.

#### `po/` Directory
Contains gettext translation files for internationalization.

---

## Development Setup

### Step 1: Installation Directory
```bash
# User installation
cp -r cinnamon-world-clock-desklet@curbsoftware ~/.local/share/cinnamon/desklets/TimeAndDate@desklet.user

# Or create symlink for development
ln -s $(pwd)/cinnamon-world-clock-desklet@curbsoftware ~/.local/share/cinnamon/desklets/TimeAndDate@desklet.user
```

**Important**: The installation directory name MUST match the UUID in metadata.json.

### Step 2: Enable the Desklet
1. Right-click on desktop
2. Select "Add Desklets"
3. Find "Time And Date" in list
4. Click "Add to Desktop"

### Step 3: Configure
Right-click the desklet and use:
- **Add Clock** to create a new entry
- **Clocks** submenu to edit, resize, or remove a clock
- Cinnamon Settings (Desklets) to adjust grid columns and spacing

### Step 4: Reload
```bash
# Restart Cinnamon to apply changes
cinnamon --replace &
```

### Step 5: View Logs
```bash
tail -f ~/.xsession-errors | grep -i TimeAndDate
```

---

## Architecture

### Class Hierarchy
```
Desklet.Desklet (imports.ui.desklet)
    └── MyDesklet
            ├── _init(metadata, deskletId)
            ├── _renderClocks()
            ├── _scheduleUpdate()
            └── on_desklet_removed()

ClockWidget
    ├── update(baseDate)
    └── drag/drop handlers
```

### UI Component Tree
```
_mainContainer (St.BoxLayout, vertical)
    └── _grid (St.Table)
            ├── ClockWidget.actor (St.BoxLayout)
            │       ├── _time (St.Label)
            │       ├── _date (St.Label)
            │       └── _timezoneLabel (St.Label)
            └── ...
```

### Update Loop
```
_onTick()
    │
    ├── _updateClocks()
    │       ├── For each ClockWidget
    │       │       ├── Convert to timezone (if specified)
    │       │       ├── Format time/date
    │       │       └── Update labels
    │       └── ...
    │
    └── _scheduleUpdate() ──► _onTick()
```

---

## API Reference

### Imports Required
```javascript
const Clutter = imports.gi.Clutter;         // Clutter for DnD dialogs
const St = imports.gi.St;                   // Shell Toolkit widgets
const Desklet = imports.ui.desklet;         // Base desklet class
const Lang = imports.lang;                  // Language utilities
const Mainloop = imports.mainloop;          // Event loop
const GLib = imports.gi.GLib;               // GLib utilities
const PopupMenu = imports.ui.popupMenu;     // Menu widgets
const Util = imports.misc.util;             // Utility functions
const Settings = imports.ui.settings;       // Desklet settings
const SignalManager = imports.misc.signalManager; // Signal cleanup
const DND = imports.ui.dnd;                 // Drag and drop
const ModalDialog = imports.ui.modalDialog; // Configuration dialogs
const Gettext = imports.gettext;            // Localization
```

### Desklet Base Class Methods
From `cinnamon-docs/markdown/cinnamon-js-ui-desklet-Desklet.md`:

| Method | Description |
|--------|-------------|
| `_init(metadata, desklet_id)` | Constructor |
| `setContent(actor)` | Set main content actor |
| `setHeader(text)` | Set desklet header text |
| `on_desklet_removed()` | Cleanup callback |

### Desklet Properties
| Property | Type | Description |
|----------|------|-------------|
| `metadata` | dictionary | Data from metadata.json |
| `actor` | St.BoxLayout | Main actor |
| `_menu` | PopupMenu | Right-click context menu |

### Date/Time APIs

#### JavaScript Date Formatting
```javascript
// Using toLocaleFormat (GJS extension)
displayDate.toLocaleFormat("%H:%M:%S")  // "14:30:45"
displayDate.toLocaleFormat("%A, %e %B") // "Monday, 15 January"
```

#### Timezone Conversion
```javascript
// Convert date to specific timezone
const timeString = date.toLocaleString("en-US", {timeZone: "America/Los_Angeles"});
const localizedDate = new Date(timeString);
```

#### Get System Timezone
```javascript
const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
// Returns: "America/New_York", "Europe/London", etc.
```

### Common Format Specifiers
| Specifier | Output | Example |
|-----------|--------|---------|
| `%H` | Hour (24h) | `14` |
| `%I` | Hour (12h) | `02` |
| `%M` | Minutes | `30` |
| `%S` | Seconds | `45` |
| `%p` | AM/PM | `PM` |
| `%A` | Full weekday | `Monday` |
| `%a` | Short weekday | `Mon` |
| `%B` | Full month | `January` |
| `%b` | Short month | `Jan` |
| `%d` | Day (01-31) | `15` |
| `%e` | Day (1-31) | `15` |
| `%Y` | 4-digit year | `2024` |
| `%y` | 2-digit year | `24` |

---

## Configuration System

### Current Approach: settings-schema.json
Configuration lives in `settings-schema.json` and is read via `Settings.DeskletSettings`.
The grid options use standard settings keys, while the clock list is stored as a generic JSON array.

Example value for the `clocks` setting:
```json
[
  {
    "id": "uuid",
    "name": "Tokyo",
    "timezone": "Asia/Tokyo",
    "timeFormat": "%H:%M:%S",
    "dateFormat": "%A, %e %B",
    "timeSize": 40,
    "dateSize": 15,
    "timezoneSize": 12
  }
]
```

### Reading Configuration
```javascript
const Settings = imports.ui.settings;

_init: function(metadata, deskletId) {
    this.settings = new Settings.DeskletSettings(this, metadata.uuid, deskletId);
    this.settings.bind("grid-columns", "gridColumns", this._onLayoutChanged);
    this.settings.bind("clock-spacing", "clockSpacing", this._onLayoutChanged);
    this.settings.bind("clocks", "clocks", this._onClocksChanged);
}
```

---

## Localization

### Setup Gettext
```javascript
const Gettext = imports.gettext;
const UUID = "TimeAndDate@desklet.user";

// Bind text domain to locale directory
Gettext.bindtextdomain(UUID, GLib.get_home_dir() + "/.local/share/locale");

// Translation function
function _(str) {
    return Gettext.dgettext(UUID, str);
}

// Usage
this.setHeader(_("Time And Date"));
```

### Translation Workflow

#### Step 1: Extract Strings
```bash
cd cinnamon-world-clock-desklet@curbsoftware
xgettext --language=JavaScript --keyword=_ --output=po/TimeAndDate@desklet.user.pot desklet.js
```

#### Step 2: Create/Update Translation
```bash
# Create new translation
msginit --input=po/TimeAndDate@desklet.user.pot --locale=de --output=po/de.po

# Update existing translation
msgmerge --update po/de.po po/TimeAndDate@desklet.user.pot
```

#### Step 3: Edit Translation
Edit `po/de.po`:
```po
msgid "Time And Date"
msgstr "Zeit und Datum"

msgid "Edit Config"
msgstr "Konfiguration bearbeiten"
```

#### Step 4: Compile
```bash
mkdir -p ~/.local/share/locale/de/LC_MESSAGES
msgfmt po/de.po -o ~/.local/share/locale/de/LC_MESSAGES/TimeAndDate@desklet.user.mo
```

---

## Coding Patterns

### Pattern 1: Desklet with Timer
```javascript
function MyDesklet(metadata) {
    this._init(metadata);
}

MyDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function(metadata) {
        Desklet.Desklet.prototype._init.call(this, metadata);
        this.metadata = metadata;

        // Create UI
        this._container = new St.BoxLayout({ vertical: true });
        this._label = new St.Label({ text: "Loading..." });
        this._container.add(this._label);
        this.setContent(this._container);

        // Start update loop
        this._update();
    },

    _update: function() {
        // Update display
        this._label.set_text(new Date().toLocaleTimeString());

        // Schedule next update (returns timeout ID)
        this.timeout = Mainloop.timeout_add_seconds(1, Lang.bind(this, this._update));
    },

    on_desklet_removed: function() {
        // CRITICAL: Remove timeout to prevent memory leaks
        if (this.timeout) {
            Mainloop.source_remove(this.timeout);
        }
    }
};
```

### Pattern 2: Timezone Handling
```javascript
_updateDate: function() {
    let displayDate = new Date();
    let timezoneName = this.timezone;

    // Apply timezone if not "local"
    if (this.timezone && this.timezone !== "local") {
        try {
            // Convert to specified timezone
            const timeString = displayDate.toLocaleString("en-US", {
                timeZone: this.timezone
            });
            displayDate = new Date(timeString);

            // Use friendly name if available
            timezoneName = this.metadata["name"] || this.timezone;
        } catch (e) {
            global.logError("Invalid timezone: " + this.timezone);
            timezoneName = Intl.DateTimeFormat().resolvedOptions().timeZone;
        }
    } else {
        // For local, show system timezone identifier
        timezoneName = Intl.DateTimeFormat().resolvedOptions().timeZone;
    }

    this._time.set_text(displayDate.toLocaleFormat(this.timeFormat));
    this._date.set_text(displayDate.toLocaleFormat(this.dateFormat));
    this._timezoneLabel.set_text(timezoneName);
}
```

### Pattern 3: Context Menu Items
```javascript
_init: function(metadata) {
    // ... initialization code ...

    // Add separator to existing menu
    this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    // Add "Edit Config" action
    this._menu.addAction(_("Edit Config"), Lang.bind(this, function() {
        Util.spawnCommandLine("xdg-open " + this.configFile);
    }));

    // Add "Help" action
    this._menu.addAction(_("Help"), Lang.bind(this, function() {
        Util.spawnCommandLine("xdg-open " + this.helpFile);
    }));
}
```

### Pattern 4: Dynamic Styling
```javascript
_init: function(metadata) {
    // Create labels
    this._time = new St.Label();
    this._date = new St.Label();

    // Apply inline styles from configuration
    this._time.style = "font-size: " + this.timeSize;
    this._date.style = "font-size: " + this.dateSize;
}

// Or use style classes from stylesheet.css
this._time.add_style_class_name('time-label');
```

---

## Testing & Debugging

### Debug Logging
```javascript
// Information logging
global.log("Clock count: " + this._getClockList().length);

// Error logging with details
global.logError("Invalid timezone: " + timezone + ". Error: " + e);
```

### View Logs
```bash
# Watch logs in real-time
tail -f ~/.xsession-errors | grep -i TimeAndDate

# Or search for errors
grep -i "error\|TimeAndDate" ~/.xsession-errors
```

### Common Issues

#### Issue: Clock shows wrong time
**Cause**: Invalid timezone identifier
**Solution**: Use valid IANA timezone (e.g., `America/New_York`, not `EST`)

#### Issue: Timeout not removed on desklet removal
**Cause**: Missing cleanup in `on_desklet_removed`
**Symptoms**: Memory leak, possible crashes
**Solution**: Always call `Mainloop.source_remove(this._timeout)`

#### Issue: Configuration changes not applied
**Cause**: Settings cache not refreshed or desklet not reloaded
**Solution**: Reopen desklet settings or reload the desklet; restart Cinnamon if metadata changed

### Test Commands
```bash
# List valid timezones
timedatectl list-timezones | grep America

# Test timezone conversion in JavaScript console
node -e "console.log(new Date().toLocaleString('en-US', {timeZone: 'Asia/Tokyo'}))"
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
| Desklet Class | `cinnamon-docs/markdown/cinnamon-js-ui-desklet-Desklet.md` | Base desklet API |
| DeskletSettings | `cinnamon-docs/markdown/cinnamon-js-ui-settings-DeskletSettings.md` | Settings provider |
| PopupMenu | `cinnamon-docs/markdown/cinnamon-js-ui-popupMenu-section.md` | Menu widgets |

### External Resources
| Resource | URL | Content |
|----------|-----|---------|
| IANA Time Zones | https://www.iana.org/time-zones | Valid timezone identifiers |
| strftime Format | https://strftime.org/ | Date format reference |

---

## Example Code References

### Example Desklets (Local)
| Example | Path | Features Demonstrated |
|---------|------|-----------------------|
| Simple System Monitor | `cinnamon-docs/cinnamon-developer-docs/example-desklets/simple-system-monitor@ariel/5.8/` | Settings binding, periodic updates, styled labels |
| Command Result | `cinnamon-docs/cinnamon-developer-docs/example-desklets/commandResult@ZimiZones/` | Command execution, settings |
| KDE Connect | `cinnamon-docs/cinnamon-developer-docs/example-desklets/kdecdesklet@joejoetv/` | External API integration |

### Key Patterns from Examples

#### From simple-system-monitor (Update Loop)
```javascript
_updateWidget: function() {
    this._updateValues();
    this.timeout = Mainloop.timeout_add_seconds(1, Lang.bind(this, this._updateWidget));
}

on_desklet_removed: function() {
    Mainloop.source_remove(this.timeout);
}
```

#### From simple-system-monitor (Settings + Styling)
```javascript
this.titles.style = `color: ${this.font_color}; font-size: ${this.font_scale_size}em;`;
```

---

## Future Development

### Implementing Clock Grid

#### Phase 1: Multiple Clocks
- Create `ClockWidget` class for individual clock
- Store clock configurations in array
- Render multiple ClockWidgets in container

#### Phase 2: Add/Remove
- Add "Add Clock" button/menu item
- Create clock configuration dialog
- Implement clock removal

#### Phase 3: Drag-and-Drop
- Use `imports.ui.dnd` for drag-and-drop
- Implement drag source and drop target
- Persist clock order to settings

#### Phase 4: Grid Layout
- Use `St.Table` or `Clutter.GridLayout`
- Calculate optimal grid dimensions
- Handle responsive resizing

### Data Structure for Multiple Clocks
```json
{
  "clocks": [
    {
      "name": "Local",
      "timezone": "local",
      "timeFormat": "%H:%M",
      "position": 0
    },
    {
      "name": "Tokyo",
      "timezone": "Asia/Tokyo",
      "timeFormat": "%H:%M",
      "position": 1
    }
  ]
}
```

---

## Quick Reference Card

### Essential Imports
```javascript
const Desklet = imports.ui.desklet;
const St = imports.gi.St;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const GLib = imports.gi.GLib;
const Gettext = imports.gettext;
```

### Minimal Clock Template
```javascript
const Desklet = imports.ui.desklet;
const St = imports.gi.St;
const Lang = imports.lang;
const Mainloop = imports.mainloop;

function MyDesklet(metadata) {
    this._init(metadata);
}

MyDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function(metadata) {
        Desklet.Desklet.prototype._init.call(this, metadata);

        this._label = new St.Label({ text: "" });
        this.setContent(this._label);
        this._update();
    },

    _update: function() {
        this._label.set_text(new Date().toLocaleTimeString());
        this.timeout = Mainloop.timeout_add_seconds(1, Lang.bind(this, this._update));
    },

    on_desklet_removed: function() {
        Mainloop.source_remove(this.timeout);
    }
};

function main(metadata, desklet_id) {
    return new MyDesklet(metadata, desklet_id);
}
```

### Valid Timezone Examples
```
America/New_York     America/Los_Angeles    America/Chicago
Europe/London        Europe/Paris           Europe/Berlin
Asia/Tokyo           Asia/Shanghai          Asia/Singapore
Australia/Sydney     Pacific/Auckland
```

### Command Reference
```bash
# Reload Cinnamon
cinnamon --replace &

# Open settings
cinnamon-settings desklets TimeAndDate@desklet.user

# View logs
tail -f ~/.xsession-errors

# List timezones
timedatectl list-timezones
```
