# Panel Profiles

A Cinnamon applet that saves your whole panel environment as a named profile
and restores it later, exactly. Panels, monitor placement, heights, autohide,
icon and text sizes, every applet in every zone, their order, and each
applet's own settings all come back as you saved them.

## Why it exists

Cinnamon usually remembers your panels. It forgets them in one specific place:
a multi-head VM where the second virtual display shows up after Cinnamon has
already started. You reboot the VM, Cinnamon boots with one monitor, and by
the time the second SPICE head appears the second panel and its applets are
gone. You recreate it by hand. Every reboot.

Panel Profiles fixes that. You set the panels up once, save the layout as a
profile, mark it as the startup profile, and the applet restores it after the
second display arrives. It is also just handy as a general panel-profile
manager: keep a Minimal profile, a Development profile, a Presentation
profile, and flip between them.

## Features

- Named profiles of the full panel state, not just a few settings.
- Exact restore of panel keys, applet placement, order and per-applet config.
- Restore previous layout: every load snapshots the current layout first, so
  you can undo a bad load.
- Startup recovery that waits for the displays your profile expects, then
  restores once they settle.
- Modified detection: the menu tells you when the active profile no longer
  matches the live panels.
- Overwrite, duplicate, rename and delete profiles from a native menu.
- Applet settings captured too, so a profile brings back each applet's config.

## Install

No root needed. The applet lives in your user directory.

Copy the folder straight into place:

```bash
cp -r cinnamon-panel-profiles-applet@curbsoftware \
      ~/.local/share/cinnamon/applets/
```

Or, from the monorepo root, use the installer:

```bash
./dev-tools/install-extensions.sh -n '*panel-profiles*'
```

Then add it to a panel: right-click a panel, choose Applets, find Panel
Profiles, click the plus. Put it on a panel of your primary monitor if you
want reliable startup recovery (see below).

## Use

The short version: save, break it, restore.

1. Set up your panels the way you want them.
2. Click Panel Profiles, then Save current layout, and give it a name.
3. Change whatever you like: move an applet, resize a panel, add a panel.
4. Click the profile in the menu. It comes back exactly.

The menu shows the active profile with a check, lists the rest, and reports
how many displays you have versus how many the active profile expects. When
you have changed things, the active row gains a Modified tag and the menu
offers Update and Restore previous layout.

Manage profiles from Manage profiles. From there you can load, rename,
duplicate, delete, or set a profile as the startup profile.

## Startup recovery

Mark one profile as the startup profile (Save dialog checkbox, or Manage
profiles, Set as startup). On the next Cinnamon start the applet checks the
live layout, waits for the displays the profile expects, and restores it.

Keep the applet on a panel of the primary monitor. Cinnamon starts the
primary monitor first, so that is where the applet exists early enough to do
its job. If it sits on a secondary monitor and startup recovery is on, it
tells you once to move it.

Settings, in the applet's settings dialog:

- Automatically restore startup profile
- Wait for required displays
- Display wait timeout
- Stabilization delay
- Capture applet settings
- Keep rollback history, and how many snapshots
- Success and warning notifications
- Debug logging

## Where profiles live

Everything is under:

```text
~/.config/cinnamon-panel-profiles/
    state.json
    profiles/<id>.json
    backups/last-good.json
```

- Profiles are the saved snapshots. One JSON file each.
- state.json tracks the active and startup profiles plus any in-flight
  restore.
- backups holds the rollback snapshot written before every load.

Directories are created mode 0700, files mode 0600. That means only your user
can read them.

## Privacy

A profile is not just panel geometry. It includes the raw configuration of
every applet it references, and applet configs can hold things like account
names, tokens, or other private values. Treat profile files as private. Do
not share them without checking what is inside. If you ever add an export
feature or hand a profile file to someone, review it first.

## Troubleshooting

The applet logs with a `[PanelProfiles]` prefix.

- Check `~/.xsession-errors` first: `tail -f ~/.xsession-errors | grep PanelProfiles`.
- `journalctl --user -f` also catches Cinnamon output on systemd sessions.
- Press `Win+L` for Looking Glass, then the Log and Extensions tabs.
- If Cinnamon was started with a custom stderr target during development, the
  log may be in a file like `/tmp/wpN-cinnamon.log` instead. `~/.xsession-errors`
  is the normal home for it.

Recovering a layout: load another profile from the menu, or Restore previous
layout to undo the last load. The rollback snapshot in
`~/.config/cinnamon-panel-profiles/backups/` is written before every load.

Full reset: remove the state directory. The applet rebuilds it on next start.

```bash
rm -rf ~/.config/cinnamon-panel-profiles
```

Your panel layout itself is untouched by that; you only lose saved profiles
and the startup designation.

If `state.json` is damaged, the applet renames it to a timestamped `.corrupt`
file, recreates a safe default, and leaves profile files untouched. If a
profile JSON is damaged, other profiles still load. Selecting the broken one
does not change Cinnamon.

## Development

See `DEVELOPMENT.md` for the module map, test commands and the live-test
workflow. Schema notes are in `docs/SCHEMA.md`. Manual VM checks are in
`docs/TESTING.md`. Live Cinnamon 6.6.9 inspection notes are in `RESEARCH.md`.
