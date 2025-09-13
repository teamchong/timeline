# Timeline - Git-based Code Snapshot Tool

A lightweight, zero-impact Git utility that automatically captures code snapshots as you work, allowing you to travel back to any point without affecting your Git history.

## Features

- 🚀 **Zero-impact snapshots** - Uses Git's plumbing commands to create invisible branches
- ⏱️ **Automatic captures** - Integrates with Claude Code to save snapshots after each edit
- 🔍 **Powerful search** - Search across all timelines by content or filename
- 📋 **Multiple view modes** - Browse changes, view diffs, or list files
- 🧹 **Smart cleanup** - Automatically removes old timelines (keeps last 20)
- 🎯 **Branch-aware** - Separate timelines for each Git branch

## Installation

### Quick Install (with Claude Code integration)

```bash
# Clone to your preferred location
git clone https://github.com/yourusername/timeline.git ~/Downloads/repos/timeline

# Install globally with Claude Code hook
~/Downloads/repos/timeline/timeline install
```

### Manual Install

```bash
# Make it executable
chmod +x ~/Downloads/repos/timeline/timeline

# Add to PATH (add to ~/.bashrc or ~/.zshrc)
export PATH="$PATH:~/Downloads/repos/timeline"

# Or create a symlink
ln -s ~/Downloads/repos/timeline/timeline /usr/local/bin/timeline
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
- Don't appear in `git branch` listings
- Don't affect your working directory
- Don't interfere with normal Git operations
- Are automatically cleaned up (keeps last 20)

Each timeline captures:
- All staged changes
- All unstaged changes
- All untracked files
- Current HEAD reference

## Claude Code Integration

When integrated with Claude Code, Timeline automatically:
- Captures snapshots after file edits
- Provides instant recovery from any changes
- Maintains separate timelines per branch

To install the hook:
```bash
timeline install    # Add hook to Claude Code
timeline uninstall  # Remove hook from Claude Code
```

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