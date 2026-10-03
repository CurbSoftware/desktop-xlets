# Workspace Grid Desklet – Technical Review & Re-Implementation Plan

## 1. Objective  
Deliver a **stable, theme-friendly** Cinnamon desklet that:  
* Shows a *grid* of all current workspaces with their names.  
* Highlights the *active* workspace (border).  
* Lets the user *click* a tile to switch workspaces.  
* Adapts size automatically; default window ≈ 600 × 400 (landscape) or user-configured.  
* Provides settings: layout mode (auto/fixed), rows, columns, tile spacing, show index, scroll-wheel behaviour, width & height.  

## 2. Current Code Inventory & Issues  

### desklet.js  
| Function / Section | Purpose | Observations / Required Changes |
|--------------------|---------|---------------------------------|
| [`desklet.js:_init()`](desklets/workspace-grid-desklet@cinnamon-docs/desklet.js:17) | Instantiate settings, container, signals, then `_rebuildGrid()` | • **`this.buttons` never initialised** → crash<br>• Creates `WorkspaceController` (forces WM grid; not required & risky). |
| [`desklet.js:on_setting_changed()`](desklets/workspace-grid-desklet@cinnamon-docs/desklet.js:45) | Re-apply size + rebuild | Should debounce; fine otherwise. |
| [`desklet.js:_rebuildGrid()`](desklets/workspace-grid-desklet@cinnamon-docs/desklet.js:51) | Create `St.Table` of buttons | • Uses **undeclared `dims`** → crash.<br>• Doesn’t clear `this.buttons`.<br>• `homogeneous:false` gives uneven tiles.<br>• Table recreated but not destroyed on subsequent rebuilds. |
| [`desklet.js:_onWorkspaceButtonClicked()`](desklets/workspace-grid-desklet@cinnamon-docs/desklet.js:86) | Activate clicked workspace | OK. |
| [`desklet.js:_computeGridDims()`](desklets/workspace-grid-desklet@cinnamon-docs/desklet.js:107) | Determine rows/cols | Correct, but not invoked. |
| [`desklet.js:_update()`](desklets/workspace-grid-desklet@cinnamon-docs/desklet.js:118) | Add/remove `outlined` class | Needs initial call; add workspace-added/removed listeners. |
| **Missing** | – | • `destroy()` override to disconnect signals.<br>• Scroll-wheel handler.<br>• Resize/allocation listener to adjust tile aspect. |

### WorkspaceController.js  
[`WorkspaceController.js:set_workspace_grid()`](desklets/workspace-grid-desklet@cinnamon-docs/WorkspaceController.js:13) overrides Cinnamon workspace layout. This desklet is meant to be **read-only**, so the helper is unnecessary and can cause crashes (e.g., negative rows in `release_control`). **Plan:** *Remove file* and related calls.

### stylesheet.css  
Static rgba colours; better to inherit Cinnamon variables (`@theme_bg_color`, `@theme_selected_bg_color`). Provide size/spacing via CSS variables, reduce hard-coding.

### settings-schema.json  
Comprehensive, matches requirements. Need code side support for `scroll-wheel-behavior`.

## 3. Crash Root Cause  
Startup -> `_rebuildGrid()` → reference to **`dims`** (undefined) → JS exception aborts xlet, cascading into Cinnamon crash. Secondary: `this.buttons` undefined.

## 4. Best-Practice References  
* [`workspace-grid@hernejj 5.6`](example-applets/workspace-grid@hernejj/5.6/applet.js:1) – clean grid build, button list tracking, update signals.  
* [`commandResult@ZimiZones`](example-desklets/commandResult@ZimiZones/desklet.js:1) – rock-solid settings binding & destroy cleanup.  
* [`GridStyle.js`](example-applets/workspace-grid@hernejj/5.6/GridStyle.js:1) – pseudo-class management.

## 5. Re-Implementation Plan  

1. **Refactor/Remove WorkspaceController** – Make desklet *passive*.  
2. **desklet.js rewrite**  
   * Initialise `this.buttons = []`.  
   * In `_rebuildGrid()` call `const dims = this._computeGridDims();`.  
   * Clear container & `this.buttons`, build `St.Table { homogeneous:true }`.  
   * Push each button to `this.buttons`.  
   * After build, invoke `_update()`.  
3. **Signals**  
   * `switch-workspace` (exists).  
   * `workspace-added`, `workspace-removed`, `workspace-name-changed` → rebuild/update.  
   * Disconnect all in `on_desklet_removed`.  
4. **Scroll Wheel**  
   * If behaviour ≠ `off`, connect `scroll-event` on main container; compute next ws index by row/col.  
5. **Settings binding** – Use immediate callbacks; optionally debounce heavy rebuilds with `GLib.idle_add`.  
6. **Size Handling** – Use actor’s natural size; if width/height setting available, set container min/width/height. Provide sensible defaults (600×400).  
7. **CSS**  
   * Inherit colours: `background-color: shade(@desat_bg_color, 1.1);` etc.  
   * Use `.workspace-button:selected` or custom pseudo-class for active highlight.  
8. **Documentation** – Update README with new behaviour & installation notes.  
9. **Testing Matrix**  
   * Multiple workspace counts (1-16).  
   * Workspace add/remove.  
   * Rename workspaces.  
   * Desklet resize ≤200 px.  
   * Theme switch (dark/light).  

## 6. Deliverables  
* Updated `desklet.js` (core logic).  
* **Remove** `WorkspaceController.js`.  
* Updated `stylesheet.css`.  
* New `TECHNICAL_PLAN.md` (this file).  
* README.md enhancements.  
