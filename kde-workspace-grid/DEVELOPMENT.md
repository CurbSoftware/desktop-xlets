# Workspace Grid for KDE Plasma: development notes

## Layout

- `contents/ui/main.qml`: engine-backed tile grid, compact panel
  representation.

## Port notes

- Desktops, names, rows and the current desktop come from the
  virtualdesktops dataengine; switching goes through its activate
  service. Add, remove and rename stay in System Settings (native KDE
  UX) rather than through tile menus.
- Tile columns derive from the engine's row count, mirroring the
  Cinnamon fixed-row layout without a second setting.

## Live checklist (needs a Plasma 6 session)

1. Install, add to desktop and panel.
2. Tiles match the desktops configured in System Settings; clicking
   switches; the active tile is outlined.
3. Adding or renaming a desktop in System Settings updates the grid
   without a restart.
4. Both a light and a dark Plasma theme.

## Versioning

Bump `KPlugin.Version` on every functional change.
