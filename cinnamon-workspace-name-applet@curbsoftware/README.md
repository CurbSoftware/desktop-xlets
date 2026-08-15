# Workspace Name Applet

A Cinnamon panel applet that shows the current workspace name, and lets you
manage workspaces without leaving the panel.

---

## ✨ Features

- 🏷️ Shows the current workspace as its **name**, its **number**, or `number: name`.
- 📋 Click to open a menu listing every workspace; click one to switch to it.
- ➕ **Add workspace** from the menu (up to 36).
- ✏️ **Rename current workspace…** opens a dialog; leave it empty to restore the default name.
- 🗑️ **Remove current workspace**, with a confirmation prompt for named workspaces.
- 🖱️ Optional scroll-wheel workspace switching.
- 🔄 The label updates live when a workspace is renamed anywhere — Expo, the
  grid desklet, or Cinnamon Settings.

---

## 🛠️ Configuration

Configure from **Cinnamon Settings → Applets**, defined in
[`settings-schema.json`](settings-schema.json):

- **Display mode**: `Name only`, `Number only`, or `Number + Name`.
- **Show workspace menu on click**.
- **Use scroll wheel to switch workspaces**.
- **Allow adding, removing and renaming workspaces from the menu**: master
  switch for the management block.
- **Confirm before removing a named workspace**.
