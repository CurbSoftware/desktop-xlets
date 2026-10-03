# World Clock for KDE Plasma: development notes

## Layout

- `metadata.json`: KPlugin id com.curbsoftware.worldclock.
- `contents/ui/main.qml`: compact (panel) and full (desktop)
  representations from one package.
- `contents/ui/lib/tz.js`: timezone lookup. "local" resolves through
  the engine clock; everything else through the generated table.
- `contents/ui/lib/tzdata.js`: GENERATED. Never hand edit; rerun
  `python3 dev-tools/gen-tz-table.py --out <this file>`. Window 2020 to
  2050; past it, lookups clamp to the last known offset.
- `contents/ui/lib/format.js`: strftime subset on UTC-field dates,
  clock-list parsing, grid columns.
- `contents/ui/config/config.qml`: clock list editor using the cfg_*
  KConfigXT properties.
- `contents/config/main.xml`: KConfigXT keys (clocksJson, timeFormat,
  dateFormat).

## Port notes

- One plasmoid serves panel and desktop: form factor decides which
  representation shows. That covers Cinnamon's applet and desklet in
  one package.
- Font fitting uses QML native Text.Fit rather than the Cinnamon
  glyph-heuristic maths; the tile caps and minimum sizes approximate
  the Cinnamon caps.
- The clocks setting serializes as JSON inside one KConfig string,
  which keeps the list editable from the config page without a custom
  C++ data type.
- The node test strips QML pragmas and cross-checks the table against
  Node's Intl timezone database at every probe.

## Live checklist (needs a Plasma 6 session)

1. `kpackagetool6 --type=Plasma/Applet --install kde-world-clock`, add
   it to the desktop and to a panel.
2. Desktop: the grid shows every clock, ticking once a second; the
   local clock is outlined; tiles fit their text.
3. Panel: the compact clock shows the first clock's time; click opens
   the grid popup.
4. Config: add clocks (pick or type an IANA id), rename, remove; the
   grid updates on save.
5. Compare three tiles against `TZ=America/New_York date` and
   `TZ=Asia/Tokyo date`; repeat across a DST boundary if near one.
6. Set the time format to `%H:%M` and back; tiles never overflow.
7. Both a light and a dark Plasma theme.

## Versioning

Bump `KPlugin.Version` on every functional change.
