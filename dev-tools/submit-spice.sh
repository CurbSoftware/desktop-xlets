#!/usr/bin/env bash
# Submit one spice to the Cinnamon Spices registry. Forks the registry repo and
# clones it on demand, runs the test gates, prepares the branch, runs the
# official validate-spice, pushes, and opens the PR. Run when the spice is ready.
#
# Usage: submit-spice.sh <alias> [--replace-existing] [--live] [--branch NAME]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <alias-or-uuid> [--replace-existing] [--live] [--branch NAME]" >&2
    exit 2
fi

exec python3 "$SCRIPT_DIR/sync-spice-project.py" submit "$@"
