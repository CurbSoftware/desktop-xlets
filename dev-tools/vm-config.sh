#!/bin/bash
# VM Configuration for Cinnamon Development
# VM: cinnamon-cinnanom
# Credentials: cinnamon/cinnamon

set -e

VM_NAME="cinnamon-cinnanom"
BRIDGE="br0"

show_help() {
    cat << 'EOF'
=== Cinnamon VM Configuration ===

Usage: ./vm-config.sh <command>

Commands:
  status      Show VM status and IP address
  start       Start the VM
  stop        Stop the VM gracefully
  ssh         SSH into the VM
  bridge      Switch VM to bridged networking (br0)
  nat         Switch VM to NAT networking (virbr0)
  console     Open VM console (virt-viewer)

VM Credentials: cinnamon / cinnamon
EOF
}

get_vm_ip() {
    # Try to get IP from DHCP leases or ARP
    local mac=$(virsh domiflist "$VM_NAME" 2>/dev/null | grep -oE '([0-9a-f]{2}:){5}[0-9a-f]{2}')
    if [ -n "$mac" ]; then
        # Check virsh net-dhcp-leases
        local ip=$(virsh net-dhcp-leases default 2>/dev/null | grep -i "$mac" | awk '{print $5}' | cut -d'/' -f1)
        if [ -n "$ip" ]; then
            echo "$ip"
            return
        fi
        # Check ARP table
        ip=$(arp -an 2>/dev/null | grep -i "$mac" | grep -oE '([0-9]{1,3}\.){3}[0-9]{1,3}')
        if [ -n "$ip" ]; then
            echo "$ip"
            return
        fi
    fi
    echo ""
}

case "${1:-help}" in
    status)
        echo "=== VM Status ==="
        virsh domstate "$VM_NAME"
        echo ""
        echo "Network Interface:"
        virsh domiflist "$VM_NAME"
        echo ""
        IP=$(get_vm_ip)
        if [ -n "$IP" ]; then
            echo "IP Address: $IP"
            echo "SSH: ssh cinnamon@$IP"
        else
            echo "IP Address: (VM not running or IP not found)"
            echo "Tip: Start VM and wait for DHCP, or check 'arp -an'"
        fi
        ;;

    start)
        echo "Starting VM: $VM_NAME"
        virsh start "$VM_NAME"
        echo ""
        echo "Waiting for VM to boot and get IP..."
        for i in {1..30}; do
            sleep 2
            IP=$(get_vm_ip)
            if [ -n "$IP" ]; then
                echo "VM IP: $IP"
                echo "SSH: ssh cinnamon@$IP"
                exit 0
            fi
            echo -n "."
        done
        echo ""
        echo "Could not detect IP. Check manually with: arp -an | grep 52:54"
        ;;

    stop)
        echo "Stopping VM: $VM_NAME"
        virsh shutdown "$VM_NAME"
        ;;

    ssh)
        IP=$(get_vm_ip)
        if [ -z "$IP" ]; then
            echo "ERROR: Cannot find VM IP. Is the VM running?"
            echo "Try: ./vm-config.sh status"
            exit 1
        fi
        echo "Connecting to cinnamon@$IP..."
        ssh -o StrictHostKeyChecking=accept-new cinnamon@"$IP"
        ;;

    bridge)
        echo "Switching $VM_NAME to bridged networking ($BRIDGE)..."

        # Check if VM is running
        STATE=$(virsh domstate "$VM_NAME" 2>/dev/null)
        if [ "$STATE" = "running" ]; then
            echo "ERROR: VM must be stopped first. Run: ./vm-config.sh stop"
            exit 1
        fi

        # Get current MAC
        MAC=$(virsh domiflist "$VM_NAME" | grep -oE '([0-9a-f]{2}:){5}[0-9a-f]{2}')

        # Update network interface
        virsh detach-interface "$VM_NAME" bridge --config 2>/dev/null || true
        virsh attach-interface "$VM_NAME" bridge "$BRIDGE" --model virtio --mac "$MAC" --config

        echo "Done. VM will use bridged networking on next start."
        echo "Run: ./vm-config.sh start"
        ;;

    nat)
        echo "Switching $VM_NAME to NAT networking (virbr0)..."

        STATE=$(virsh domstate "$VM_NAME" 2>/dev/null)
        if [ "$STATE" = "running" ]; then
            echo "ERROR: VM must be stopped first. Run: ./vm-config.sh stop"
            exit 1
        fi

        MAC=$(virsh domiflist "$VM_NAME" | grep -oE '([0-9a-f]{2}:){5}[0-9a-f]{2}')

        virsh detach-interface "$VM_NAME" bridge --config 2>/dev/null || true
        virsh attach-interface "$VM_NAME" bridge virbr0 --model virtio --mac "$MAC" --config

        echo "Done. VM will use NAT networking on next start."
        ;;

    console)
        echo "Opening VM console..."
        virt-viewer "$VM_NAME" &
        ;;

    help|--help|-h|*)
        show_help
        ;;
esac
