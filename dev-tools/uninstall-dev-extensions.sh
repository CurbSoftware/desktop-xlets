#!/bin/bash
# Uninstall development extension symlinks

set -e

DESKLET_DIR="$HOME/.local/share/cinnamon/desklets"
APPLET_DIR="$HOME/.local/share/cinnamon/applets"

echo "=== Uninstalling Development Extensions ==="

remove_if_symlink() {
    local path="$1"
    if [ -L "$path" ]; then
        echo "  Removing: $path"
        rm "$path"
    fi
}

# Remove desklets
remove_if_symlink "$DESKLET_DIR/workspace-grid-desklet@curbsoftware"
remove_if_symlink "$DESKLET_DIR/cinnamon-world-clock@curbsoftware"

# Remove applets
remove_if_symlink "$APPLET_DIR/workspace-name@curbsoftware"

echo ""
echo "Done. Development symlinks removed."
