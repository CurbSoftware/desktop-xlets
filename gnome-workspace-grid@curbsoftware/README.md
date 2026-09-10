# Workspace Grid for GNOME Shell

A clickable grid of named workspaces on the desktop. Click a tile to
switch, right-click it to rename or remove, use the "+" tile to add.
Drag the widget with Alt+left button. Live window previews are not
ported; tiles show names (optionally numbered).

Ported from the Cinnamon Workspace Grid desklet
(`cinnamon-workspace-grid-desklet@curbsoftware` in the same monorepo).
Workspace names are the `workspace-names` key of
`org.gnome.desktop.wm.preferences`. Adding and removing needs dynamic
workspaces off (GNOME Tweaks), because GNOME's dynamic workspaces own
the count.

## Install

```bash
gnome-extensions install --force gnome-workspace-grid@curbsoftware.zip
gnome-extensions enable gnome-workspace-grid@curbsoftware
```

## Development

See `DEVELOPMENT.md`. Headless tests:

```bash
gjs -m dev-tools/test-gnome-workspace-grid.js
```
