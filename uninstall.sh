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
if [ -x "$TIMELINE_BIN" ]; then
    echo -e "${BLUE}Removing Claude Code hooks...${NC}"
    "$TIMELINE_BIN" uninstall 2>/dev/null || true
elif [ -x "./timeline" ]; then
    echo -e "${BLUE}Removing Claude Code hooks...${NC}"
    ./timeline uninstall 2>/dev/null || true
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
        grep -v "# Timeline" "$config" | grep -v "$BIN_DIR" > "$config.tmp" || true
        mv "$config.tmp" "$config"
    fi
done

echo
echo -e "${GREEN}✅ Timeline uninstalled successfully!${NC}"
echo
echo -e "${YELLOW}Note: You may need to reload your shell for PATH changes to take effect.${NC}"
