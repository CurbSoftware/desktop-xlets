# Color Timer Clock for GNOME Shell: development notes

## Layout

- `extension.js`: composition root.
- `widget.js`: cards, schedules, timer and chronometer state machines,
  Alt+drag movement, ticks (1s, plus a 50ms fast tick only while the
  chronometer runs with hundredths enabled).
- `prefs.js`: card visibility, schedule editors, timer duration,
  display formats.
- `lib/cardActions.js`: pure colour engine, ported from the Cinnamon
  module. No St/Clutter imports, headless-testable.
- `lib/store.js`: JSON settings store (copy of the world-clock port's,
  log tag adjusted). Also persists timer and chronometer state.
- `lib/defaults.js`: default settings.
- `stylesheet.css`: card chrome, ported verbatim from Cinnamon.

Shared desktop-widget mechanics (layer placement, Alt+drag, the
extension/prefs bridge through the directory watch) work exactly as in
the world-clock port; see its DEVELOPMENT.md for the details.

## Port notes

- Timer and chronometer state persisted through the JSON store, where
  the Cinnamon desklet hides it in generic settings keys. Validation
  and restart-during-run mapping (running past its end becomes
  expired, a chronometer keeps running on its wall-clock start) are
  ported as-is.
- Card rows use Clutter.GridLayout (row and column homogeneous) since
  GNOME's St has no Table.
- GNOME's Tooltip has no live text swap, so the play button keeps its
  icon-only tooltip; the icon itself flips between play and pause.
- The footer "next color" bar, swatch paint, expiry punch, notify
  thresholds, and the digit-count refit trigger are ported as-is.

## Headless tests

```bash
gjs -m dev-tools/test-gnome-color-clock.js
```

Mirrors the Cinnamon `test-card-actions.js` assertions so the engine
copies cannot drift, plus GNOME source contracts (no Cinnamon DND
internals, capture-phase drag, no idle_add, persistence through the
store).

## Live checklist

1. Install and enable; on Wayland log out and back in.
2. Three cards appear and tick; colors ramp along the default
   schedules; the footer counts down to the next color with a swatch.
3. Timer: start, pause, resume, reset; the +/- buttons adjust only
   while stopped; expiry flips the title and border and (with notify
   on) fires a notification.
4. Chronometer: start, lap, pause, reset; enabling hundredths raises
   the refresh rate only while running.
5. Disable and re-enable the extension while a timer runs: state
   resumes correctly; a timer that expired while disabled shows
   expired without a stale notification.
6. Alt+drag repositions; position survives a shell restart.
7. Preferences edits (schedules, formats, sizes, cards shown) apply
   live within about 250ms.
8. Both a light and a dark GNOME theme.

## Versioning

Bump `metadata.json` `version` on every functional change.
