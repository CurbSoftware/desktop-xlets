#!/usr/bin/env bash
# Ensure each standalone GNOME/KDE port repo (and the AppImage product
# repo) exists under ../ports, then sync, commit, and push to origin main.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec python3 "$SCRIPT_DIR/sync-port-project.py" publish "$@"
