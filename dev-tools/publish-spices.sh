#!/usr/bin/env bash
# Ensure each standalone spice repo exists under ../cinnamon (clone or create
# on GitHub), then sync, commit, and push every one to origin main.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec python3 "$SCRIPT_DIR/sync-spice-project.py" publish "$@"
