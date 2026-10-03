# World Clock for KDE Plasma

A grid of world timezone clocks as one plasmoid: drop it on the desktop
for the full grid, or on a panel for a compact clock that opens the
grid in a popup on click.

Ported from the Cinnamon World Clock desklet
(`cinnamon-world-clock-desklet@curbsoftware` in the same monorepo).
Qt's QML engine has no GLib and no full timezone support, so timezone
offsets come from a generated table (`contents/ui/lib/tzdata.js`,
produced by `dev-tools/gen-tz-table.py`, window 2020 to 2050). Month
and day names are English; that is a documented gap versus the Cinnamon
and GNOME ports.

## Install

```bash
kpackagetool6 --type=Plasma/Applet --install kde-world-clock
```

Then right-click the panel or desktop, choose Add Widgets, and place it.
The bundle AppImage can install and place it for you:
https://github.com/CurbSoftware/curb-desktop-widgets/releases/latest

## Development

See `DEVELOPMENT.md`. Headless tests:

```bash
node kde-world-clock/tests/test-tz.js
python3 dev-tools/test-tz-table.py
```
