# Cinnamon Desklet Workspace Grid

A Cinnamon desklet that displays a **clickable grid of workspaces**, shows workspace names, and highlights the active workspace.  
This makes it useful for quickly navigating and organizing your desktop environments.

![screenshot placeholder](icon.png)

---

## ✨ Features

- 🖥️ Displays a workspace grid directly on the desktop.
- 🖱️ Click any workspace in the grid to switch to it.
- 🏷️ Shows workspace names, with an option to prefix with an index number.
- 🎨 Highlights the currently active workspace.
- ⚙️ All settings configurable via **Cinnamon Desklet settings**.

---

## ⚙️ Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/TechCurb/cinnamon-desklet-workspace-switcher.git
   ```
2. Copy the folder into your local Cinnamon desklets directory:
   ```bash
   cp -r cinnamon-desklet-workspace-switcher/ ~/.local/share/cinnamon/desklets/workspace-grid-desklet@curb.software
   ```
3. Right-click your desktop → **Add Desklets** → Find **Workspace Grid** and add it.  

**Or**

## ⚙️ Simpler Installation (load without modifications)
Clone the repo into your local Cinnamon desklets directory:
   ```bash
   git clone https://github.com/TechCurb/cinnamon-desklet-workspace-switcher.git ~/.local/share/cinnamon/desklets/workspace-grid-desklet@curb.software
   ```

---

## 🛠️ Configuration

You can configure this desklet from the **Cinnamon Desklet settings panel**, which uses [`settings-schema.json`](settings-schema.json) for all definitions.  

### Available options:
- **Layout Mode**: Choose between `auto` (near-square) or `fixed` (rows x cols).
- **Fixed Rows/Columns**: Set the number of rows and columns for the grid in fixed mode.
- **Show Index**: Prefix workspace names with their index number (e.g., "1. Web").
- **Scroll Wheel Behavior**: Use the scroll wheel to switch workspaces by row or column.
- **Style & Layout**: Adjust tile spacing, and desklet width/height via the settings panel.

---

## 🔄 Restart Cinnamon After Edits

If manual edits are done to files, Cinnamon may need to restart:  
- Press **Alt + F2**, type `r`, then **Enter**  
_or_  
- Run in terminal:  
  ```bash
  cinnamon --replace & disown
  ```

---

## 📂 Project Structure

- [`desklet.js`](desklet.js) — main desklet logic.
- [`settings-schema.json`](settings-schema.json) — defines metadata and settings schema.
- [`stylesheet.css`](stylesheet.css) — styling overrides.
- [`metadata.json`](metadata.json) — basic desklet metadata.

---

## 🙌 Credits


- Author: [Cinnamon Docs](https://github.com/TechCurb)

---

## 📜 License

This project is licensed under the GPLv2+ license.