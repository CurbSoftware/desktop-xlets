# Color Timer Clock for KDE Plasma: development notes

## Layout

- `contents/ui/main.qml`: the three cards, timer and chronometer state
  machines, schedule evaluation per tick, ColorAnimation ramps.
- `contents/ui/lib/colorEngine.js`: the pure color engine, ported
  verbatim from the Cinnamon cardActions.js (the QML pragma is the
  only change).
- `contents/ui/lib/tz.js`, `lib/tzdata.js`, `lib/format.js`: copies of
  the world clock libraries (same duplication convention).
- `contents/config/main.xml`, `contents/ui/config/config.qml`: card
  visibility, schedule rows, timer duration, formats.

## Port notes

- State persists as JSON strings inside the plasmoid configuration;
  restart mapping (running past the end becomes expired) is ported.
- Ramp smoothing is a QML Behavior with a ColorAnimation, which covers
  the Cinnamon smooth/stepped distinction natively.
- Contrast-aware label colors go through the engine's contrastColors,
  parsed back from the css color string QML holds.

## Headless tests

```bash
node kde-color-clock/tests/test-color-engine.js
```

Mirrors the Cinnamon engine assertions (parse, normalize, evaluate,
nextStop, contrast, thresholds).

## Live checklist (needs a Plasma 6 session)

1. Install, add to desktop and panel; three cards tick and ramp.
2. Timer: start, pause, resume, reset; +/- buttons work while stopped;
   expiry flips the title and border.
3. Chronometer: lap, hundredths raises the refresh rate only while
   running.
4. Remove and re-add the plasmoid while a timer runs: state resumes.
5. Config: schedule rows (time plus hex color) apply on save; the
   next-color footer and swatch track them.
6. Both a light and a dark Plasma theme.

## Versioning

Bump `KPlugin.Version` on every functional change.
