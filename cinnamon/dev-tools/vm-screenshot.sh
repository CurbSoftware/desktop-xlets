#!/usr/bin/env bash
# Capture the Cinnamon VM display as a PNG screenshot.
#
# Usage:
#   ./vm-screenshot.sh out.png                 # default domain
#   ./vm-screenshot.sh out.png <domain>        # explicit domain
#
# Domain defaults to $CINNAMON_VM, else 'cinnamon-cinnanom' (see vm-config.sh;
# run `virsh list --all` to see the domains on this host). virsh screenshot
# writes a PPM; Pillow converts it to PNG.
set -euo pipefail

if [ "$#" -ne 1 ] && [ "$#" -ne 2 ]; then
    echo "usage: $0 out.png [domain]" >&2
    exit 2
fi

OUT=$1
DOMAIN=${2:-${CINNAMON_VM:-cinnamon-cinnanom}}
TMP=$(mktemp /tmp/vm-screenshot-XXXXXX.ppm)
trap 'rm -f "$TMP"' EXIT

virsh screenshot "$DOMAIN" "$TMP" --screen 0

python3 - "$TMP" "$OUT" <<'EOF'
import sys
from PIL import Image

Image.open(sys.argv[1]).save(sys.argv[2])
print(f"wrote {sys.argv[2]}")
EOF
