#!/bin/bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="$HOME/.local/timeline"
BIN_DIR="$HOME/.local/bin"
TIMELINE_BIN="$BIN_DIR/timeline"

echo -e "${BLUE}Timeline Uninstaller${NC}"
echo "===================="
echo

# Remove Claude Code hooks first
# Check if timeout command is available
if command -v timeout >/dev/null 2>&1; then
    TIMEOUT_CMD="timeout 5"
elif command -v gtimeout >/dev/null 2>&1; then
    # On macOS with coreutils installed
    TIMEOUT_CMD="gtimeout 5"
else
    # No timeout available - skip hook removal to avoid hanging
    echo -e "${YELLOW}Warning: timeout command not found, skipping hook removal to avoid hanging${NC}"
    echo -e "${YELLOW}You can manually remove hooks from ~/.claude/settings.json${NC}"
    TIMEOUT_CMD=""
fi

if [ -n "$TIMEOUT_CMD" ]; then
    if [ -x "$TIMELINE_BIN" ]; then
        echo -e "${BLUE}Removing Claude Code hooks...${NC}"
        $TIMEOUT_CMD "$TIMELINE_BIN" uninstall 2>/dev/null || true
    elif [ -x "./bin/timeline" ]; then
        echo -e "${BLUE}Removing Claude Code hooks (using local binary)...${NC}"
        $TIMEOUT_CMD ./bin/timeline uninstall 2>/dev/null || true
    elif [ -x "./timeline" ]; then
        echo -e "${BLUE}Removing Claude Code hooks (using old binary)...${NC}"
        $TIMEOUT_CMD ./timeline uninstall 2>/dev/null || true
    else
        echo -e "${YELLOW}Timeline binary not found, skipping hook removal${NC}"
    fi
fi

# Remove binary
if [ -f "$TIMELINE_BIN" ]; then
    echo -e "${BLUE}Removing timeline binary...${NC}"
    rm -f "$TIMELINE_BIN"
fi

# Remove installation directory
if [ -d "$INSTALL_DIR" ]; then
    echo -e "${BLUE}Removing installation directory...${NC}"
    rm -rf "$INSTALL_DIR"
fi

# Clean up PATH in shell configs
echo -e "${BLUE}Cleaning up shell configuration...${NC}"
for config in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile"; do
    if [ -f "$config" ]; then
        # Remove timeline PATH entries
        if grep -q "# Timeline\|$BIN_DIR" "$config" 2>/dev/null; then
            grep -v "# Timeline" "$config" | grep -v "$BIN_DIR" > "$config.tmp" 2>/dev/null || true
            if [ -s "$config.tmp" ]; then
                mv "$config.tmp" "$config"
            else
                rm -f "$config.tmp"
            fi
        fi
    fi
done

echo
echo -e "${GREEN}✅ Timeline uninstalled successfully!${NC}"
echo
echo -e "${YELLOW}Note: You may need to reload your shell for PATH changes to take effect.${NC}"
