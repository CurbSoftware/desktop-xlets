# Panel Profiles: Verified Environment Facts

Phase 1 research (spec section 61). Everything below was confirmed on this
machine before any code was written: Mint 22.3, Cinnamon 6.6.9, X11, cjs
115.1, live 2-head SPICE VM. Each fact has a re-verify command so anyone can
re-check after a Cinnamon upgrade.

## Panel GSettings keys (org.cinnamon)

Existing on 6.6, with types read from the live system:

- `panels-enabled`, `enabled-applets`, `panels-autohide`,
  `panels-show-delay`, `panels-hide-delay`, `panels-height`: all `as`
- `panel-scale-text-icons`: BOOLEAN (`type b`), NOT `as`
- `panel-zone-icon-sizes`, `panel-zone-symbolic-icon-sizes`,
  `panel-zone-text-sizes`: `as` holding JSON-in-string with arbitrary key
  order. Parse and canonicalize, never string-compare.
- `next-applet-id`: `i`. Allocator only, never restored (rewinding risks
  instance-id collisions).
- No `panels-resizable` or `panels-hide-mode` on 6.6.

Capture must take the variant type from the live variant
(`variant.get_type_string()`), never from a hardcoded table.

Re-verify:

```bash
gsettings list-recursively org.cinnamon | grep -E 'panels-|enabled-applets|next-applet-id|panel-zone|panel-scale'
gsettings range org.cinnamon panel-scale-text-icons
```

## Phantom per-panel entries are normal

Per-panel keys can contain ids with no matching `panels-enabled` entry. Live
right now: `panels-autohide` is `['1:false', '2:false', '3:false']` while
`panels-enabled` is `['1:0:bottom', '2:1:bottom']`. Panel id 3 does not
exist. Preserve such entries verbatim in both capture and restore.

Re-verify:

```bash
dconf read /org/cinnamon/panels-enabled
dconf read /org/cinnamon/panels-autohide
```

## Entry formats

- `panels-enabled` entry: `panelId:monitorIndex:edge`, e.g. `1:0:bottom`.
- `enabled-applets` entry: `panel<Id>:<zone>:<pos>:<uuid>:<applet_id>`.
  Ids are explicit, gaps in positions are allowed. Keep ids as strings;
  parseInt only for math (id "0" is falsy).

Re-verify:

```bash
dconf read /org/cinnamon/panels-enabled
dconf read /org/cinnamon/enabled-applets
```

## Applet config files

Location: `~/.config/cinnamon/spices/<uuid>/<instanceId>.json` for
multi-instance applets, `<uuid>/<uuid>.json` for single-instance applets
(the instanceId equals the uuid there even though enabled-applets carries a
numeric id). Verified on disk: `calendar@cinnamon.org/13.json` and
`16.json` (multi), `cinnamon-workspace-name-applet@curbsoftware/
cinnamon-workspace-name-applet@curbsoftware.json` (single). Each file is a
schema-mirror object with live `value` fields plus a trailing `__md5__`.

Re-verify:

```bash
ls ~/.config/cinnamon/spices/calendar@cinnamon.org/
ls ~/.config/cinnamon/spices/cinnamon-workspace-name-applet@curbsoftware/
python3 -c "import json,os; d=json.load(open(os.path.expanduser('~/.config/cinnamon/spices/calendar@cinnamon.org/13.json'))); print('__md5__' in d)"
```

## appletManager applies enabled-applets live

appletManager connects to `changed::enabled-applets` and live-applies a
diff DURING the `set_value` call. Consequence for restore: if our own entry
changes, our instance is destroyed mid-call and a fresh instance is created
with the SAME id (ids live in the key). The apply transaction therefore
persists `pendingApply` to state.json before writing enabled-applets, and
the new instance resumes from it in `_init`. Nothing after that write may
touch `this`.

Re-verify:

```bash
grep -n "changed::enabled-applets" /usr/share/cinnamon/js/ui/appletManager.js
grep -n "removeApplet\|_onEnabledAppletsChanged" /usr/share/cinnamon/js/ui/appletManager.js | head
```

## next-applet-id is forward-only

Cinnamon appends missing ids to enabled-applets and writes the counter back,
so entries lacking ids each get one allocated. Restore rule: never rewind
the counter; bump it forward past the max restored id.

Re-verify:

```bash
dconf read /org/cinnamon/next-applet-id
grep -n "next-applet-id\|nextAppletId" /usr/share/cinnamon/js/ui/appletManager.js | head
```

## Cinnamon cleans up dropped config files

When applet instances are removed, Cinnamon deletes their multi-instance
config files itself (removeAppletFromPanels deleteConfig path). Restore code
does not need stale-file handling.

Re-verify:

```bash
grep -n "deleteConfig" /usr/share/cinnamon/js/ui/appletManager.js
```

## Monitors

`Main.layoutManager.monitors` is an array of
`{index, x, y, width, height, name}` (no scale field on 6.6).
`Main.layoutManager.primaryIndex` is the primary monitor and is NOT
guaranteed to be 0. The signal is `'monitors-changed'` on
Main.layoutManager. Spec section 3 says monitor 0 is primary; that is wrong,
use primaryIndex everywhere.

Re-verify (Looking Glass or dev-tools/cinnamon_eval.py):

```bash
python3 dev-tools/cinnamon_eval.py 'JSON.stringify(Main.layoutManager.monitors.map(function(m){return m.index}))' \
  && python3 dev-tools/cinnamon_eval.py 'Main.layoutManager.primaryIndex'
grep -n "monitors-changed" /usr/share/cinnamon/js/ui/layout.js | head -3
```

## Notifications and dialogs

`Main.notify(msg, details)`, `Main.warningNotify`,
`Main.criticalNotify`. `imports.ui.modalDialog` also exports
`ConfirmDialog` (already used by this repo's workspaceActions.js).

Re-verify:

```bash
grep -n "function notify\|warningNotify\|criticalNotify" /usr/share/cinnamon/js/ui/main.js | head
grep -n "ConfirmDialog" /usr/share/cinnamon/js/ui/modalDialog.js | head -2
```

## Runtime and module loading

GJS 115 supports ES6 classes, template literals, and arrow functions (this
codebase still uses prototype style to match the reference applet).
First-party Cinnamon code loads siblings with `require('./mod')`, which
resolves against the xlet root via misc/fileUtils.js requireModule and
works for subdirectories (`require('./lib/constants')`). Plain `gjs` on the
command line has no require, so lib/ modules must also be importable via
`imports.searchPath` and must declare public names with `var`/`function`.

Re-verify:

```bash
cjs --version                       # expect 115.x
grep -rn "require('./" /usr/share/cinnamon/js/ui/../misc/fileUtils.js | head -2
cd cinnamon-panel-profiles-applet@curbsoftware && cjs -c 'imports.searchPath.unshift("lib"); print(imports.constants.PANEL_SETTING_KEYS.length)'
```

## Conventions frozen from these facts

- Variant types always from the live variant at capture.
- Zone-size keys canonicalized, phantom entries preserved verbatim.
- enabled-applets restored last, in its own phase, after pendingApply is
  persisted.
- next-applet-id only ever bumped forward.
- primaryIndex, never index 0.
