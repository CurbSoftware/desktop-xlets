# Cinnamon extensions (CurbSoftware)

This is the **one development repo** for CurbSoftware Cinnamon desklets and applets.

Git remote: [CurbSoftware/cinnamon-monorepo](https://github.com/CurbSoftware/cinnamon-monorepo).

Work here. Never develop in a generated copy. Per-spice repos under
`~/projects/cinnamon/` and the registry clones are publish targets
only, produced by scripts, not a second product.

New here? Start with [`docs/repo-guide.md`](docs/repo-guide.md), which walks
the whole repo: every extension, every dev tool, and how releases ship.

## Extensions

| Directory | UUID | Kind |
|---|---|---|
| `cinnamon-world-clock-desklet@curbsoftware/` | World Clock | desklet |
| `cinnamon-color-timer-clock-desklet@curbsoftware/` | Color Timer Clock | desklet |
| `cinnamon-workspace-grid-desklet@curbsoftware/` | Workspace Grid | desklet |
| `cinnamon-workspace-names-applet@curbsoftware/` | In Panel Workspace Name | applet |
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

Push every standalone repo from the monorepo, then submit one spice at a time:

```bash
./dev-tools/publish-spices.sh                # sync, commit, push each repo to origin main
./dev-tools/submit-spice.sh <alias>          # open the registry PR when the spice is ready
```

Linux Mint wants **one spice per pull request** against
[linuxmint/cinnamon-spices-desklets](https://github.com/linuxmint/cinnamon-spices-desklets)
or `-applets`.

Full path: [`docs/spices-publication.md`](docs/spices-publication.md).
