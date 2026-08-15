# Cinnamon Extension Development Tools

Tools for developing and testing Cinnamon desklets and applets.

## Prerequisites

```bash
sudo apt install xserver-xephyr
```

## Development Approaches

### 1. Hot Reload via Looking Glass (Recommended)

For most development, you don't need isolation. Just reload your code:

1. Edit your extension files
2. Press `Win+L` to open Looking Glass (Melange debugger)
3. Go to "Extensions" tab
4. Right-click your extension → "Reload Code"

This is fast and works for 90% of changes.

### 2. VM Testing with Auto-Deploy (Best Crash Isolation)

**Cinnamon doesn't work in Xephyr** due to monitor detection issues ([GitHub #11142](https://github.com/linuxmint/cinnamon/issues/11142)). Use the pre-configured VM instead.

#### VM
- **Domain name**: host-specific. `vm-config.sh` defaults to `cinnamon-cinnanom`
  and exits with the list of available domains if it does not exist. Override with
  `export CINNAMON_VM=<name>` — run `virsh list --all` to see what you have.
- **Credentials**: `cinnamon` / `cinnamon`
- **Network**: Bridged (br0) for direct SSH access

#### Quick Start with VM

```bash
# 1. Switch VM to bridged networking (one-time setup)
./vm-config.sh bridge

# 2. Start the VM
./vm-config.sh start
# Note the IP address shown

# 3. Deploy extensions: SSH in and run the installer on the VM
ssh cinnamon@<vm-ip>
#   then on the VM: cd <repo> && ./dev-tools/install-extensions.sh -y
```

#### VM Commands

```bash
./vm-config.sh status   # Show VM status and IP
./vm-config.sh start    # Start VM and show IP
./vm-config.sh stop     # Gracefully stop VM
./vm-config.sh ssh      # SSH into VM
./vm-config.sh bridge   # Switch to bridged network (br0)
./vm-config.sh nat      # Switch to NAT network (virbr0)
./vm-config.sh console  # Open graphical console
```

#### Deploy Commands

`deploy-to-vm.sh` has been removed. To deploy to the VM, SSH in and run the
installer, or use rsync directly. See `install-extensions.sh --help`.

```bash
# Run the installer inside the VM (recommended)
ssh cinnamon@<vm-ip> 'cd <repo> && ./dev-tools/install-extensions.sh -y --reload'

# Or one-off rsync of a single extension
rsync -avz --delete --exclude='.git' \
    ../<ext-dir>/ cinnamon@<vm-ip>:~/.local/share/cinnamon/desklets/<uuid>/
```

To replicate the old watch mode, use a file watcher that re-runs rsync:

```bash
sudo apt install inotify-tools
while inotifywait -rq -e modify,create,delete,move <ext-dir>; do
    rsync -avz --delete --exclude='.git' <ext-dir>/ <vm>:<dest>/
done
```

### 3. Developer's Tools Desklet

A specialized desklet with a JavaScript/CSS sandbox:

1. Open System Settings → Desklets → Download
2. Search "Developer's Tools"
3. Install and add to desktop

Features: JS sandbox, CSS testing, object inspector.

Website: https://cinnamon-spices.linuxmint.com/desklets/view/17

### 4. Alternative Window Managers in Xephyr

Test individual UI components with a simpler WM:

```bash
./start-sandbox.sh --openbox   # Lightweight WM
./start-sandbox.sh --xfwm4     # Xfce WM
```

Then run test apps with `DISPLAY=:10 your-test-app`.

## Scripts

| Script | Purpose |
|--------|---------|
| `install-extensions.sh` | Install/uninstall desklets & applets to `~/.local/share/cinnamon/...` (copy or symlink; auto-discovers extensions) |
| `vm-config.sh` | Manage VM (start, stop, SSH, network config). Override the domain with `CINNAMON_VM=` |
| `start-sandbox.sh` | Xephyr options (limited, run with --help) |
| `cinnamon_eval.py` | Run JavaScript inside the live Cinnamon process over DBus |
| `test-workspace-actions.js` | Headless unit tests for the shared workspace logic (`gjs`) |
| `live-test-desklet.py` | Live edge-case matrix for the workspace grid desklet |
| `live-test-applet.py` | Live test for the workspace name applet |

## Testing

```bash
# Headless: pure logic only, no Cinnamon process required
gjs dev-tools/test-workspace-actions.js

# Live: drives the running desktop through org.Cinnamon.Eval
python3 dev-tools/live-test-desklet.py
python3 dev-tools/live-test-applet.py
```

