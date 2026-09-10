# Workspace Names for GNOME Shell: development notes

## Layout

- `extension.js`: the panel indicator, workspace buttons, scroll
  switching, menu, workspace-manager signal wiring.
- `renameDialog.js`: ModalDialog port of the Cinnamon rename dialog.
- `lib/workspaces.js`: workspace-names strv bookkeeping (pad, trim,
  rename), parameterized by the settings object so tests run on a fake.
- `lib/store.js`, `lib/defaults.js`: JSON settings.

`lib/workspaces.js` and `renameDialog.js` are duplicated into the
Workspace Grid port, same convention as the Cinnamon pair.

## Port notes

- No Main.setWorkspaceName on GNOME: names go through the
  workspace-names strv directly.
- Add/remove gated on `org.gnome.mutter dynamic-workspaces` being off;
  the menu explains itself when the gate is closed.
- One status-area button holds all workspace buttons, since GNOME takes
  one indicator per role.

## Headless tests

```bash
gjs -m dev-tools/test-gnome-workspace-names.js
```

Covers the name padding/trim/rename logic on a fake settings object.

## Live checklist

1. Install and enable; one button per workspace, active outlined.
2. Click switches; scroll switches (with the setting on) and respects
   the 220ms debounce; reversed mode flips direction.
3. Right-click a button renames that workspace; the change lands in
   `gsettings get org.gnome.desktop.wm.preferences workspace-names`
   and every workspace app refreshes.
4. With dynamic workspaces off: add and remove work; with it on the
   menu shows the explanation and stays insensitive.
5. Display modes name/number/both; label ellipsizes at the max width.

## Versioning

Bump `metadata.json` `version` on every functional change.
