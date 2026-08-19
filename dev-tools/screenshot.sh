#!/usr/bin/env bash
# Capture the live X11 session (whole screen, or a crop box).
#
# Usage:
#   ./screenshot.sh out.png                 # full screen
#   ./screenshot.sh out.png X Y W H         # crop box (pixels)
#
# Uses Pillow's XCB grab (works headless against DISPLAY=:0); falls back to
# gnome-screenshot if Pillow lacks XCB support.
set -euo pipefail

if [ "$#" -ne 1 ] && [ "$#" -ne 5 ]; then
    echo "usage: $0 out.png [X Y W H]" >&2
    exit 2
fi

OUT=$1

python3 - "$@" <<'EOF' || exec gnome-screenshot -f "$OUT"
import sys
from PIL import ImageGrab

out = sys.argv[1]
im = ImageGrab.grab(xdisplay=":0")
if len(sys.argv) == 6:
    x, y, w, h = (int(v) for v in sys.argv[2:6])
    im = im.crop((x, y, x + w, y + h))
im.save(out)
print(f"wrote {out} ({im.size[0]}x{im.size[1]})")
EOF
