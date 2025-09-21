#!/bin/bash

# Xvfb Installation Script for Visual Watcher
# This script installs Xvfb (X Virtual Framebuffer) for headfull browser support in headless environments

set -e

echo "🖥️  Visual Watcher - Xvfb Installation Script"
echo "=============================================="

# Function to detect OS
detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if [ -f /etc/debian_version ]; then
            echo "debian"
        elif [ -f /etc/redhat-release ]; then
            echo "redhat"
        elif [ -f /etc/arch-release ]; then
            echo "arch"
        elif [ -f /etc/alpine-release ]; then
            echo "alpine"
        else
            echo "linux-unknown"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macos"
    else
        echo "unknown"
    fi
}

# Function to check if Xvfb is already installed
check_xvfb() {
    if command -v Xvfb >/dev/null 2>&1; then
        echo "✅ Xvfb is already installed at: $(which Xvfb)"
        Xvfb -help 2>&1 | head -1 || echo "Xvfb version information not available"
        return 0
    else
        echo "❌ Xvfb is not installed"
        return 1
    fi
}

# Function to install Xvfb based on OS
install_xvfb() {
    local os=$(detect_os)
    echo "🔍 Detected OS: $os"
    
    case $os in
        "debian")
            echo "📦 Installing Xvfb on Debian/Ubuntu..."
            sudo apt-get update
            sudo apt-get install -y xvfb
            # Also install some useful X11 utilities
            sudo apt-get install -y x11-utils xauth
            ;;
        "redhat")
            echo "📦 Installing Xvfb on RedHat/CentOS/Fedora..."
            if command -v dnf >/dev/null 2>&1; then
                sudo dnf install -y xorg-x11-server-Xvfb
                sudo dnf install -y xorg-x11-utils xauth
            elif command -v yum >/dev/null 2>&1; then
                sudo yum install -y xorg-x11-server-Xvfb
                sudo yum install -y xorg-x11-utils xauth
            else
                echo "❌ Neither dnf nor yum found. Please install Xvfb manually."
                exit 1
            fi
            ;;
        "arch")
            echo "📦 Installing Xvfb on Arch Linux..."
            sudo pacman -S --noconfirm xorg-server-xvfb
            sudo pacman -S --noconfirm xorg-xauth xorg-xdpyinfo
            ;;
        "alpine")
            echo "📦 Installing Xvfb on Alpine Linux..."
            sudo apk add --no-cache xvfb
            sudo apk add --no-cache xauth
            ;;
        "macos")
            echo "📦 Installing XQuartz on macOS..."
            if command -v brew >/dev/null 2>&1; then
                brew install --cask xquartz
                echo "⚠️  Note: You may need to log out and log back in for XQuartz to work properly."
            else
                echo "❌ Homebrew not found. Please install Homebrew first or install XQuartz manually from:"
                echo "   https://www.xquartz.org/"
                exit 1
            fi
            ;;
        *)
            echo "❌ Unsupported or unknown operating system: $OSTYPE"
            echo "Please install Xvfb manually using your system's package manager."
            echo ""
            echo "Common installation commands:"
            echo "  Debian/Ubuntu: sudo apt-get install xvfb"
            echo "  RedHat/CentOS: sudo yum install xorg-x11-server-Xvfb"
            echo "  Fedora:        sudo dnf install xorg-x11-server-Xvfb"
            echo "  Arch:          sudo pacman -S xorg-server-xvfb"
            echo "  Alpine:        sudo apk add xvfb"
            echo "  macOS:         brew install --cask xquartz"
            exit 1
            ;;
    esac
}

# Function to test Xvfb installation
test_xvfb() {
    echo "🧪 Testing Xvfb installation..."
    
    # Find an available display
    local display_num=99
    while [ -f "/tmp/.X${display_num}-lock" ]; do
        display_num=$((display_num + 1))
    done
    
    echo "   Starting test Xvfb on display :${display_num}..."
    
    # Start Xvfb in background
    Xvfb :${display_num} -screen 0 1024x768x24 -ac -nolisten tcp &
    local xvfb_pid=$!
    
    # Wait a moment for Xvfb to start
    sleep 2
    
    # Test if display is working
    if DISPLAY=:${display_num} xdpyinfo >/dev/null 2>&1; then
        echo "✅ Xvfb test successful! Virtual display :${display_num} is working."
        
        # Test with a simple X client if available
        if command -v xwininfo >/dev/null 2>&1; then
            echo "   Testing X client connection..."
            if DISPLAY=:${display_num} timeout 5 xwininfo -root >/dev/null 2>&1; then
                echo "✅ X client test successful!"
            else
                echo "⚠️  X client test failed, but basic Xvfb is working."
            fi
        fi
    else
        echo "❌ Xvfb test failed! Display :${display_num} is not accessible."
        kill $xvfb_pid 2>/dev/null || true
        exit 1
    fi
    
    # Clean up test Xvfb
    kill $xvfb_pid 2>/dev/null || true
    echo "   Test cleanup completed."
}

# Function to show usage information
show_usage() {
    echo ""
    echo "🎯 Usage with Visual Watcher:"
    echo ""
    echo "1. Set headfull mode in your environment or sites.yaml:"
    echo "   PLAYWRIGHT_HEADLESS=false"
    echo ""
    echo "2. Optionally configure Xvfb settings:"
    echo "   XVFB_ENABLED=true        # Enable Xvfb (default: true)"
    echo "   XVFB_DISPLAY=99          # Display number (default: 99)"
    echo "   XVFB_WIDTH=1920          # Screen width (default: 1920)"
    echo "   XVFB_HEIGHT=1080         # Screen height (default: 1080)"
    echo "   XVFB_DEPTH=24            # Color depth (default: 24)"
    echo ""
    echo "3. Run your scraper - Xvfb will start automatically when needed!"
    echo ""
    echo "🔧 Manual Xvfb usage:"
    echo "   Start: Xvfb :99 -screen 0 1920x1080x24 -ac &"
    echo "   Use:   DISPLAY=:99 your-application"
    echo "   Stop:  pkill Xvfb"
    echo ""
}

# Main execution
main() {
    echo ""
    
    # Check if already installed
    if check_xvfb; then
        echo ""
        echo "🎉 Xvfb is already available!"
        
        # Test it anyway
        test_xvfb
        show_usage
        exit 0
    fi
    
    echo ""
    
    # Ask for confirmation unless --yes flag is provided
    if [[ "$1" != "--yes" && "$1" != "-y" ]]; then
        echo "This script will install Xvfb and related X11 utilities."
        echo "You may be prompted for your sudo password."
        echo ""
        read -p "Continue with installation? (y/N): " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Installation cancelled."
            exit 0
        fi
    fi
    
    # Install Xvfb
    install_xvfb
    
    echo ""
    
    # Verify installation
    if check_xvfb; then
        echo ""
        test_xvfb
        echo ""
        echo "🎉 Xvfb installation completed successfully!"
        show_usage
    else
        echo ""
        echo "❌ Installation appears to have failed. Please check the output above for errors."
        exit 1
    fi
}

# Handle command line arguments
case "${1:-}" in
    --help|-h)
        echo "Xvfb Installation Script for Visual Watcher"
        echo ""
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  --yes, -y     Skip confirmation prompt"
        echo "  --help, -h    Show this help message"
        echo ""
        echo "This script automatically detects your operating system and installs"
        echo "Xvfb (X Virtual Framebuffer) for running headfull browsers in headless"
        echo "environments like servers or containers."
        exit 0
        ;;
esac

# Run main function
main "$@"

