#!/bin/bash

# Timeline Installation Script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TIMELINE_SCRIPT="$SCRIPT_DIR/timeline"

echo "📦 Timeline Installation"
echo ""

# Check if timeline script exists
if [ ! -f "$TIMELINE_SCRIPT" ]; then
    echo "❌ Error: timeline script not found at $TIMELINE_SCRIPT"
    exit 1
fi

# Make timeline executable
chmod +x "$TIMELINE_SCRIPT"

echo "Choose installation method:"
echo "  1) Symlink to /usr/local/bin (recommended)"
echo "  2) Copy to /usr/local/bin"
echo "  3) Add directory to PATH (manual setup)"
echo "  4) Claude Code integration only (no PATH setup)"
echo ""
read -p "Select option (1-4, or press Enter for option 1): " INSTALL_METHOD

if [ -z "$INSTALL_METHOD" ]; then
    INSTALL_METHOD="1"
fi

case "$INSTALL_METHOD" in
    "1")
        # Create symlink
        echo "Creating symlink..."
        if [ -L /usr/local/bin/timeline ]; then
            echo "Removing existing symlink..."
            sudo rm /usr/local/bin/timeline
        elif [ -f /usr/local/bin/timeline ]; then
            echo "⚠️  Warning: /usr/local/bin/timeline exists and is not a symlink"
            read -p "Overwrite? (y/N): " -n 1 -r
            echo ""
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                echo "Cancelled."
                exit 1
            fi
            sudo rm /usr/local/bin/timeline
        fi
        
        sudo ln -s "$TIMELINE_SCRIPT" /usr/local/bin/timeline
        echo "✅ Symlink created at /usr/local/bin/timeline"
        echo "   Pointing to: $TIMELINE_SCRIPT"
        ;;
        
    "2")
        # Copy file
        echo "Copying timeline to /usr/local/bin..."
        sudo cp "$TIMELINE_SCRIPT" /usr/local/bin/timeline
        sudo chmod +x /usr/local/bin/timeline
        echo "✅ Timeline copied to /usr/local/bin/timeline"
        echo "   Note: Updates won't be automatic (need to reinstall)"
        ;;
        
    "3")
        # Add to PATH
        echo ""
        echo "To add timeline to your PATH, add this line to your shell config:"
        echo ""
        
        # Detect shell
        if [ -n "$ZSH_VERSION" ]; then
            SHELL_CONFIG="~/.zshrc"
        elif [ -n "$BASH_VERSION" ]; then
            SHELL_CONFIG="~/.bashrc or ~/.bash_profile"
        else
            SHELL_CONFIG="your shell configuration file"
        fi
        
        echo "  export PATH=\"\$PATH:$SCRIPT_DIR\""
        echo ""
        echo "Add to: $SHELL_CONFIG"
        echo ""
        echo "Then reload your shell or run:"
        echo "  source $SHELL_CONFIG"
        ;;
        
    "4")
        echo "Skipping PATH setup..."
        echo "Timeline will only be available through Claude Code hooks"
        ;;
        
    *)
        echo "Invalid option"
        exit 1
        ;;
esac

# Ask about Claude Code integration
echo ""
read -p "Install Claude Code integration? (Y/n): " -n 1 -r INSTALL_CLAUDE
echo ""

if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    echo "Installing Claude Code hook..."
    
    # Use the timeline script to install its own hook
    if [ "$INSTALL_METHOD" = "4" ]; then
        # If not in PATH, use the full path
        "$TIMELINE_SCRIPT" install
    else
        # If in PATH, we can use the command directly
        timeline install
    fi
fi

# Test installation
echo ""
echo "🧪 Testing installation..."

if [ "$INSTALL_METHOD" != "3" ] && [ "$INSTALL_METHOD" != "4" ]; then
    if command -v timeline &> /dev/null; then
        echo "✅ Timeline is available in PATH"
        echo "   Version: $(timeline 2>&1 | head -1 | grep -o 'Usage:' || echo 'Installed')"
    else
        echo "⚠️  Timeline not found in PATH"
        echo "   You may need to restart your terminal"
    fi
else
    echo "✅ Timeline installed at: $TIMELINE_SCRIPT"
fi

echo ""
echo "🎉 Installation complete!"
echo ""
echo "Quick start:"
echo "  timeline         - Show help"
echo "  timeline save    - Create a snapshot"
echo "  timeline travel  - Browse snapshots"
echo "  timeline view    - View timeline contents"
echo ""
echo "Repository: $SCRIPT_DIR"