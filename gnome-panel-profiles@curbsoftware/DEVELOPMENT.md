# Desktop Profiles for GNOME Shell: development notes

## Layout

- `extension.js`: the panel button, the real Gio backend (GSettings
  variant round trip through print/parse, monitors.xml with backup),
  the save prompt, apply with notifications.
- `prefs.js`: profile manager (rename, delete) and the capture-set
  note. Applying stays in the panel menu, where the backend lives.
- `lib/profiles.js`: profile storage, isolated via XDG_CONFIG_HOME in
  tests.
- `lib/desktopSnapshot.js`: capture and apply behind a backend
  contract, so the logic runs headless against a fake. Ported in
  spirit from the Cinnamon applet's lib/ modules.

## Port notes

- Domain mapping: Cinnamon profiles capture panels, applet placement
  and org.cinnamon settings. GNOME has no movable panels, so this port
  captures enabled extensions, extension settings, favorites, a fixed
  schema set, and monitors.xml. The capture set is deliberately
  bounded and documented; it is not a full dconf dump.
- Apply order: schemas, favorites, monitors.xml, then enabled
  extensions last, so a failure never leaves the desktop half
  switched. The previous state is captured first and returned as a
  rollback snapshot.
- Values round trip as GVariant text (print/parse), which survives
  every gsettings type without per-type codecs.

## Headless tests

```bash
XDG_CONFIG_HOME=$(mktemp -d) gjs -m dev-tools/test-gnome-panel-profiles.js
```

Storage round trips, rename and delete guards, capture set assembly,
apply and rollback against a fake backend.

## Live checklist

1. Install and enable; the panel button appears.
2. Save a profile: the inline entry in the menu takes a name; a
   notification confirms; the file appears under the profiles dir.
3. Change extension settings, disable an extension, reorder favorites;
   apply the profile: everything returns. Monitor changes land after
   the next login (the notification says so).
4. Rename and delete from preferences.
5. Applying a profile saved on another machine is out of scope; treat
   profiles as per-machine.

## Versioning

Bump `metadata.json` `version` on every functional change.
