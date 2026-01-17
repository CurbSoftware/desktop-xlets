# Workspace Grid Desklet: Analysis and Refactoring Plan

## 1. Project Overview

The goal of this project is to create a Cinnamon desklet that displays a grid of workspaces, allows the user to switch between them, and highlights the active workspace. The desklet should be stable, correctly sized, and visually appealing.

## 2. Current State of the Code

The desklet is currently in a non-functional state. It crashes Cinnamon upon loading, and it is not visible on the desktop. The codebase has undergone several unsuccessful attempts to fix these issues, and it is now in a state of disarray.

## 3. Analysis of the Problem

The root cause of the problems is a fundamental misunderstanding of the Cinnamon desklet architecture. The previous attempts to fix the issues were based on incorrect assumptions about how desklets are created, sized, and rendered.

The key issues are:

*   **Incorrect Import of `WorkspaceController.js`:** The `desklet.js` file is not correctly importing the `WorkspaceController.js` file, which is causing a `TypeError` and preventing the desklet from loading.
*   **Incorrect Layout and Sizing:** The desklet is not using the correct layout and sizing mechanisms, which is causing it to either render at an impossibly large size or not be visible at all.
*   **Lack of a Clear Architecture:** The code is not well-structured, which has made it difficult to debug and maintain.

## 4. Analysis of the Examples

A thorough analysis of the `simple-system-monitor@ariel` and `TimeAndDate@desklet.phil` desklets has revealed the following best practices:

*   **Use a Top-Level Container:** All UI elements should be placed within a top-level container, such as a `St.BoxLayout` or a `St.Bin`. This container should be given a fixed size, and it should be the only child of the `Desklet.Desklet` object.
*   **Use `imports` for Local Files:** Local JavaScript files should be imported using the `imports` object with the desklet's UUID.
*   **Use `on_desklet_removed` for Cleanup:** The `on_desklet_removed` function should be used to disconnect all signals and perform any other necessary cleanup.

## 5. Refactoring Plan

The desklet will be refactored from the ground up, following the best practices identified in the example desklets. The refactoring will be done in the following steps:

1.  **Create a Stable Foundation:** The `desklet.js` file will be rewritten to create a simple, visible, and correctly sized desklet that does nothing but display a colored box. This will be the foundation upon which the rest of the desklet will be built.

2.  **Implement the Workspace Grid:** The workspace grid will be implemented using a `St.Table` wrapped in a `St.ScrollView`. The `St.ScrollView` will be added to the main container, and it will be given a fixed size.

3.  **Implement the Workspace Controller:** The `WorkspaceController.js` file will be corrected to export the `WorkspaceController` class, and the `desklet.js` file will be corrected to import it correctly.

4.  **Implement the Workspace Switching Logic:** The workspace switching logic will be implemented in the `_onWorkspaceButtonClicked` function.

5.  **Implement the Active Workspace Highlighting:** The active workspace highlighting will be implemented in the `_update` function.

6.  **Implement the Settings:** The settings will be implemented in the `settings-schema.json` file, and the `desklet.js` file will be updated to use them.

## 6. Code Implementation

The following is a detailed breakdown of the code that will be implemented in each step of the refactoring process.

### Step 1: Create a Stable Foundation

The `desklet.js` file will be rewritten as follows:

```javascript
/* global imports */
const Desklet = imports.ui.desklet;
const St = imports.gi.St;
const Lang = imports.lang;

function MyDesklet(metadata, deskletId) {
    this._init(metadata, deskletId);
}

MyDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function (metadata, deskletId) {
        Desklet.Desklet.prototype._init.call(this, metadata, deskletId);

        this.mainContainer = new St.BoxLayout({
            width: 300,
            height: 200,
            style: "background-color: red;"
        });

        this.setContent(this.mainContainer);
    }
};

function main(metadata, deskletId) {
    return new MyDesklet(metadata, deskletId);
}
```

