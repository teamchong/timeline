#!/bin/bash

# Timeline Uninstallation Script

set -e

echo "🗑️  Timeline Uninstallation"
echo ""

# Remove from PATH
if [ -L /usr/local/bin/timeline ]; then
    echo "Removing symlink from /usr/local/bin..."
    sudo rm /usr/local/bin/timeline
    echo "✅ Symlink removed"
elif [ -f /usr/local/bin/timeline ]; then
    echo "Removing timeline from /usr/local/bin..."
    sudo rm /usr/local/bin/timeline
    echo "✅ Timeline removed from /usr/local/bin"
else
    echo "ℹ️  Timeline not found in /usr/local/bin"
fi

# Remove Claude Code integration
echo ""
echo "Removing Claude Code integration..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TIMELINE_SCRIPT="$SCRIPT_DIR/timeline"

if [ -f "$TIMELINE_SCRIPT" ]; then
    "$TIMELINE_SCRIPT" uninstall
else
    echo "⚠️  Could not remove Claude Code hooks (timeline script not found)"
fi

echo ""
echo "✅ Uninstallation complete!"
echo ""
echo "Note: The timeline repository at $(dirname "$0") was not deleted."
echo "You can safely delete it if you no longer need it."