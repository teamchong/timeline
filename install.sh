#!/bin/bash

# Timeline Git Snapshot Tool Installer
# Builds and installs the timeline binary

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Determine installation directory
if [ "${TIMELINE_SYSTEM_INSTALL:-}" = "true" ]; then
    INSTALL_DIR="/usr/local/bin"
elif [ "${TIMELINE_SYSTEM_INSTALL:-}" = "false" ]; then
    INSTALL_DIR="$HOME/.local/bin"
else
    # Auto-detect best installation path
    USER_DIR="$HOME/.local/bin"
    SYSTEM_DIR="/usr/local/bin"
    
    # Check if user dir is in PATH
    if [[ ":$PATH:" == *":$USER_DIR:"* ]]; then
        echo "✅ Found $USER_DIR in PATH - will install there (no sudo needed)"
        INSTALL_DIR="$USER_DIR"
    else
        echo "⚠️  $USER_DIR is not in your PATH"
        echo ""
        echo "Choose installation location:"
        echo "1) $SYSTEM_DIR (requires sudo, but works immediately)"
        echo "2) $USER_DIR (no sudo, but you'll need to add to PATH)"
        echo ""
        read -p "Enter choice (1 or 2): " choice
        
        case $choice in
            1)
                INSTALL_DIR="$SYSTEM_DIR"
                TIMELINE_SYSTEM_INSTALL=true
                echo "→ Installing to $SYSTEM_DIR (will require sudo)"
                ;;
            2)
                INSTALL_DIR="$USER_DIR"
                TIMELINE_SYSTEM_INSTALL=false
                echo "→ Installing to $USER_DIR (no sudo needed)"
                ;;
            *)
                echo "Invalid choice, defaulting to user directory"
                INSTALL_DIR="$USER_DIR"
                TIMELINE_SYSTEM_INSTALL=false
                ;;
        esac
    fi
fi

echo ""
echo "🚀 Timeline Installer"
echo "===================="
echo "Installing to: $INSTALL_DIR"
echo ""

# Build binaries first
echo "🔨 Building binaries..."
if command -v bun &> /dev/null; then
    cd "$SCRIPT_DIR"
    
    # Check if dependencies are installed
    if [ ! -d "node_modules" ]; then
        echo "📦 Installing dependencies..."
        bun install
        echo "✅ Dependencies installed"
    fi
    
    # Build the binaries
    bun run build
    echo "✅ Binaries built successfully"
else
    echo "❌ Error: Bun is not installed"
    echo ""
    echo "Please install Bun first:"
    echo "  curl -fsSL https://bun.sh/install | bash"
    echo ""
    echo "After installation, restart your terminal and run this script again."
    exit 1
fi

# Check if binary was built successfully
if [ ! -f "$SCRIPT_DIR/bin/timeline" ]; then
    echo "❌ Build failed - binary not found in $SCRIPT_DIR/bin/"
    echo "Expected: timeline"
    exit 1
fi

# Create directories
echo "📁 Creating directories..."
mkdir -p "$INSTALL_DIR"

# Install binary
echo "📦 Installing timeline binary..."

# Use sudo if installing to system directory
if [ "$TIMELINE_SYSTEM_INSTALL" = "true" ]; then
    if ! sudo cp "$SCRIPT_DIR/bin/timeline" "$INSTALL_DIR/timeline"; then
        echo "❌ Failed to install binary (sudo required for $INSTALL_DIR)"
        exit 1
    fi
    sudo chmod +x "$INSTALL_DIR/timeline"
else
    if ! cp "$SCRIPT_DIR/bin/timeline" "$INSTALL_DIR/timeline"; then
        echo "❌ Failed to install binary to $INSTALL_DIR"
        exit 1
    fi
    chmod +x "$INSTALL_DIR/timeline"
fi

# Timeline is now fully implemented in Bun - no bash script needed

# Install Claude Code hooks
echo "🔧 Installing Claude Code hooks..."
if ! "$INSTALL_DIR/timeline" install; then
    echo "⚠️  Hook installation failed, but binary is installed"
    echo "You can try installing hooks manually with: timeline install"
fi

echo ""
echo "✅ Timeline installed successfully!"
echo ""
echo "📍 Binary installed at: $INSTALL_DIR/timeline"
echo ""

# Check PATH
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]] && [ "$INSTALL_DIR" != "/usr/local/bin" ]; then
    echo "⚠️  $INSTALL_DIR is not in your PATH"
    echo ""
    echo "Add this to your shell config (~/.bashrc, ~/.zshrc, etc.):"
    echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
    echo ""
    echo "Or run this now:"
    echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
    echo ""
fi

echo "🎉 Ready to use! Try:"
echo "  timeline --help"
echo "  timeline view"