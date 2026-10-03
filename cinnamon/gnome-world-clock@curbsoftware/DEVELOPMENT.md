# World Clock for GNOME Shell: development notes

## Layout

- `extension.js`: composition root. Builds the store, starts the watch,
  creates the widget.
- `widget.js`: the desktop widget. Clock tiles, grid, font fitting,
  Alt+drag movement, 1s tick.
- `prefs.js`: GTK4/libadwaita preferences window. Clock list editor,
  layout, formats.
- `lib/clockActions.js`: pure helpers, ported from the Cinnamon engine.
  No St/Clutter imports, headless-testable.
- `lib/store.js`: JSON settings store, atomic writes, directory watch.
- `lib/defaults.js`: default settings.
- `stylesheet.css`: tile chrome.

## Mechanisms worth knowing

- There is no desklet API in GNOME Shell. Layer "desktop" parents the
  widget to `Main.layoutManager._backgroundGroup`; "overlay" parents it
  to `Main.uiGroup` so it stays above windows. Background-group input
  only reaches the widget when the desktop is not covered: that is why
  the overlay layer exists and why the checklist below tests both.
- Movement is Alt+left-drag, handled in the capture phase on the
  container so tiles never see the press (no phantom click). Drop
  clamps the position into the primary monitor and persists it.
- The extension and prefs are separate processes. Edits write the same
  JSON file; the extension watches the directory and reloads, debounced
  250ms. Same-content writes are ignored, so no reload loops.
- The grid is an St.Widget with Clutter.GridLayout (row and column
  homogeneous), because GNOME's St has no Table.
- Fonts fit in two passes: `computeFittedFontSizes` estimates from
  glyph-width heuristics, then a metric pass shrinks further using
  `get_preferred_width` once the tile is on the stage.

## Headless tests

```bash
gjs -m dev-tools/test-gnome-world-clock.js
```

Covers the engine copy and the store (isolated with XDG_CONFIG_HOME
pointing at a temp dir, same pattern as the Cinnamon panel-profiles
tests). The ported engine assertions mirror the Cinnamon
`test-clock-actions.js` so the two copies cannot silently drift.

## Live checklist (needs a real GNOME session)

Run through this before calling a phase done:

1. `gnome-extensions install --force` the built zip, enable it. On
   Wayland log out and back in; on X11 Alt+F2 then `r`.
2. Widget appears on the desktop at the stored position, clocks tick
   once a second, local tile outlined.
3. Alt+drag moves the widget; after a shell restart it returns to the
   dropped position.
4. Click a tile: preferences window opens. Click the "+" tile: same.
5. Add a clock (search a timezone by city), remove a clock, rename
   one: the grid rebuilds without a shell restart (within about 250ms).
6. Switch layer to overlay: widget moves above windows immediately.
7. Change width/height/layout mode/tile spacing: grid reflows and font
   fitting reruns.
8. Set time format to `%H:%M` and back: no tile overflow either way.
9. Disable then re-enable the extension: no leftover sources (check
   `journalctl -f /usr/bin/gnome-shell` for repeated warnings).
10. Both a light and a dark GNOME theme.

## Versioning

Bump `metadata.json` `version` on every functional change, same
discipline as the Cinnamon xlets.
