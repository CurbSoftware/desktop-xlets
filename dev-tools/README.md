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

#### VM: cinnamon-cinnanom
- **Credentials**: `cinnamon` / `cinnamon`
- **Network**: Bridged (br0) for direct SSH access

#### Quick Start with VM

```bash
# 1. Switch VM to bridged networking (one-time setup)
./vm-config.sh bridge

# 2. Start the VM
./vm-config.sh start
# Note the IP address shown

# 3. Deploy extensions to VM
./deploy-to-vm.sh <vm-ip>

# 4. Watch mode: auto-deploy on file changes
./deploy-to-vm.sh -w <vm-ip>
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

```bash
./deploy-to-vm.sh <ip>           # One-time deploy
./deploy-to-vm.sh -w <ip>        # Watch mode (auto-deploy)
./deploy-to-vm.sh -r <ip>        # Deploy and restart Cinnamon
./deploy-to-vm.sh -d <ip>        # Deploy desklets only
./deploy-to-vm.sh -a <ip>        # Deploy applets only
```

#### Prerequisites for Watch Mode

```bash
sudo apt install inotify-tools
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
| `vm-config.sh` | Manage VM (start, stop, SSH, network config) |
| `deploy-to-vm.sh` | Rsync extensions to VM with watch mode |
| `install-dev-extensions.sh` | Create symlinks for local development |
| `uninstall-dev-extensions.sh` | Remove local development symlinks |
| `start-sandbox.sh` | Xephyr options (limited, run with --help) |

## Quick Start

```bash
# Install extensions as symlinks
./install-dev-extensions.sh

# Add extensions via System Settings → Desklets/Applets

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
