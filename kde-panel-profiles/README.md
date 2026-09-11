# Plasma Layouts for KDE Plasma

Save the current Plasma layout (panels, widgets, their configuration)
as a named profile, and restore it later. Related to the Cinnamon
Panel Profiles applet (`cinnamon-panel-profiles-applet@curbsoftware`
in the same monorepo); the KDE domain file is
`~/.config/plasma-org.kde.plasma.desktop-appletsrc`, and restoring
restarts plasmashell.

Saving always works. Restoring needs the executable dataengine, which
newer Plasma builds removed; when it is absent the plasmoid says so
and the saved profile is still hand-appliable.

## Install

```bash
kpackagetool6 --type=Plasma/Applet --install kde-panel-profiles
```

To install every CurbSoftware widget for this desktop (and Cinnamon or
GNOME) in one download, use the bundle AppImage:
https://github.com/CurbSoftware/curb-desktop-widgets/releases/latest

## Development

See `DEVELOPMENT.md`. Headless tests:

```bash
node kde-panel-profiles/tests/test-layouts.js
```
