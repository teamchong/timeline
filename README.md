# Timeline - Git Snapshot Tool for Claude Code

A lightweight, zero-impact Git utility designed for [Claude Code](https://claude.ai/code) that automatically captures code snapshots as you work, allowing you to travel back to any point without affecting your Git history.

> **Primary Purpose**: Timeline is built specifically for Claude Code users to automatically capture snapshots after every file edit. While the `timeline` command can be used standalone, the automatic snapshot feature (the main value) requires Claude Code.

## Features

- 🤖 **Claude Code Integration** - Automatic snapshots after each file edit in Claude Code
- 🚀 **Zero-impact snapshots** - Creates lightweight branches without affecting your working tree
- ⏱️ **Instant recovery** - Travel back to any point without affecting Git history
- 🔍 **Powerful search** - Search across all timelines by content or filename
- 📋 **Multiple view modes** - Browse changes, view diffs, or list files
- 🧹 **Smart cleanup** - Automatically removes old timelines (keeps last 20)
- 🎯 **Branch-aware** - Separate timelines for each Git branch

## Installation

### One-Line Install (with Auto-Save)

```bash
git clone https://github.com/yourusername/timeline.git ~/Downloads/repos/timeline && cd ~/Downloads/repos/timeline && ./install.sh
```

This will:
1. Clone the repository
2. Create a symlink in `/usr/local/bin` for the `timeline` command
3. **Install Claude Code hook for automatic snapshots** (the main feature!)
4. Verify the installation

After installation, Timeline will automatically save snapshots whenever you edit files in Claude Code - no manual saving needed!

### Manual Install

```bash
# Clone the repository
git clone https://github.com/yourusername/timeline.git ~/Downloads/repos/timeline

# Run the installer
cd ~/Downloads/repos/timeline
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
~/Downloads/repos/timeline/uninstall.sh
```

## Usage

### Basic Commands

```bash
timeline              # Show help
timeline save         # Create a timeline manually
timeline travel       # Browse and restore timelines
timeline view         # View timeline contents
timeline search text  # Search for text in timelines
timeline delete       # Delete timelines interactively
timeline cleanup      # Remove orphaned timelines
```

### View Modes

The `timeline view` command offers four modes:

1. **File browser** - See which files changed with preview
   - Use when: You want to browse what files were modified
   - Shows: File names + first 3 lines of changes

2. **Quick diff** - See what was added/removed (no filenames)
   - Use when: You want to quickly see code changes
   - Shows: All + and - lines without file context

3. **File list** - Just list all files in timeline
   - Use when: You want to see complete file structure
   - Shows: All files that exist in the timeline

4. **Search** - Find text in timelines
   - Use when: Looking for specific code
   - Options: Search in all content, changed lines only, or filenames

### Search Options

```bash
timeline search "function"  # Search for 'function' in all timelines
```

Search modes:
- **Both content and filenames** - Search everywhere
- **Content only (all lines)** - Search in all file contents
- **Changed lines only** - Search only in additions/deletions
- **Filenames only** - Search in file paths

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
- Are automatically cleaned up (keeps last 20)

Each timeline captures:
- All staged changes
- All unstaged changes
- All untracked files
- Current HEAD reference

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

### Recover from accidental deletion
```bash
# Oops, deleted important file
rm important.js

# View recent timelines
timeline travel

# Select timeline from before deletion
# Files are restored!
```

### Find when code was removed
```bash
# Search for removed function
timeline search "oldFunction"

# Shows which timeline contains it
# Travel back to recover the code
```

### Preview changes before restoring
```bash
# View what changed in timelines
timeline view

# Choose "File browser" to see which files changed
# Choose "Quick diff" to see actual code changes
```

## Requirements

- Git
- Bash 3.2+ (macOS compatible)
- No external dependencies

## License

MIT

## Author

Created by Steven Chong