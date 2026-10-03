# Workspace Names for KDE Plasma

One button per virtual desktop; click to switch. In a panel the
compact form shows the current desktop name and opens the full button
row in a popup.

Ported from the Cinnamon In Panel Workspace Name applet. Desktop names
come from KWin through the virtualdesktops dataengine; rename them in
System Settings, which is KDE's native flow.

## Install

```bash
kpackagetool6 --type=Plasma/Applet --install kde-workspace-names
```

To install every CurbSoftware widget for this desktop (and Cinnamon or
GNOME) in one download, use the bundle AppImage:
https://github.com/CurbSoftware/curb-desktop-widgets/releases/latest

## Development

See `DEVELOPMENT.md`.