`St` widgets cannot be instantiated outside the Cinnamon process — `libst.so`
is not on the loader path — so anything touching actors has to be tested live.
That is what `cinnamon_eval.py` is for:

```bash
./dev-tools/cinnamon_eval.py 'global.workspace_manager.n_workspaces'
```

Both live drivers are non-destructive by construction: they only remove
workspaces they appended themselves, restore workspace names, count, active
index and `enabled-applets` on exit (including on failure, via `atexit`), and
fail if `~/.xsession-errors` gained a single new `JS ERROR` line during the run.

Reload an xlet without the Looking Glass GUI:

```bash
gdbus call --session --dest org.Cinnamon --object-path /org/Cinnamon \
  --method org.Cinnamon.ReloadXlet 'cinnamon-workspace-grid-desklet@curbsoftware' DESKLET
```

## Installing Extensions

`install-extensions.sh` auto-discovers every `*@*` directory in the repo that
has a `metadata.json` and installs it into the user-specific Cinnamon
directories, named after the extension's UUID:

```
~/.local/share/cinnamon/desklets/<uuid>/
~/.local/share/cinnamon/applets/<uuid>/
```

### Usage

```bash
./install-extensions.sh                       # install everything (copy)
./install-extensions.sh --type desklets       # desklets only
./install-extensions.sh -n '*clock*'          # only extensions matching a glob
./install-extensions.sh -m symlink -y         # dev symlinks, no prompt
./install-extensions.sh --backup --reload     # backup prior install, restart Cinnamon
./install-extensions.sh --dry-run             # preview only (changes nothing)
./install-extensions.sh --uninstall           # remove installed extensions
./install-extensions.sh --help                # full reference
```

### Options

| Flag | Description |
|------|-------------|
| `-t, --type {desklets\|applets\|all}` | Filter by type (default: `all`) |
| `-n, --name <glob>` | Restrict by UUID or source-dir glob (quote it) |
| `-m, --mode {copy\|symlink}` | `copy` (default, true install) or `symlink` (dev) |
| `-b, --backup` | Back up existing install dir to `<uuid>.bak.<ts>` |
| `--dry-run` | Print actions without performing them |
| `-y, --yes` | Skip confirmation (required when stdin is not a tty) |
| `-r, --reload` | Run `cinnamon --replace &` after install |
| `--uninstall` | Remove matched extensions instead of installing |

By default the script **copies** files (a real install that replaces any prior
copy). Pass `-m symlink` for development so edits reflect immediately without
reinstalling.

## Quick Start

```bash
# Install all extensions (copies into place)
./install-extensions.sh

# Add them via System Settings → Desklets/Applets

# Edit files, then reload:
# Win+L → Extensions → Right-click → Reload Code
```

## Debugging

### Log Output

```javascript
// In your extension code
global.log("Debug message");
global.logError("Error message");
```

### View Logs

```bash
# Real-time log monitoring
tail -f ~/.xsession-errors | grep -i cinnamon

# Or use Looking Glass → Log tab
```

### Log Locations

| Cinnamon Version | Location |
|------------------|----------|
| 3.8+ | `~/.xsession-errors` |
| 3.6 and below | `~/.cinnamon/glass.log` |

## File Locations

| Type | Install Path |
|------|--------------|
| Desklets | `~/.local/share/cinnamon/desklets/` |
| Applets | `~/.local/share/cinnamon/applets/` |
| Extensions | `~/.local/share/cinnamon/extensions/` |

## Troubleshooting

### Extension not loading
- Verify metadata.json UUID matches directory name
- Check Looking Glass Log for JavaScript errors
- Verify file permissions (`chmod 644` for files)

### Changes not reflecting
1. Try "Reload Code" in Looking Glass
2. If that fails: `cinnamon --replace`
3. Last resort: Log out and back in

### Cinnamon crashes on load
- Check `~/.xsession-errors` for the error
- Use a VM to test risky changes
- Wrap initialization code in try/catch

## Resources

- [Cinnamon Developer Docs](https://projects.linuxmint.com/cinnamon/)
- [Developer's Tools Desklet](https://cinnamon-spices.linuxmint.com/desklets/view/17)
- [Writing Applets Tutorial](https://billauer.co.il/blog/2018/12/writing-cinnamon-applet/)
- [Cinnamon Spices GitHub](https://github.com/linuxmint/cinnamon-spices-applets)
