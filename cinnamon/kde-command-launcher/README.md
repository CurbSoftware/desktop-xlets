# Command Launcher for KDE Plasma

A panel button that launches a configured application or .desktop
entry: application id (org.kde.kate), .desktop file name, or absolute
path. Empty entry opens the configuration.

Ported from the Cinnamon Command Launcher applet. KDE removed the
executable dataengine, and QML plasmoids cannot spawn shell commands
without a C++ helper, so arbitrary shell commands are not supported
yet; `contents/ui/lib/launcher.js` is the seam to swap when a helper
lands.

## Install

```bash
kpackagetool6 --type=Plasma/Applet --install kde-command-launcher
```

To install every CurbSoftware widget for this desktop (and Cinnamon or
GNOME) in one download, use the bundle AppImage:
https://github.com/CurbSoftware/curb-desktop-widgets/releases/latest

## Development

See `DEVELOPMENT.md`. Headless tests:

```bash
node kde-command-launcher/tests/test-launcher.js
```
