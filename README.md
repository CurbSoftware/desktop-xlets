# Cinnamon extensions (CurbSoftware)

This is the **one development repo** for CurbSoftware Cinnamon desklets and applets.

Git remote: [CurbSoftware/cinnamon-monorepo](https://github.com/CurbSoftware/cinnamon-monorepo).

Work here. Do not open `/home/user/projects/cinnamon-projects` (renamed to `cinnamon-projects.retired`). Per-spice GitHub repos and `cinnamon-spices-desklets` are publish clones only, not a second product.

## Extensions

| Directory | UUID | Kind |
|---|---|---|
| `cinnamon-world-clock-desklet@curbsoftware/` | World Clock | desklet |
| `cinnamon-color-timer-clock-desklet@curbsoftware/` | Color Timer Clock | desklet |
| `cinnamon-workspace-grid-desklet@curbsoftware/` | Workspace Grid | desklet |
| `cinnamon-workspace-name-applet@curbsoftware/` | Workspace Name | applet |
| `cinnamon-panel-profiles-applet@curbsoftware/` | Panel Profiles | applet |
| `command-launcher@curbsoftware/` | Command Launcher | applet |

Each directory name must match `metadata.json` `uuid` or Cinnamon refuses to load it.

`cinnamon-docs/` is reference material (official docs and Spices examples), not an extension.

## Install (no root)

From this repo root:

```bash
./dev-tools/install-extensions.sh -m symlink
```

That links each UUID into `~/.local/share/cinnamon/{desklets,applets}/<uuid>/`. Edits show up live. Filter with `-n '*clock*'`, `--type desklets`, or `--type applets`. Copy install (default, no `-m symlink`) replaces a prior copy. `--uninstall` removes them. `--help` lists the rest.

Then restart Cinnamon if it is already running: **Alt-F2**, type `r`, Enter. Add the desklet or applet from Cinnamon Settings.

Details: [`dev-tools/README.md`](dev-tools/README.md). Agent notes: [`AGENTS.md`](AGENTS.md).

## Publishing to Cinnamon Spices

Linux Mint wants **one spice per pull request** against [linuxmint/cinnamon-spices-desklets](https://github.com/linuxmint/cinnamon-spices-desklets). Do not develop in those clones. Copy out from this monorepo into an isolated per-spice repo when you are ready to PR.

Full path: [`docs/spices-publication.md`](docs/spices-publication.md).
