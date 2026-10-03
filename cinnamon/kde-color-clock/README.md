# Color Timer Clock for KDE Plasma

Clock, timer and chronometer cards whose background colors ramp along
per-card schedules: the clock by time of day, the timer by seconds
remaining, the chronometer by seconds elapsed. Controls sit on the
cards; the footer counts down to the next color. Timer and chronometer
state persists in the plasmoid configuration.

Ported from the Cinnamon Color Timer Clock desklet. Not ported: desktop
notifications (QML plasmoids have no notification API without a C++
helper) and per-card smooth toggles (QML animates ramps globally).

## Install

```bash
kpackagetool6 --type=Plasma/Applet --install kde-color-clock
```

To install every CurbSoftware widget for this desktop (and Cinnamon or
GNOME) in one download, use the bundle AppImage:
https://github.com/CurbSoftware/curb-desktop-widgets/releases/latest

## Development

See `DEVELOPMENT.md`. Headless tests:

```bash
node kde-color-clock/tests/test-color-engine.js
```
