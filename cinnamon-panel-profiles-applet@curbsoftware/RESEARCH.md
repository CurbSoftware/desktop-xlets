# Research notes: Cinnamon 6.6.9 (Linux Mint 22.3 Zena)

Recorded 2026-08-19 on the development machine. Live inspection of installed packages, `/usr/share/cinnamon`, and `org.cinnamon` GSettings, not blog posts.

The live applet UUID is `cinnamon-panel-profiles-applet@curbsoftware`. An older export used `panel-profiles@curbsoftware.com`. Do not revive that UUID. Development lives in this monorepo directory only.

## Runtime

| Item | Value |
|---|---|
| OS | Linux Mint 22.3 Zena |
| Cinnamon | 6.6.9+zena |
| cjs | 115.1+zena |
| Session | `XDG_SESSION_TYPE=x11` |
| `imports.misc.config.PACKAGE_VERSION` | `6.6.9` |

## Module loading (first-party applets)

Current first-party applets (calendar, grouped-window-list, notifications, sound) use:

```javascript
class MyApplet extends Applet.IconApplet {
    constructor(orientation, panel_height, instance_id) {
        super(orientation, panel_height, instance_id);
    }
}
const Helper = require('./helper');
```

`require()` is implemented in `/usr/share/cinnamon/js/misc/fileUtils.js`. Relative paths are resolved from the **xlet directory**, not the current file:

```javascript
path = path.replace(/\.\//g, '');
path = dir + "/" + path;   // dir is the applet root
```

This applet's `lib/` modules stay loadable headless via `imports.searchPath`. They do not call `require()`. Public names use `var` / `function` so both loaders see them. See `DEVELOPMENT.md`.

`imports.ui.extension.getCurrentExtension()` is **not** present in this Cinnamon build. Do not use it.

`Lang.bind()` still appears in older first-party files; calendar/notifications mix it with arrow functions. New code uses arrows and `.bind(this)`.

`settings.bind(key, property)` (three arguments) is the current API. `bindProperty` + `BindingDirection` is obsolete.

## GSettings (`org.cinnamon`)

From `/usr/share/glib-2.0/schemas/org.cinnamon.gschema.xml`:

| Key | Type | Role |
|---|---|---|
| `panels-enabled` | `as` | `panelID:monitor:position` (`top`/`bottom`/`left`/`right`). Monitor `0` is primary. |
| `enabled-applets` | `as` | `panelN:zone:order:uuid:instanceId` with optional overrides after a fifth colon. |
| `panels-autohide` | `as` | `panelID:true\|false` |
| `panels-show-delay` | `as` | milliseconds |
| `panels-hide-delay` | `as` | milliseconds |
| `panels-height` | `as` | `panelID:height` |
| `panel-zone-icon-sizes` | `s` | JSON string, **not** `as` |
| `panel-zone-symbolic-icon-sizes` | `s` | JSON string |
| `panel-zone-text-sizes` | `s` | JSON string |
| `next-applet-id` | `i` | Allocator only. **Never restore.** |

Live values on this machine (two heads):

```text
panels-enabled: ['1:0:bottom', '2:1:bottom']
panels-height:  ['1:40', '2:40', '3:40']
panels-autohide:['1:false', '2:false', '3:false']
```

Height/autohide can retain leftover panel IDs after a panel is removed. Capture and restore **verbatim**; do not "normalize" the lists.

`enabled-applets` entries on this machine all include instance IDs (`panel1:left:0:menu@cinnamon.org:0`). `appletManager.checkForUpgrade()` still appends an id to legacy 4-part strings and increments `next-applet-id`. The parser accepts both forms.

Cinnamon reads settings with `global.settings` (`Gio.Settings` for `org.cinnamon`). Capture uses `get_value()` / `print(true)` / `set_value()` so variant types survive.

## Applet configuration files

Cinnamon settings for applets (from `xlet-settings.py` and live disk):

- Current: `~/.config/cinnamon/spices/<uuid>/<instanceId>.json`
- Legacy: `~/.cinnamon/configs/<uuid>/`
- Single-instance applets historically used `<uuid>.json`

Live examples:

```text
~/.config/cinnamon/spices/calendar@cinnamon.org/13.json
~/.config/cinnamon/spices/calendar@cinnamon.org/16.json
~/.config/cinnamon/spices/grouped-window-list@cinnamon.org/2.json
~/.config/cinnamon/spices/menu@cinnamon.org/0.json
```

Multi-instance files are numeric even when `max-instances` is 1 if an instance id exists. Capture only files referenced by `enabled-applets`. Never copy the entire spices tree. Never capture `cinnamon-panel-profiles-applet@curbsoftware` spice JSON or `~/.config/cinnamon-panel-profiles/`.

## Restore order

`appletManager.onEnabledAppletsChanged` destroys, moves, or recreates applet instances when `enabled-applets` changes, including this applet. Therefore:

1. Restore panel topology keys except `enabled-applets`
2. Restore spice JSON atomically
3. Persist `pendingApply` in `state.json`
4. Set `enabled-applets` last
5. On the next applet instance, verify and clear `pendingApply`

## Monitors

`Main.layoutManager` emits `monitors-changed` (wired to `Meta.MonitorManager`).

`Monitor` objects (`js/ui/layout.js`) expose `index`, `x`, `y`, `width`, `height`, `name` (`global.display.get_monitor_name`). There is no required per-monitor scale on this build; scale is captured when `get_monitor_scale` exists.

Do not call `xrandr`. Do not change display configuration.

## UI APIs

- Popup: `Applet.AppletPopupMenu` + `PopupMenu.PopupMenuItem`
- Active profile: `item.setShowDot(true)`. First-party applets (sound, network, power, xrandr) use this DrawingArea `popup-menu-item-dot`. `OrnamentType.DOT` installs a `RadioBox` and is the wrong widget for "currently selected".
- Dialogs: `ModalDialog.ModalDialog` + `Dialog.MessageDialogContent` + `St.Entry`
- Radios: `imports.ui.radioButton.RadioButtonGroup`
- Checkboxes: `imports.ui.checkBox.CheckBox`
- Entry context menu: `imports.ui.cinnamonEntry.addContextMenu`
- Notifications: `Main.notify`, `Main.warningNotify`, `Main.notifyError`
- Signals: `imports.misc.signalManager.SignalManager`
- Cleanup: `on_applet_removed_from_panel` must disconnect signals, file monitors, and Mainloop sources

First-party references for visual tone: `calendar@cinnamon.org`, `notifications@cinnamon.org`, `sound@cinnamon.org`, `menu@cinnamon.org`.

## Permissions helpers

`imports.misc.fileUtils.changeModeGFile(file, octal)` sets `unix::mode`. This applet uses the same Gio.FileInfo approach plus `Gio.FileCreateFlags.PRIVATE` for atomic `replace_contents`.
