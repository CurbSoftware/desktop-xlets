#!/bin/bash
# Cinnamon Development Sandbox
#
# NOTE: Cinnamon doesn't work reliably in Xephyr due to monitor detection issues.
# This script provides alternative approaches for isolated testing.

set -e

show_help() {
    cat << 'EOF'
=== Cinnamon Development Sandbox ===

Cinnamon has issues running in Xephyr (monitor detection fails).
Here are your options for isolated development:

OPTION 1: Hot Reload (Recommended for most changes)
-------------------------------------------------
For code changes that won't crash Cinnamon:
  1. Edit your extension files
  2. Press Win+L to open Looking Glass
  3. Go to "Extensions" tab
  4. Right-click your extension → "Reload Code"

OPTION 2: Virtual Machine (Best for crash isolation)
---------------------------------------------------
Use a VM for testing crash-prone changes:

  # Install GNOME Boxes (simplest)
  sudo apt install gnome-boxes

  # Or VirtualBox
  sudo apt install virtualbox

  # Or QEMU/KVM (best performance)
  sudo apt install qemu-kvm virt-manager

Create a Linux Mint VM, install your extensions there.

OPTION 3: Test with a Simple Window Manager
------------------------------------------
Test individual UI components in Xephyr with a basic WM:

  ./start-sandbox.sh --xfwm4    # Use Xfce window manager
  ./start-sandbox.sh --openbox  # Use Openbox

OPTION 4: Cinnamon2D (Software Rendering)
----------------------------------------
Sometimes works better in constrained environments:

  ./start-sandbox.sh --2d

Run './start-sandbox.sh --help' for this message.
EOF
}

# Configuration
DISPLAY_NUM="${DISPLAY_NUM:-:10}"
RESOLUTION="${RESOLUTION:-1280x720}"
MODE="help"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --help|-h)
            show_help
            exit 0
            ;;
        --xfwm4)
            MODE="xfwm4"
            shift
            ;;
        --openbox)
            MODE="openbox"
            shift
            ;;
        --2d)
            MODE="cinnamon2d"
            shift
            ;;
        --cinnamon)
            MODE="cinnamon"
            shift
            ;;
        :*)
            DISPLAY_NUM="$1"
            shift
            ;;
        *x*)
            RESOLUTION="$1"
            shift
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

if [ "$MODE" = "help" ]; then
    show_help
    exit 0
fi

# Check dependencies
if ! command -v Xephyr &> /dev/null; then
    echo "ERROR: Xephyr not installed. Install with:"
    echo "  sudo apt install xserver-xephyr"
    exit 1
fi

echo "=== Cinnamon Development Sandbox ==="
echo "Display: $DISPLAY_NUM"
echo "Resolution: $RESOLUTION"
echo "Mode: $MODE"
echo ""

# Kill any existing Xephyr on this display
pkill -f "Xephyr $DISPLAY_NUM" 2>/dev/null || true
sleep 1

echo "Starting Xephyr nested X server..."
Xephyr $DISPLAY_NUM -screen $RESOLUTION -resizeable 2>/dev/null &
XEPHYR_PID=$!
sleep 2

# Verify Xephyr started
if ! kill -0 $XEPHYR_PID 2>/dev/null; then
    echo "ERROR: Failed to start Xephyr"
    exit 1
fi

echo "Xephyr running (PID: $XEPHYR_PID)"
echo ""

cleanup() {
    echo "Stopping sandbox..."
    kill $XEPHYR_PID 2>/dev/null || true
    echo "Sandbox stopped."
}
trap cleanup EXIT

case $MODE in
    xfwm4)
        if ! command -v xfwm4 &> /dev/null; then
            echo "ERROR: xfwm4 not installed. Install with: sudo apt install xfwm4"
            exit 1
        fi
        echo "Starting xfwm4 window manager..."
        echo "You can run 'DISPLAY=$DISPLAY_NUM your-test-app' to test St widgets"
        DISPLAY=$DISPLAY_NUM xfwm4 &
        DISPLAY=$DISPLAY_NUM xterm
        ;;
    openbox)
        if ! command -v openbox &> /dev/null; then
            echo "ERROR: openbox not installed. Install with: sudo apt install openbox"
            exit 1
        fi
        echo "Starting openbox window manager..."
        echo "You can run 'DISPLAY=$DISPLAY_NUM your-test-app' to test St widgets"
        DISPLAY=$DISPLAY_NUM openbox &
        DISPLAY=$DISPLAY_NUM xterm
        ;;
    cinnamon2d)
        echo "Starting Cinnamon2D (software rendering)..."
        echo "NOTE: This may still fail due to monitor detection issues."
        echo "Press Ctrl+C to stop."
        DISPLAY=$DISPLAY_NUM cinnamon2d --replace 2>&1 | while read line; do
            echo "[Cinnamon2D] $line"
        done
        ;;
    cinnamon)
        echo "WARNING: Cinnamon typically fails in Xephyr due to monitor detection."
        echo "Press Ctrl+C to stop."
        DISPLAY=$DISPLAY_NUM cinnamon --replace 2>&1 | while read line; do
            echo "[Cinnamon] $line"
        done
        ;;
esac
