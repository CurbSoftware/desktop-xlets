#!/usr/bin/env bash
# Ensure each standalone spice repo exists under ../cinnamon (clone or create
# on GitHub under RobertAlexanderH), then sync, commit, and push to origin main.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec python3 "$SCRIPT_DIR/sync-spice-project.py" publish "$@"
