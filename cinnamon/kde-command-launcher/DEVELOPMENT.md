# Command Launcher for KDE Plasma: development notes

## Layout

- `contents/ui/main.qml`: icon button, empty-entry configure path.
- `contents/ui/lib/launcher.js`: the launch seam (URL construction;
  run() delegates to Qt.openUrlExternally).

## Port notes

- No shell commands: the executable dataengine was removed in Plasma 6
  and QML has no spawn API. Applications and .desktop entries launch
  through the standard URL mechanism. A C++ helper behind launcher.js
  is the documented upgrade path.

## Headless tests

```bash
node kde-command-launcher/tests/test-launcher.js
```

## Live checklist (needs a Plasma 6 session)

1. Install, add to a panel; the icon shows.
2. Empty entry: click opens the configuration page.
3. Set `org.kde.kate`: click launches Kate; a bad id fails visibly
   through KDE's launcher.
4. An absolute .desktop path launches that entry.

## Versioning

Bump `KPlugin.Version` on every functional change.
