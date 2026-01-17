workspace-grid-desklet@curbsoftware
# Cinnamon Desklet Workspace Grid

A Cinnamon desklet that displays a **clickable grid of workspaces**, shows workspace names, and highlights the active workspace.  
This makes it useful for quickly navigating and organizing your desktop environments.

![screenshot placeholder](icon.png)

---

## ✨ Features

- 🖥️ Displays a workspace grid directly on the desktop.
- 🖱️ Click any workspace in the grid to switch to it.
- 🏷️ Shows workspace names, and/or an index number.
- 🎨 Highlights the currently active workspace.
- ⚙️ All settings configurable via **Cinnamon Desklet settings**.

---

## 🛠️ Configuration

You can configure this desklet from the **Cinnamon Desklet settings panel**, which uses [`settings-schema.json`](settings-schema.json) for all definitions.  

### Available options:
- **Layout Mode**: Choose between `auto` (near-square) or `fixed` (rows x cols).
- **Fixed Rows/Columns**: Set the number of rows and columns for the grid in fixed mode.
- **Show Index**: Prefix workspace names with their index number (e.g., "1. Web").
- **Scroll Wheel Behavior**: Use the scroll wheel to switch workspaces by row or column.
- **Style & Layout**: Adjust tile spacing, and desklet width/height via the settings panel.
