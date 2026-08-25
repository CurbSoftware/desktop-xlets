# Development

How to build, test and iterate on the Panel Profiles applet.

## Module map

- `applet.js`: composition root. Lifecycle, menu, settings binding, dirty
  tracking, notifications, and the dependency injection that feeds the lib.
- `dialogs.js`: the Save dialog (new or replace, optional desklets) and shared
  confirmation modals. St/Clutter only, no lib imports, no require.
- `displayInfoWidget.py`: read-only custom settings widget (connected
  displays and the active profile's expectation) for
  cinnamon-settings.
- `profilesManagerWidget.py`: custom settings widget that lists profiles
  and performs rename/duplicate/delete directly on the profile files and
  state.json (cinnamon-settings runs in its own process; the applet
  re-reads profiles on every menu open).
- `lib/constants.js`: paths, `PANEL_SETTING_KEYS`, schema versions, dir/file
  modes, timings.
- `lib/logger.js`: `[PanelProfiles]` prefix, three levels, never logs config
  contents or home paths.
- `lib/atomicFile.js`: private-mode atomic writes (temp sibling plus rename,
  0600) and sha256.
- `lib/cinnamonState.js`: variant codec, capture/restore/verify, parsers,
  canonicalization, manager-anchor repair.
- `lib/appletConfigStore.js`: applet config capture/restore/watch plus the
  relative-path sanitization boundary.
- `lib/profileSchema.js`: validate and migrate profiles, ids and name rules.
- `lib/profileStore.js`: profile CRUD, state.json, and the single last-good
  recovery snapshot, serialized with a reentrant cross-process lock shared
  by the settings widget.
- `lib/monitorTopology.js`: topology read/match/wait over an injectable
  layout provider.
- `lib/applyController.js`: the apply transaction state machine and the
  in-process single-operation lock.

The lib modules have no St/Clutter imports and no require calls, so they load
headless. They share state through `setDependencies()`/`resetDependencies()`
seams. Public names use `var`/`function` so both require and the plain
`imports.<mod>` loader see them.

Legacy rollback-history settings remain as hidden generic schema keys. They
are compatibility placeholders only and are not part of the current single
last-good recovery model.

Related notes: `RESEARCH.md` (Cinnamon 6.6.9 live inspection),
`docs/SCHEMA.md` (profile JSON), `docs/TESTING.md` (manual VM checklist),
`fixtures/vm-two-screens.example.json` (sanitized example profile).

The UUID is `cinnamon-panel-profiles-applet@curbsoftware`. An older export
used `panel-profiles@curbsoftware.com`. Do not revive that UUID.

## Tests

Three headless suites, no Cinnamon session needed:

```bash
gjs dev-tools/test-pp-capture.js
XDG_CONFIG_HOME=$(mktemp -d) gjs dev-tools/test-pp-storage.js
XDG_CONFIG_HOME=$(mktemp -d) gjs dev-tools/test-pp-apply.js
```

The storage and apply suites refuse to run against your real config dir, so
they take a throwaway `XDG_CONFIG_HOME`. Capture is pure codec work and runs
straight.

The live acceptance driver walks the full spec section 41-49 matrix through
the running desktop:

```bash
python3 dev-tools/live-test-panel-profiles.py
```

It restores every panel key, the applet state dir and the applet config files
verbatim via atexit, and exits non-zero on any failing assertion.

## Reload rules

- Editing `applet.js` alone: reload via Looking Glass (Win+L, Extensions,
  Reload Code) or:
  `gdbus call --session --dest org.Cinnamon --object-path /org/Cinnamon \
    --method org.Cinnamon.ReloadXlet 'cinnamon-panel-profiles-applet@curbsoftware' APPLET`
- ReloadXlet re-runs applet.js but does NOT re-import `lib/` modules and does
  NOT re-read `stylesheet.css`. After editing anything under lib/ or the css,
  restart Cinnamon: `cinnamon --replace &`.

## Live-test safety

Before any live run:

- Note the coredump baseline: `coredumpctl list --no-pager | tail -2`. Stop
  live work on any new coredump.
- Kill drivers only with SIGTERM. The driver routes SIGTERM through sys.exit
  so atexit still restores. A plain `timeout` is fine; SIGKILL is not.
- The driver restores enabled-applets, next-applet-id, every panel key, the
  config files and the state dir verbatim, before it exits.

Log location: `~/.xsession-errors` normally. If Cinnamon was restarted with a
custom stderr target, point the driver at it with
`CINNAMON_LOG=/tmp/some-cinnamon.log`.

## Two-head VM procedure

The release-blocking scenario is a VM whose second head appears after Cinnamon
starts. Drive it through libvirt:

```bash
export CINNAMON_VM=linuxmint-user   # run `virsh list --all` first, override if needed
./dev-tools/vm-config.sh bridge      # one-time: bridged networking
./dev-tools/vm-config.sh start       # boot the VM, prints its IP
./dev-tools/vm-config.sh ssh         # then install the applet there
./dev-tools/vm-config.sh console     # open virt-viewer
```

Manual detach-window procedure, when you cannot script the display arrival:

1. Set up the two-panel layout and save it.
2. Shut down. Start the VM with only the first head attached, or detach the
   second virt-viewer window.
3. Boot. Cinnamon comes up with one monitor and nothing restores on its own.
4. Click the saved profile: the applet shows Waiting for displays.
5. Reattach the second window. Cinnamon sees the monitor, the applet waits
   for the stabilization delay, then restores the profile.
6. Confirm the second panel and its applets are back and the profile verified.

## Known Cinnamon 6.6 landmine

Cinnamon 6.6 can segfault when a `St.ScrollView` is torn down with children
still in it. `destroy_all_children()` frees children in place, and a style
recompute already in flight then walks a freed widget
(`st_scroll_view_style_changed` on freed memory).

The fix, used in `dialogs.js`:

- Unparent every child before destroying it (`_clearContainer`), so the style
  cascade only ever sees live actors.
- Do not put a `Tooltip` or initial key focus on a row inside a scroll list.
  `_statusIcon` uses `accessible_name` instead of a tooltip, and the manage
  dialog focuses the scroll view itself, never a row button.
