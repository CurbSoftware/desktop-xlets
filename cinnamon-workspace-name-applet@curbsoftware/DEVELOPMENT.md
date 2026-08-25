# Workspace Names Development

## Runtime structure

- `applet.js` owns panel layout, workspace buttons, applet menu, settings,
  debounce sources, and lifecycle cleanup.
- `workspaceActions.js` wraps Cinnamon workspace queries and mutations.
- `renameDialog.js` owns the modal rename prompt.
- `stylesheet.css` uses only `curb-workspace-*` classes.

The applet inherits from `Applet.Applet`. Its actor is horizontal on top and
bottom panels and vertical on left and right panels. Each workspace is a real
focusable `St.Button`. Primary click activates that workspace. The applet's
standard right-click menu owns Expo, add, rename, and remove actions.

Horizontal label width shrinks against panel length and workspace count. A
36-workspace strip stays bounded while full names remain in tooltips. Vertical
panels use readable Unicode-safe name prefixes within panel width.

Workspace add, remove, reorder, rename, orientation, and panel-height changes
queue one `Mainloop.timeout_add(0)` rebuild. Never use `idle_add` for this UI.

## Settings compatibility

The UUID remains `cinnamon-workspace-name-applet@curbsoftware`. Existing
display and editing values stay compatible. `scroll-to-switch` remains as a
hidden generic migration key. A stored `true` value migrates once to
`scroll-behavior=normal`, then resets to `false`.

## Lifecycle rules

- Connect long-lived signals through `SignalManager`.
- Disconnect the workspace-name GSettings watcher explicitly.
- Remove every pending timeout during `on_applet_removed_from_panel`.
- Destroy per-button tooltips before destroying their actors.
- Keep cleanup safe when no rebuild or action is pending.

## Verification

```sh
node --check cinnamon-workspace-name-applet@curbsoftware/applet.js
python3 -m json.tool cinnamon-workspace-name-applet@curbsoftware/settings-schema.json
gjs dev-tools/test-workspace-actions.js
python3 dev-tools/live-test-applet.py
```

The live driver adds a temporary panel instance, exercises buttons, names,
display modes, scrolling, dialogs, and teardown, then restores exact panel and
workspace state.
