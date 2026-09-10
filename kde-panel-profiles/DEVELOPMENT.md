# Plasma Layouts for KDE Plasma: development notes

## Layout

- `contents/ui/main.qml`: the panel button, save flow, apply flow,
  executable-engine probe.
- `contents/ui/lib/layouts.js`: pure profile bookkeeping and
  appletsrc summarising, plus the apply command builder. Node-tested
  with the pragma stripped.
- `contents/config/main.xml`: the profilesJson key that stores every
  profile.

## Port notes

- QML plasmoids can read files (XHR on file://) but cannot write them,
  and cannot spawn commands without the executable dataengine. So:
  capture reads appletsrc, profiles live as JSON inside the plasmoid
  configuration (which KConfig persists), and apply builds a backup,
  write, and plasmashell restart command list executed through the
  engine when present.
- The home path has no QML API. It is asked from the engine at
  startup ("echo $HOME"); when the engine is absent it is derived from
  the package URL, which works for user installs under ~/.local.
- The apply command list is generated in layouts.js and tested there;
  the QML only executes it.

## Headless tests

```bash
node kde-panel-profiles/tests/test-layouts.js
```

## Live checklist (needs a Plasma 6 session)

1. Install, add to a panel; the popup opens with an empty list.
2. Save a layout: name it, save; the list shows panel and widget
   counts read from appletsrc.
3. Change the panel arrangement, apply the saved layout: plasmashell
   restarts and the layout returns. A timestamped backup of both
   config files appears in ~/.config.
4. Remove a profile from the list.
5. If this Plasma lacks the executable engine: the explanation shows,
   saving still works.

## Versioning

Bump `KPlugin.Version` on every functional change.