### Step 2: Implement the Workspace Grid

The `_init` function in `desklet.js` will be modified as follows:

```javascript
    _init: function (metadata, deskletId) {
        Desklet.Desklet.prototype._init.call(this, metadata, deskletId);

        this.settings = new Settings.DeskletSettings(this, this.metadata["uuid"], deskletId);
        this.settings.bind("width", "width", this.on_setting_changed);
        this.settings.bind("height", "height", this.on_setting_changed);

        this.mainContainer = new St.BoxLayout({
            vertical: true,
            width: this.width,
            height: this.height,
            style_class: 'workspace-grid-container'
        });

        this.setContent(this.mainContainer);

        this._rebuildGrid();
    },
```

The `_rebuildGrid` function will be added to `desklet.js`:

```javascript
    _rebuildGrid: function () {
        this.mainContainer.destroy_all_children();

        const table = new St.Table({ homogeneous: false, reactive: true });

        const scrollView = new St.ScrollView({
            x_fill: true,
            y_fill: true,
            y_align: St.Align.START,
            style_class: 'v-scroll'
        });
        scrollView.add_actor(table);
        this.mainContainer.add(scrollView, { expand: true, x_fill: true, y_fill: true });
    },
```

### Step 3: Implement the Workspace Controller

The `WorkspaceController.js` file will be modified as follows:

```javascript
const TOPLEFT = imports.gi.Meta.DisplayCorner.TOPLEFT;

var WorkspaceController = class {
    constructor(cols, rows) {
        this._init(cols, rows);
    }

    _init(cols, rows) {
        this.set_workspace_grid(cols, rows);
    }

    // Create proper workspace layout geometry within Gnome
    set_workspace_grid(cols, rows) {
        this.cols = cols;
        this.rows = rows;
        this.__equalize_num_workspaces();
        global.workspace_manager.override_workspace_layout(TOPLEFT, false, rows, cols);
    }

    // Update Gnome's view of workspaces to reflect our count based on row*col.
    __equalize_num_workspaces() {
        let new_ws_count = this.cols * this.rows;
        let old_ws_count = global.workspace_manager.n_workspaces;

        if (new_ws_count > old_ws_count) {
            for (let i = old_ws_count; i < new_ws_count; i++)
                global.workspace_manager.append_new_workspace(false, global.get_current_time());
        }
        else if (new_ws_count < old_ws_count) {
            for (let i = old_ws_count; i > new_ws_count; i--) {
                let ws = global.workspace_manager.get_workspace_by_index(global.workspace_manager.n_workspaces - 1);
                global.workspace_manager.remove_workspace(ws, global.get_current_time());
            }
        }
    }

    // This applet is going away. Revert to allowing Cinnamon to control workspaces.
    release_control() {
        this.set_workspace_grid(-1, 1); // Set to no rows, and a single desktop
    }
};
```

The `desklet.js` file will be modified to import the `WorkspaceController` correctly:

```javascript
// Import the new WorkspaceController
const WorkspaceController = imports.desklets[uuid].WorkspaceController;
```

### Step 4: Implement the Workspace Switching Logic

The `_rebuildGrid` function in `desklet.js` will be modified to create the workspace buttons and connect them to the `_onWorkspaceButtonClicked` function:

```javascript
    _rebuildGrid: function () {
        this.mainContainer.destroy_all_children();
        this.buttons = [];

        const dims = this._computeGridDims();
        const table = new St.Table({ homogeneous: false, reactive: true });

        const scrollView = new St.ScrollView({
            x_fill: true,
            y_fill: true,
            y_align: St.Align.START,
            style_class: 'v-scroll'
        });
        scrollView.add_actor(table);
        this.mainContainer.add(scrollView, { expand: true, x_fill: true, y_fill: true });

        for (let r = 0; r < dims.rows; r++) {
            for (let c = 0; c < dims.cols; c++) {
                const i = r * dims.cols + c;
                if (i >= this._getWorkspaceCount()) break;

                const button = new St.Button({
                    style_class: 'workspace-button',
                    reactive: true,
                    can_focus: true,
                    label: this._getWorkspaceName(i)
                });
                button.index = i;
                button.connect('clicked', Lang.bind(this, this._onWorkspaceButtonClicked));
                button.set_style("margin:" + Math.max(0, this.tileSpacing) + "px;");

                this.buttons.push(button);
                table.add(button, { row: r, col: c, x_expand: true, y_expand: true, x_fill: true, y_fill: true });
            }
        }
    },
```

