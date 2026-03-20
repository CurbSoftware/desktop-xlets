#!/bin/bash
# Deploy Cinnamon extensions to VM for testing
# VM Credentials: cinnamon/cinnamon

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Configuration
VM_USER="cinnamon"
VM_HOST=""
DESKLET_DIR=".local/share/cinnamon/desklets"
APPLET_DIR=".local/share/cinnamon/applets"

# Extensions to deploy
DESKLETS=(
    "workspace-grid-desklet@curbsoftware"
    "cinnamon-world-clock@curbsoftware"
)
APPLETS=(
    "workspace-name@curbsoftware"
)

show_help() {
    cat << 'EOF'
=== Deploy Extensions to VM ===

Usage: ./deploy-to-vm.sh [options] <vm-ip-or-hostname>

Options:
  -w, --watch     Watch for changes and auto-deploy
  -r, --reload    Restart Cinnamon after deploy (requires user session)
  -d, --desklets  Deploy only desklets
  -a, --applets   Deploy only applets
  -h, --help      Show this help

Examples:
  ./deploy-to-vm.sh 192.168.1.100          # One-time deploy
  ./deploy-to-vm.sh -w 192.168.1.100       # Watch and auto-deploy
  ./deploy-to-vm.sh -r cinnamon-vm.local   # Deploy and restart Cinnamon

VM Credentials: cinnamon / cinnamon
Tip: Use './vm-config.sh status' to find VM IP
EOF
}

# Parse arguments
WATCH=false
RELOAD=false
DEPLOY_DESKLETS=true
DEPLOY_APPLETS=true

while [[ $# -gt 0 ]]; do
    case $1 in
        -w|--watch)
            WATCH=true
            shift
            ;;
        -r|--reload)
            RELOAD=true
            shift
            ;;
        -d|--desklets)
            DEPLOY_APPLETS=false
            shift
            ;;
        -a|--applets)
            DEPLOY_DESKLETS=false
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            VM_HOST="$1"
            shift
            ;;
    esac
done

if [ -z "$VM_HOST" ]; then
    echo "ERROR: VM IP or hostname required"
    echo ""
    show_help
    exit 1
fi

# Check for SSH key
if [ ! -f ~/.ssh/id_ed25519.pub ] && [ ! -f ~/.ssh/id_rsa.pub ]; then
    echo "No SSH key found. Generating one..."
    ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N "" -C "cinnamon-dev"
fi

# Test SSH connection
echo "Testing SSH connection to $VM_USER@$VM_HOST..."
if ! ssh -o BatchMode=yes -o ConnectTimeout=5 "$VM_USER@$VM_HOST" "echo 'SSH OK'" 2>/dev/null; then
    echo ""
    echo "SSH key not authorized. Copying SSH key to VM..."
    echo "Password: cinnamon"
    ssh-copy-id -o StrictHostKeyChecking=accept-new "$VM_USER@$VM_HOST"
fi

# Ensure remote directories exist
echo "Ensuring remote directories exist..."
ssh "$VM_USER@$VM_HOST" "mkdir -p ~/$DESKLET_DIR ~/$APPLET_DIR"

deploy_extension() {
    local src="$1"
    local dest_dir="$2"
    local name="$(basename "$src")"

    if [ ! -d "$src" ]; then
        echo "  SKIP: $name (not found)"
        return
    fi

    echo "  Deploying: $name"
    rsync -avz --delete \
        --exclude='.git' \
        --exclude='*.pyc' \
        --exclude='__pycache__' \
        --exclude='.DS_Store' \
        "$src/" "$VM_USER@$VM_HOST:~/$dest_dir/$name/"
}

deploy_all() {
    echo ""
    echo "=== Deploying Extensions to $VM_HOST ==="
    echo ""

    if $DEPLOY_DESKLETS; then
        echo "Desklets:"
        for desklet in "${DESKLETS[@]}"; do
            deploy_extension "$PROJECT_ROOT/$desklet" "$DESKLET_DIR"
        done
    fi

    if $DEPLOY_APPLETS; then
        echo ""
        echo "Applets:"
        for applet in "${APPLETS[@]}"; do
            deploy_extension "$PROJECT_ROOT/$applet" "$APPLET_DIR"
        done
    fi

    echo ""
    echo "Deploy complete!"

    if $RELOAD; then
        echo ""
        echo "Restarting Cinnamon on VM..."
        # This requires a logged-in desktop session
        ssh "$VM_USER@$VM_HOST" "DISPLAY=:0 cinnamon --replace &" 2>/dev/null || \
            echo "Note: Cinnamon restart requires active desktop session"
    else
        echo ""
        echo "To reload on VM:"
        echo "  1. Press Win+L (Looking Glass) → Extensions → Reload Code"
        echo "  2. Or run: DISPLAY=:0 cinnamon --replace"
    fi
}

watch_and_deploy() {
    echo "=== Watch Mode ==="
    echo "Watching for changes in extensions..."
    echo "Press Ctrl+C to stop"
    echo ""

    # Initial deploy
    deploy_all

    # Check for inotifywait
    if ! command -v inotifywait &> /dev/null; then
        echo ""
        echo "ERROR: inotifywait not found. Install with:"
        echo "  sudo apt install inotify-tools"
        exit 1
    fi

    # Build watch paths
    WATCH_PATHS=()
    if $DEPLOY_DESKLETS; then
        for desklet in "${DESKLETS[@]}"; do
            [ -d "$PROJECT_ROOT/$desklet" ] && WATCH_PATHS+=("$PROJECT_ROOT/$desklet")
        done
    fi
    if $DEPLOY_APPLETS; then
        for applet in "${APPLETS[@]}"; do
            [ -d "$PROJECT_ROOT/$applet" ] && WATCH_PATHS+=("$PROJECT_ROOT/$applet")
        done
    fi

    echo ""
    echo "Watching: ${WATCH_PATHS[*]}"
    echo ""

    while true; do
        inotifywait -r -e modify,create,delete,move "${WATCH_PATHS[@]}" 2>/dev/null
        echo ""
        echo "[$(date '+%H:%M:%S')] Change detected, deploying..."
        deploy_all
    done
}

# Main
if $WATCH; then
    watch_and_deploy
else
    deploy_all
fi
