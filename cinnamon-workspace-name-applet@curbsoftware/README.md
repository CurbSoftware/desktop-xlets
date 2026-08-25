# Workspace Names Applet

Workspace Names puts every workspace directly on a Cinnamon panel. Each named
button switches to its workspace with one click. The active workspace uses the
panel theme's outlined state.

## Features

- One visible button per workspace
- Name, number, or number and name labels
- Horizontal and vertical panel layouts
- Density-aware label bounds with compact vertical name prefixes
- Full-name tooltips and accessible button names
- Optional trailing add button
- Disabled, normal, or reversed scroll switching
- Expo, add, rename, and remove actions in the standard applet menu
- Live updates after workspace add, remove, reorder, rename, or switch

## Settings

Open Cinnamon Settings, then Applets, then Workspace Names.

- Workspace button labels
- Maximum workspace name width
- Scroll wheel behavior
- Workspace editing controls
- Named workspace removal confirmation

Existing installations keep the same UUID. The former scroll checkbox is
migrated once to the new three-state scroll setting.

## Testing

```sh
gjs dev-tools/test-workspace-actions.js
python3 dev-tools/live-test-applet.py
```
