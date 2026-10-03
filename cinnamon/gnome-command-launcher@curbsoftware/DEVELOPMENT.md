# Command Launcher for GNOME Shell: development notes

## Layout

- `extension.js`: panel button, spawn logic (argv parse, ~ expansion,
  pkexec, working directory, notifications), Run menu item.
- `prefs.js`: command, tooltip, icon, behaviour switches.
- `lib/store.js`, `lib/defaults.js`: JSON settings.

## Port notes

- GNOME panels open a menu on click by convention, so the button
  offers Run in its menu; middle-click runs directly.
- No keybinding: GNOME keybindings require a compiled gschema, which
  this port avoids. Revisit by shipping a gschema if it matters.
- No bounce animation: Tweener is gone on GNOME.

## Live checklist

1. Install and enable; the button appears in the status area.
2. Empty command: click opens preferences.
3. Set a command (for example `touch /tmp/launched`): middle-click and
   menu Run both spawn it; notifications appear when enabled.
4. pkexec variant prompts polkit; bad argv shows a parse notification.
5. Icon by theme name and by absolute path both render.

## Versioning

Bump `metadata.json` `version` on every functional change.
