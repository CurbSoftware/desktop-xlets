#!/bin/bash
# Install development extensions via symlinks
# This allows editing files in the repo and having changes reflected immediately

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

DESKLET_DIR="$HOME/.local/share/cinnamon/desklets"
APPLET_DIR="$HOME/.local/share/cinnamon/applets"

echo "=== Installing Development Extensions ==="
echo "Project root: $PROJECT_ROOT"
echo ""

# Create directories if they don't exist
mkdir -p "$DESKLET_DIR"
mkdir -p "$APPLET_DIR"

# Function to create symlink
install_extension() {
    local src="$1"
    local dest="$2"
    local name="$(basename "$src")"

    if [ -L "$dest/$name" ]; then
        echo "  Updating symlink: $name"
        rm "$dest/$name"
    elif [ -d "$dest/$name" ]; then
        echo "  WARNING: $name exists as directory, backing up..."
        mv "$dest/$name" "$dest/$name.backup.$(date +%Y%m%d%H%M%S)"
    fi

    ln -s "$src" "$dest/$name"
    echo "  Installed: $name -> $dest/$name"
}

# Install desklets
echo "Installing desklets..."
if [ -d "$PROJECT_ROOT/workspace-grid-desklet@curbsoftware" ]; then
    install_extension "$PROJECT_ROOT/workspace-grid-desklet@curbsoftware" "$DESKLET_DIR"
fi

if [ -d "$PROJECT_ROOT/cinnamon-world-clock@curbsoftware" ]; then
    install_extension "$PROJECT_ROOT/cinnamon-world-clock@curbsoftware" "$DESKLET_DIR"
fi

# Install applets
echo ""
echo "Installing applets..."
if [ -d "$PROJECT_ROOT/workspace-name@curbsoftware" ]; then
    install_extension "$PROJECT_ROOT/workspace-name@curbsoftware" "$APPLET_DIR"
fi

echo ""
echo "=== Installation Complete ==="
echo ""
echo "To reload extensions without restarting Cinnamon:"
echo "  1. Press Win+L to open Looking Glass"
echo "  2. Go to Extensions tab"
echo "  3. Right-click your extension and select 'Reload Code'"
echo ""
echo "Or restart Cinnamon with: cinnamon --replace"
