# Workspace Names for GNOME Shell

One panel button per workspace. Click to switch, right-click to rename,
scroll to move between workspaces. The active workspace is outlined.

Ported from the Cinnamon In Panel Workspace Name applet
(`cinnamon-workspace-names-applet@curbsoftware` in the same monorepo).
Workspace names are the `workspace-names` key of
`org.gnome.desktop.wm.preferences`; the extension pads and trims the
array itself. Adding and removing needs dynamic workspaces off
(GNOME Tweaks), because GNOME's dynamic workspaces own the count.

## Install

```bash
gnome-extensions install --force gnome-workspace-names@curbsoftware.zip
gnome-extensions enable gnome-workspace-names@curbsoftware
```

To install every CurbSoftware widget for this desktop (and Cinnamon or
Plasma) in one download, use the bundle AppImage:
https://github.com/CurbSoftware/curb-desktop-widgets/releases/latest

## Development

See `DEVELOPMENT.md`. Headless tests:

```bash
gjs -m dev-tools/test-gnome-workspace-names.js
```
