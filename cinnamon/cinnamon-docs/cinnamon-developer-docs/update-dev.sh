#!/bin/bash

# Updates cinnamon desklet

set -e  # Exit on any error

rm -rf '/home/ubuntu/.local/share/cinnamon/desklets/workspace-grid-desklet@cinnamon-docs'

cp -r '/home/ubuntu/Projects/Cinnamon/cinnamon-developer-docs/desklets/workspace-grid-desklet@cinnamon-docs' '/home/ubuntu/.local/share/cinnamon/desklets/'

# Try different possible locations for cinnamon
pkill -HUP -f "cinnamon --replace" >/dev/null 2>&1 & \

exit 0