# Workspace Grid for KDE Plasma

A clickable grid of the virtual desktops: drop it on the desktop for
the full grid, or on a panel for the current desktop number with the
grid in a popup. Click a tile to switch.

Ported from the Cinnamon Workspace Grid desklet. KDE owns desktop
naming and layout natively, so adding, removing and renaming happen in
System Settings under Virtual Desktops; the tiles read KWin through
the virtualdesktops dataengine. Live window previews are not ported.

## Install

```bash
kpackagetool6 --type=Plasma/Applet --install kde-workspace-grid
```

To install every CurbSoftware widget for this desktop (and Cinnamon or
GNOME) in one download, use the bundle AppImage:
https://github.com/CurbSoftware/curb-desktop-widgets/releases/latest

## Development

See `DEVELOPMENT.md`.
