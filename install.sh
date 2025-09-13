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

echo "Choose installation method for the 'timeline' command:"
echo "  1) Symlink to /usr/local/bin (recommended - auto-updates)"
echo "  2) Copy to /usr/local/bin (standalone)"
echo "  3) Add directory to PATH (manual setup)"
echo "  4) Skip PATH setup (Claude Code auto-save will still work)"
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

# Install Claude Code integration (main purpose of this tool)
echo ""
echo "Installing Claude Code hook for automatic snapshots..."

# Check if Claude settings exist first
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"

if [ ! -f "$SETTINGS_FILE" ]; then
    echo "❌ Claude Code settings file not found at: $SETTINGS_FILE"
    echo "Please make sure Claude Code is installed and configured."
    echo ""
    echo "Note: The timeline command has been installed and will work manually."
    exit 1
fi

# Use timeline command to install hooks
if [ "$INSTALL_METHOD" = "1" ] || [ "$INSTALL_METHOD" = "2" ]; then
    # Timeline should be in PATH now, use it directly
    if command -v timeline &> /dev/null; then
        timeline install
    else
        echo "⚠️  Timeline not found in PATH yet. You may need to restart your terminal."
        echo "   Then run: timeline install"
    fi
elif [ "$INSTALL_METHOD" = "3" ]; then
    echo "⚠️  Timeline not in PATH yet. After adding to PATH and reloading shell, run:"
    echo "   timeline install"
else
    # Method 4: Not in PATH, use full path
    "$TIMELINE_SCRIPT" install
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