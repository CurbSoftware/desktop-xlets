# Manual tests

Headless suites (no Cinnamon session):

```bash
gjs dev-tools/test-pp-capture.js
XDG_CONFIG_HOME=$(mktemp -d) gjs dev-tools/test-pp-storage.js
XDG_CONFIG_HOME=$(mktemp -d) gjs dev-tools/test-pp-apply.js
```

The storage suite starts a short Python settings-widget worker to exercise
real cross-process lock contention against the GJS store.

Live acceptance driver (running Cinnamon desktop):

```bash
python3 dev-tools/live-test-panel-profiles.py
```

The following must be run on a Cinnamon session. Items marked **release blocker** are required before calling the virt-viewer scenario done.

## Install

- [ ] From the monorepo root, `./dev-tools/install-extensions.sh -m symlink -n '*panel-profiles*'` succeeds without sudo
- [ ] Applet appears under Applets after Cinnamon restart (`Alt-F2`, `r`)
- [ ] Adding it to the primary panel shows a compact symbolic icon
- [ ] Left-click opens a native Cinnamon popup, not a GTK/Electron window

## Save / manage

- [ ] First click with no profiles shows the empty-state copy
- [ ] **Save current layout…** requires a non-empty name, max 80 characters,
      and offers an **Include desklets** checkbox
- [ ] Duplicate names warn but still save (IDs are UUIDs)
- [ ] The settings window's profiles page: Rename, Duplicate (`Name Copy`,
      new UUID), Delete with confirm
- [ ] Deleting the active profile does not change the desktop
- [ ] Deleting the active profile clears its bold row from the menu on the
      next open

## Restore

- [ ] Profile A: two bottom panels, heights 40/40, known applet order
- [ ] Profile B: one panel, different height and applets
- [ ] Load A, verify; load B, verify; load A again: at least five A↔B cycles
- [ ] No duplicate applet instances accumulate
- [ ] Panel monitor assignment, height, autohide, icon/text sizes restore
- [ ] Zones and order restore after a manual reorder
- [ ] Configurable applet (calendar, grouped window list, or menu): config A in profile A, config B in profile B, both round-trip

## Manager self-preservation

- [ ] Import or hand-edit a profile JSON with `cinnamon-panel-profiles-applet@curbsoftware` removed from `enabled-applets`
- [ ] Load it: the applet injects itself using the running instance ID and remains on a panel

## Missing third-party applet

- [ ] Save a layout that includes a third-party applet
- [ ] Move that applet's directory aside
- [ ] Load the profile: no crash, remaining layout restores, one warning, no download

## Rollback

- [ ] Load a valid profile (creates `backups/last-good.json`)
- [ ] A deliberately invalid profile is rejected before `enabled-applets` changes
- [ ] The rollback machinery restores panels, applets and desklets

## Corrupt files

- [ ] Truncate `state.json`: applet still loads, `.corrupt` backup appears, profiles remain
- [ ] Truncate one profile JSON: other profiles still work; selecting the broken one does not alter Cinnamon

## Rapid clicks

- [ ] Click several profiles quickly: only one restore runs; menu actions stay disabled until idle

## Dirty state

- [ ] Load a profile, move an applet: its row shows **Modified** and the menu
      offers **Update profile "Name"**
- [ ] Load a profile that includes desklets, move a desklet: its row shows
      **Modified** and offers the same update action
- [ ] Update writes a new snapshot and clears Modified
- [ ] Settings changes during an in-progress restore do not flip dirty/apply loops

## Cinnamon restart

- [ ] After save, load, modify: restart Cinnamon (`r`)
- [ ] Nothing restores on its own at boot; metadata and profiles persist;
      no duplicate Panel Profiles instances

## Apply-time display wait (one display)

- [ ] A profile captured on 2 monitors, applied with 1 connected
- [ ] The menu shows the waiting row; after the timeout: layout unchanged,
      **one** warning, no retry loop
- [ ] User can still load a one-monitor profile manually

## Two-head virt-viewer reboot (**release blocker**)

Environment: Linux Mint Cinnamon VM, libvirt/QEMU/KVM, SPICE, virt-viewer, two virtual heads.

1. With both heads connected, create two bottom panels (primary + secondary) and customize applets on each.
2. Save as **VM Two Screens**.
3. Reboot the VM (or restart virt-viewer so the second head appears late).
4. Cinnamon starts with one monitor; nothing restores on its own at boot.
5. Click **VM Two Screens**: the applet waits (`Waiting for displays…`),
   the second SPICE head appears, and after ~2s stabilization the saved
   layout restores.
6. Expected: second panel, applets, order, and applet settings return;
   Looking Glass shows `[PanelProfiles] verification succeeded`.

If this environment cannot be driven from the agent, run the steps above by hand before release. Headless suites cover wait/timeout/stabilize logic; the live driver covers the desktop matrix.

## Manual-only checks (not drivable headless or via the live driver)

- [ ] Restart Cinnamon menu item restarts Cinnamon (X11; on Wayland it logs
      a warning and does nothing)
- [ ] The settings window shows the display-info row (connected count plus
      the active profile's expected count)
- [ ] Profiles manager widget: rename, duplicate, delete round-trip; the
      new name/row appears in the panel menu on its next open without a
      restart
- [ ] Deleting the active profile clears its bold row from the menu on the
      next open
- [ ] Unreadable profile rows show in the widget and are deletable
- [ ] The active profile renders bold at the top of the profile list

## Logging checks

```bash
# Looking Glass Log tab, or:
journalctl --user -b | grep PanelProfiles
```

Confirm captured spice JSON is **not** printed.
