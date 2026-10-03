# Workspace Grid Development

## Runtime structure

- `desklet.js` owns actors, settings, signals, previews, menus, and cleanup.
- `gridModel.js` contains pure grid and scroll calculations.
- `previewGeometry.js` contains pure clipping and scaling calculations.
- `workspaceActions.js` wraps Cinnamon workspace queries and mutations.
- `renameDialog.js` owns the modal rename prompt.
- `stylesheet.css` uses `curb-workspace-grid-*` classes.

`workspaceActions.js` and `renameDialog.js` are byte-identical to copies in
In Panel Workspace Name applet. Headless tests enforce this.

## Grid invariants

- Every workspace always receives a tile.
- Add tile follows workspace tiles and never displaces one.
- Auto mode creates a near-square grid.
- Fixed mode keeps requested column count and expands row count as needed.
- Active tile uses Cinnamon's `outlined` pseudo class.
- Scroll accepts only up and down directions and throttles switches to 220 ms.
- Partial final rows remain reachable.

## Preview mode

Each visual tile retains its workspace name. The preview fits the union of all
monitor work areas without changing its aspect ratio, then paints a separate
bounded surface for every monitor. Clipped drawing layers map interesting,
non-minimized, unobscured windows into that same geometry. Windows sort from
oldest to newest user time. Each rectangle and icon pair enters the actor stack
together, preserving visual stacking. Focused windows use stronger color. App
icons appear only when their window rectangle can contain them. Preview
dimensions can shrink below 48 by 32 pixels, so dense grids do not exceed
configured desklet bounds.

Preview signals cover window add, remove, move, resize, minimize, focus, and
monitor changes. Rebuilds reconnect these through a dedicated `SignalManager`.
Names mode disconnects all preview-only signals.

## Lifecycle rules

- `destroy` and `on_desklet_removed` both call idempotent `_cleanup()`.
- Remove every timeout and deferred action source.
- Destroy popup menus and leftover tooltips explicitly.
- Disconnect stable and preview signal managers.
- Disconnect the workspace-name GSettings watcher.
- Finalize settings once.
- Desklet DND belongs to Cinnamon. Keep the grid table and tiles non-reactive.
  Never change private draggable state or synthesize pointer releases.

## Verification

```sh
node --check cinnamon-workspace-grid-desklet@curbsoftware/desklet.js
python3 -m json.tool cinnamon-workspace-grid-desklet@curbsoftware/settings-schema.json
gjs dev-tools/test-workspace-actions.js
python3 dev-tools/live-test-desklet.py
```

Live tests restore workspace count, names, active workspace, modal state, and
settings after add, remove, rename, overflow, preview, and teardown coverage.
