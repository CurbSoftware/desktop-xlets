# Desktop xlets

Applets, desklets, and desktop widgets for Cinnamon, GNOME, and KDE.

Each folder keeps the history of the repository it came from, including that folder's own README and license. This repository does not apply one license to every project.

| Folder | Former repository | License in that folder |
| --- | --- | --- |
| `kde/panel-profiles/` | [kde-panel-profiles](https://github.com/CurbSoftware/kde-panel-profiles) | GPL-2.0 (`LICENSE`) |
| `kde/command-launcher/` | [kde-command-launcher](https://github.com/CurbSoftware/kde-command-launcher) | GPL-2.0 (`LICENSE`) |
| `kde/workspace-names/` | [kde-workspace-names](https://github.com/CurbSoftware/kde-workspace-names) | GPL-2.0 (`LICENSE`) |
| `kde/workspace-grid/` | [kde-workspace-grid](https://github.com/CurbSoftware/kde-workspace-grid) | GPL-2.0 (`LICENSE`) |
| `kde/color-clock/` | [kde-color-clock](https://github.com/CurbSoftware/kde-color-clock) | GPL-2.0 (`LICENSE`) |
| `kde/world-clock/` | [kde-world-clock](https://github.com/CurbSoftware/kde-world-clock) | GPL-2.0 (`LICENSE`) |
| `gnome/panel-profiles/` | [gnome-panel-profiles](https://github.com/CurbSoftware/gnome-panel-profiles) | GPL-2.0 (`LICENSE`) |
| `gnome/command-launcher/` | [gnome-command-launcher](https://github.com/CurbSoftware/gnome-command-launcher) | GPL-2.0 (`LICENSE`) |
| `gnome/workspace-names/` | [gnome-workspace-names](https://github.com/CurbSoftware/gnome-workspace-names) | GPL-2.0 (`LICENSE`) |
| `gnome/workspace-grid/` | [gnome-workspace-grid](https://github.com/CurbSoftware/gnome-workspace-grid) | GPL-2.0 (`LICENSE`) |
| `gnome/color-clock/` | [gnome-color-clock](https://github.com/CurbSoftware/gnome-color-clock) | GPL-2.0 (`LICENSE`) |
| `gnome/world-clock/` | [gnome-world-clock](https://github.com/CurbSoftware/gnome-world-clock) | GPL-2.0 (`LICENSE`) |
| `curb-desktop-widgets/` | [curb-desktop-widgets](https://github.com/CurbSoftware/curb-desktop-widgets) | GPL-2.0 (`LICENSE`) |
| `cinnamon/` | [cinnamon-monorepo](https://github.com/CurbSoftware/cinnamon-monorepo) | No single root license. See below. |

## Cinnamon

`cinnamon/` is the Cinnamon development tree from `cinnamon-monorepo`. It already contains these projects:

- `cinnamon/cinnamon-panel-profiles-applet@curbsoftware/`
- `cinnamon/cinnamon-workspace-names-applet@curbsoftware/`
- `cinnamon/cinnamon-workspace-grid-desklet@curbsoftware/`
- `cinnamon/cinnamon-color-timer-clock-desklet@curbsoftware/`
- `cinnamon/cinnamon-world-clock-desklet@curbsoftware/`

The standalone spice repositories (`cinnamon-panel-profiles-applet`, `cinnamon-workspace-names-applet`, `cinnamon-workspace-grid-desklet`, `cinnamon-color-timer-clock-desklet`, and `cinnamon-world-clock-desklet`) were generated from that monorepo by `dev-tools/sync-spice-project.py`. Every managed file in those spice repositories matches the monorepo at the recorded source revision, and those same files still match the monorepo HEAD. Their extra commits are sync and import commits, not separate product changes, so they were not copied into a second folder.

Licenses inside `cinnamon/` stay with the project that shipped them:

- `cinnamon-panel-profiles-applet@curbsoftware/LICENSE`: GPL-2.0
- `cinnamon-workspace-grid-desklet@curbsoftware/LICENSE`: GPL-2.0
- `cinnamon-color-timer-clock-desklet@curbsoftware/LICENSE`: GPL-2.0
- `cinnamon-world-clock-desklet@curbsoftware/LICENSE`: GPL-2.0
- `cinnamon-workspace-names-applet@curbsoftware/`: no LICENSE file
- `command-launcher@curbsoftware/`: no LICENSE file

`cinnamon/cinnamon-docs/` is reference material and keeps the licenses already in that tree. `cinnamon/` also still contains the GNOME and KDE working copies that lived in the development monorepo. The top-level `gnome/` and `kde/` folders are the published standalone repositories.

Release tags were copied under the former repository name (`kde-panel-profiles/v1.0.0`, and the same pattern for the other plasmoids) so identical tag names from different projects do not overwrite each other. vscode-buttons is its own repository again, and its tags were removed from this repo.