The `_onWorkspaceButtonClicked` function will be added to `desklet.js`:

```javascript
    _onWorkspaceButtonClicked: function (actor) {
        const ws = global.workspace_manager.get_workspace_by_index(actor.index);
        if (ws) {
            ws.activate(global.get_current_time());
        }
    },
```

### Step 5: Implement the Active Workspace Highlighting

The `_update` function will be added to `desklet.js`:

```javascript
    _update: function () {
        const active_ws_index = global.workspace_manager.get_active_workspace_index();
        for (let i = 0; i < this.buttons.length; i++) {
            const button = this.buttons[i];
            if (button.index === active_ws_index) {
                button.add_style_pseudo_class('outlined');
            } else {
                button.remove_style_pseudo_class('outlined');
            }
        }
    }
```

The `_init` function in `desklet.js` will be modified to connect to the `switch-workspace` signal:

```javascript
        this.switch_id = global.window_manager.connect('switch-workspace', Lang.bind(this, this._update));
```

### Step 6: Implement the Settings

The `settings-schema.json` file will be updated to include all the necessary settings:

```json
{
  "layout": {
    "type": "header",
    "description": "Layout"
  },
  "layout-mode": {
    "type": "combobox",
    "default": "auto",
    "description": "Grid layout mode",
    "options": {
      "Auto (near-square)": "auto",
      "Fixed (rows x cols)": "fixed"
    }
  },
  "fixed-rows": {
    "type": "spinbutton",
    "default": 2,
    "min": 1,
    "max": 10,
    "step": 1,
    "units": "rows",
    "description": "Rows (fixed layout)",
    "dependency": "layout-mode=fixed"
  },
  "fixed-cols": {
    "type": "spinbutton",
    "default": 2,
    "min": 1,
    "max": 10,
    "step": 1,
    "units": "cols",
    "description": "Columns (fixed layout)",
    "dependency": "layout-mode=fixed"
  },

  "labels": {
    "type": "header",
    "description": "Labels"
  },
  "show-index": {
    "type": "checkbox",
    "default": false,
    "description": "Prefix names with index (1-based)"
  },

  "behavior": {
    "type": "header",
    "description": "Behavior"
  },
  "scroll-wheel-behavior": {
    "type": "combobox",
    "default": "off",
    "description": "Scroll wheel switches workspaces",
    "options": {
      "Off": "off",
      "By column": "col",
      "By row": "row"
    }
  },

  "style": {
    "type": "header",
    "description": "Style"
  },
  "tile-spacing": {
    "type": "spinbutton",
    "default": 4,
    "min": 0,
    "max": 24,
    "step": 1,
    "units": "px",
    "description": "Tile spacing"
  },
  "width": {
    "type": "spinbutton",
    "default": 600,
    "min": 200,
    "max": 2000,
    "step": 50,
    "units": "px",
    "description": "Desklet width"
  },
  "height": {
    "type": "spinbutton",
    "default": 400,
    "min": 200,
    "max": 2000,
    "step": 50,
    "units": "px",
    "description": "Desklet height"
  }
}
```

## 7. Conclusion

This refactoring plan provides a clear and comprehensive path to fixing the issues with the Workspace Grid desklet. By following this plan, I am confident that I can create a stable, functional, and well-structured desklet that meets all the user's requirements.