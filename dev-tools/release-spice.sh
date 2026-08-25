#!/usr/bin/env bash
# Run tests, build one independent spice tree, and optionally run live checks.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <alias-or-uuid> [spices-release release options]" >&2
    exit 2
fi

extension="$1"
shift
exec python3 "$SCRIPT_DIR/spices-release.py" release "$extension" "$@"
