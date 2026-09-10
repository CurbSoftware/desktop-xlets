# Workspace Grid for GNOME Shell: development notes

## Layout

- `extension.js`: composition root.
- `widget.js`: the desktop widget (tiles, menus, scroll, Alt+drag).
- `lib/gridModel.js`: pure grid and scroll model, ported from the
  Cinnamon module.
- `lib/workspaces.js`, `renameDialog.js`: copies shared with the
  Workspace Names port (see its DEVELOPMENT.md).
- `lib/store.js`, `lib/defaults.js`: JSON settings.

## Port notes

- Live window previews are not ported: GNOME window thumbnails need
  per-window Clutter clones and repainting, a project of their own.
  Tiles are name tiles (optionally numbered).
- Container mechanics (layer, Alt+drag, position persistence) work as
  in the world-clock port; see its DEVELOPMENT.md.
- Tile menus are standalone PopupMenus on Main.uiGroup, released by
  hand, mirroring the Cinnamon desklet.

## Headless tests

```bash
gjs -m dev-tools/test-gnome-workspace-grid.js
```

Covers the grid model (dims, cells, scroll target) and the shared
workspace-name logic on a fake settings object.

## Live checklist

1. Install and enable; the grid appears on the desktop at the stored
   position with one tile per workspace, active outlined.
2. Click switches; right-click opens Rename/Remove/Add; the "+" tile
   adds; Alt+drag repositions and the position survives restart.
3. Scroll switches workspaces per the setting.
4. With dynamic workspaces off: add/remove work; with it on the tiles
   still switch but editing is disabled.
5. Renames land in the org.gnome strv and both workspace extensions
   refresh.

## Versioning

Bump `metadata.json` `version` on every functional change.
