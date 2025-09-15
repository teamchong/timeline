# Timeline - Git Snapshot Tool for Claude Code

A lightweight, zero-impact Git utility designed for [Claude Code](https://claude.ai/code) that automatically captures code snapshots as you work, allowing you to travel back to any point without affecting your Git history.

> **Primary Purpose**: Timeline is built specifically for Claude Code users to automatically capture snapshots after every file edit. While the `timeline` command can be used standalone, the automatic snapshot feature (the main value) requires Claude Code.

## Features

- 🤖 **Claude Code Integration** - Automatic snapshots after each file edit in Claude Code
- 🚀 **Zero-impact snapshots** - Creates lightweight branches without affecting your working tree
- ⏱️ **Instant recovery** - Travel back to any point without affecting Git history
- 🔍 **Powerful search** - Search across all timelines by content or filename  
- 📋 **Smart filtering** - Only shows timelines and files with actual differences
- 🗂️ **Interactive browsing** - Browse individual files with full diff highlighting
- 🧹 **Manual cleanup** - Remove orphaned timelines when branches are deleted
- 🎯 **Branch-aware** - Separate timelines for each Git branch

## Installation

### One-Line Install (with Auto-Save)

```bash
git clone https://github.com/teamchong/timeline.git && cd timeline && ./install.sh
```

This will:
1. Clone the repository
2. Create a symlink in `/usr/local/bin` for the `timeline` command
3. **Install Claude Code hook for automatic snapshots** (the main feature!)
4. Verify the installation

After installation, Timeline will automatically save snapshots whenever you edit files in Claude Code - no manual saving needed!

### Manual Install

```bash
# Clone the repository to your preferred location
git clone https://github.com/teamchong/timeline.git /path/to/timeline

# Run the installer
cd /path/to/timeline
./install.sh
```

The installer will:
1. Set up the `timeline` command (with options for symlink/copy/PATH)
2. **Always install the Claude Code hook** for automatic snapshots

Installation options for the command:
- **Symlink** (recommended) - Updates automatically when you pull changes
- **Copy** - Standalone installation
- **PATH setup** - Add the repo directory to PATH
- **Skip PATH** - Claude Code auto-save will still work without global command

### Uninstall

```bash
/path/to/timeline/uninstall.sh
```

## Usage

### Basic Commands

```bash
timeline              # Show help
timeline save         # Create a timeline manually
timeline travel       # Browse and restore timelines
timeline view         # Quick view all timelines with changes
timeline browse       # Browse files in a specific timeline
timeline search       # Search for text across timelines
timeline delete       # Delete timelines interactively
timeline cleanup      # Remove orphaned timelines
```

### Command Details

#### `timeline view`
Shows all timelines with a preview of changed files. Each timeline displays:
- Timeline description and commit reference
- Files that changed compared to current workspace
- First 3 lines of changes for each file
- **Smart filtering**: Only shows timelines with actual differences from current workspace

#### `timeline browse`
Interactive file browser for a specific timeline:
1. Select a timeline to browse (only shows timelines with differences)
2. See list of files different from current workspace (only files with actual changes)
3. Select a file to view its full diff with color highlighting
4. **No false positives**: Every listed file is guaranteed to have viewable differences

#### `timeline search [pattern]`
Search across all timelines. Can be used two ways:
```bash
timeline search "function"  # Direct search for 'function'
timeline search            # Interactive prompt for search query
```

Features:
- **Searches both content and filenames** by default
- **Smart filtering**: Only searches in timelines and files that differ from current workspace
- **Regex support**: Use patterns like `"function.*test"`

### Timeline Display

Each timeline shows:
```
0: +0 Initial commit @abc123
   +++---  1 files, +10 lines, -5 lines
```

- Visual indicators: `+` for additions, `-` for deletions
- File count and line changes
- Incremental diffs between snapshots

## How It Works

Timeline uses Git's plumbing commands to create lightweight branches in `refs/heads/timelines/` that:
- Are organized under `timelines/` prefix to keep them separate
- Don't affect your working directory or HEAD
- Don't interfere with normal Git operations
- Can be manually cleaned up when branches are deleted

Each timeline captures:
- All staged changes
- All unstaged changes
- All untracked files
- Current HEAD reference

### Smart Filtering
Timeline intelligently filters what you see:
- **Timeline level**: Only shows timelines that differ from your current workspace
- **File level**: Only shows files that have actual changes when browsing
- **Search level**: Only searches in content that differs from current state
- **No duplicates**: Never shows the same state twice (skips timelines identical to HEAD)

## Claude Code Integration

Timeline is specifically designed for Claude Code users. Once installed, it:
- **Automatically captures snapshots after every file edit** (no manual saving needed!)
- Provides instant recovery from any changes
- Maintains separate timelines per Git branch
- Works silently in the background with zero performance impact

The hook is installed automatically during setup. To manage it manually:
```bash
timeline install    # Add/update Claude Code hook
timeline uninstall  # Remove Claude Code hook
```

> **How it works**: Timeline uses Claude Code's PostToolUse hook to detect file changes and automatically create snapshots using Git's plumbing commands.

## Examples

### How Auto-Save Works
```
User: "Please refactor this function"
Claude: [Edits src/utils.js via Edit tool]
Timeline: ✅ Automatically creates snapshot after edit

User: "Actually, that broke something"
Claude: Let me check the timelines...
> timeline travel
# Selects previous snapshot
# Working code restored!
```

### Recover from accidental changes
```bash
# After Claude Code makes multiple edits that break your code
# (Timeline has been automatically saving snapshots)

# View recent timelines
timeline travel

# Preview shows what will change before confirming
# Select timeline from before the breaking changes
# Your working code is restored!
```

### Find when code was removed
```bash
# Search for removed function
timeline search "oldFunction"

# Shows which timeline contains it with context
# Use timeline travel to recover the code
```

### Recover from destructive git operations
```bash
# Working on ImportantChange.ts in Claude Code
# Timeline automatically saves snapshots after each edit

# Accidentally run destructive git command
git checkout HEAD ImportantChange.ts  # ❌ Destroys your work!

# But Timeline has your back! 🎉
timeline travel

# Timeline shows:
#   0: +15 Add user authentication logic @abc123
#      +++++-----  1 files, +45 lines, -12 lines  
#   1: +16 Fix validation edge cases @abc123  
#      +++  1 files, +8 lines, -0 lines
#   2: +17 Add comprehensive error handling @abc123
#      ++++--  1 files, +23 lines, -5 lines

# Select timeline 2 (your latest work)
# Preview shows exactly what you'll recover
# Confirm and your destroyed work is restored!
```

### Browse specific timeline contents
```bash
# Quick overview of all changes
timeline view

# Deep dive into a specific timeline
timeline browse
# Select timeline number
# Browse individual files and see full diffs
```

### Search examples
```bash
# Direct search
timeline search "TODO"           # Find all TODOs
timeline search "function.*test" # Regex patterns work
timeline search "auth"           # Find authentication code

# Interactive search
timeline search
# 🔍 Enter search query: [you type your pattern]
# Automatically searches both content and filenames
# Shows results with file context and line numbers
```

## Requirements

### Core Dependencies
- **Git** 2.23+ (for `git restore`, falls back to `git checkout` for older versions)
- **Bash** 3.2+ (macOS compatible)
- Standard Unix utilities (included on all Unix-like systems):
  - `head`, `tail`, `cut`, `grep`, `sed`, `sort`, `wc`
  - `mktemp` - temporary file creation
  - `find` - file searching

### Required for Specific Features
- **jq** - Only needed for `timeline view` command (conversation display)
  - All other commands work without jq
  - Install: `brew install jq` (macOS) or `apt install jq` (Linux)

### Optional Dependencies  
- **less** - for pagination in view command (falls back to `cat`)
- Text editors for view command (auto-detected in order):
  - Git-configured editor (`git config core.editor`)
  - `$VISUAL` or `$EDITOR` environment variables
  - `nano`, `vim`, `vi` (system defaults)

### Installation Check
To verify all dependencies are available:
```bash
# Check core dependencies
git --version && echo "✅ Git"
bash --version && echo "✅ Bash" 
jq --version && echo "✅ jq"

# Most systems have these built-in
which mktemp head tail cut grep sed sort wc find && echo "✅ Unix utilities"
```

## License

MIT

## Author

Created by Steven Chong