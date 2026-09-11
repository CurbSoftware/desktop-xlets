# Command Launcher for GNOME Shell

A panel button that runs a configured command. Middle-click the icon
to run it directly; left-click opens a small menu with Run and
Preferences. Optional pkexec prefix, working directory override, and
start/end notifications.

Ported from the Cinnamon Command Launcher applet
(`command-launcher@curbsoftware` in the same monorepo). Settings live
in `~/.config/gnome-command-launcher@curbsoftware/settings.json`. The
keybinding is not ported: GNOME keybindings need a compiled gschema.
Extensions are single-instance on GNOME, so one launcher per install.

## Install

```bash
gnome-extensions install --force gnome-command-launcher@curbsoftware.zip
gnome-extensions enable gnome-command-launcher@curbsoftware
```

To install every CurbSoftware widget for this desktop (and Cinnamon or
Plasma) in one download, use the bundle AppImage:
https://github.com/CurbSoftware/curb-desktop-widgets/releases/latest

## Development

See `DEVELOPMENT.md`.
