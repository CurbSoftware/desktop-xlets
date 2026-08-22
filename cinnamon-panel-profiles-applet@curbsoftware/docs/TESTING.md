# Manual tests

Headless suites (no Cinnamon session):

```bash
gjs dev-tools/test-pp-capture.js
XDG_CONFIG_HOME=$(mktemp -d) gjs dev-tools/test-pp-storage.js
XDG_CONFIG_HOME=$(mktemp -d) gjs dev-tools/test-pp-apply.js
```

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
- [ ] **Save current layout…** requires a non-empty name, max 80 characters
- [ ] Duplicate names warn but still save (IDs are UUIDs)
- [ ] First save can offer **Use at startup**
- [ ] **Edit** (active profile): Rename, Duplicate (`Name Copy`, new UUID, not startup), Set/remove startup, Delete with confirm
- [ ] **Manage profiles…** is a Load picker (Close / Load)
- [ ] Deleting the active profile does not change the desktop
- [ ] Deleting the startup profile clears `startupProfileId`

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
- [ ] **Restore previous layout** returns the pre-load layout
- [ ] A deliberately invalid profile is rejected before `enabled-applets` changes

## Corrupt files

- [ ] Truncate `state.json`: applet still loads, `.corrupt` backup appears, profiles remain
- [ ] Truncate one profile JSON: other profiles still work; selecting the broken one does not alter Cinnamon

## Rapid clicks

- [ ] Click several profiles quickly: only one restore runs; menu actions stay disabled until idle

## Dirty state

- [ ] Load a profile, move an applet: menu shows **Modified** and **Update “Name”**
- [ ] Update writes a new snapshot and clears Modified
- [ ] Settings changes during an in-progress restore do not flip dirty/apply loops

## Cinnamon restart

- [ ] After save, load, modify, and set startup: restart Cinnamon (`r`)
- [ ] Metadata persists; startup designation remains; no duplicate Panel Profiles instances

## Startup timeout (one display)

- [ ] Startup profile expects 2 monitors
- [ ] Boot / start Cinnamon with one display
- [ ] After the timeout (default 60s): current layout unchanged, **one** warning, no retry loop
- [ ] User can still load a one-monitor profile manually

## Two-head virt-viewer reboot (**release blocker**)

Environment: Linux Mint Cinnamon VM, libvirt/QEMU/KVM, SPICE, virt-viewer, two virtual heads.

1. With both heads connected, create two bottom panels (primary + secondary) and customize applets on each.
2. Save as **VM Two Screens**. Set it as the startup profile.
3. Confirm Panel Profiles sits on the **primary** panel.
4. Reboot the VM (or restart virt-viewer so the second head appears late).
5. Expected:
   - Cinnamon starts with one monitor
   - Panel Profiles waits (`Waiting for display 2…`)
   - Second SPICE head appears
   - After ~2s stabilization the saved layout restores
   - Second panel, applets, order, and applet settings return
   - Looking Glass shows `[PanelProfiles] Profile verification succeeded`

If this environment cannot be driven from the agent, run the steps above by hand before release. Headless suites cover wait/timeout/stabilize logic; the live driver covers the desktop matrix.

## Logging checks

```bash
# Looking Glass → Log, or:
journalctl --user -b | grep PanelProfiles
```

Confirm captured spice JSON is **not** printed.
