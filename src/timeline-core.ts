#!/usr/bin/env bun

import { existsSync } from 'fs';
import { join } from 'path';

// Utility function for safe command execution that prevents zombies
async function execCommand(cmd: string[], options: any = {}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(cmd, {
    stdout: 'pipe',
    stderr: 'pipe',
    ...options
  });
  
  // Read streams
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text()
  ]);
  
  // CRITICAL: Wait for process to exit to prevent zombies
  const exitCode = await proc.exited;
  
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

// Execute shell command safely
async function execShell(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return execCommand(['sh', '-c', command]);
}

// Git operations with retry logic for lock issues
async function git(args: string[], retries = 1): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { stdout, stderr, exitCode } = await execCommand(['git', ...args]);
      
      // Check for lock errors
      if (stderr && (stderr.includes('index.lock') || stderr.includes('Another git process'))) {
        if (attempt < retries) {
          // Wait a bit before retry
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }
      }
      
      if (stderr && !stderr.includes('warning:')) {
        throw new Error(`Git error: ${stderr}`);
      }
      
      return stdout;
    } catch (error) {
      if (attempt === retries) throw error;
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return '';
}

// Get current branch
async function getCurrentBranch(): Promise<string> {
  try {
    return await git(['rev-parse', '--abbrev-ref', 'HEAD']);
  } catch {
    return 'main';
  }
}

// Create timeline snapshot
export async function save(): Promise<void> {
  try {
    // First check if we're in a git repository
    try {
      await git(['rev-parse', '--git-dir'], 2); // Retry once for lock issues
    } catch (error) {
      // Not in a git repository - exit silently since this is called by hooks
      process.exit(0);
    }
    
    const branch = await getCurrentBranch();
    const currentCommit = await git(['rev-parse', 'HEAD'], 2);
    
    // Check for uncommitted changes with retry
    const status = await git(['status', '--porcelain'], 2);
    if (!status) {
      // No changes - exit silently (no console output for hooks)
      process.exit(0);
    }
  
  // Get hook data from stdin (Claude Code provides this)
  let hookData: any = null;
  
  try {
    if (!process.stdin.isTTY) {
      const stdinData = await Bun.stdin.text();
      if (stdinData && stdinData.trim()) {
        hookData = JSON.parse(stdinData);
      }
    }
  } catch (error) {
    // No stdin data or invalid JSON
  }
  
  // Extract session ID and project path from hook data
  // If no hook data, try to find current Claude session from project files
  let sessionId = hookData?.sessionId;
  
  if (!sessionId) {
    // Try to get the most recently modified Claude session
    const projectDir = `${process.env.HOME}/.claude/projects/-Users-steven-chong-Downloads-repos-timeline`;
    try {
      // Use utility function to avoid zombies
      const { stdout } = await execShell(`ls -t ${projectDir}/*.jsonl 2>/dev/null | head -1`);
      const latestFile = stdout;
      if (latestFile) {
        sessionId = latestFile.split('/').pop()?.replace('.jsonl', '');
      }
    } catch {
      // Fallback to timestamp if we can't find a session
      sessionId = Date.now().toString();
    }
  }
  
  const projectPath = hookData?.projectPath || process.cwd();
  
  // Create timeline
  const timestamp = new Date().toISOString();
  const message = `Timeline snapshot at ${timestamp}`;
  
  // Create tree from current state including working directory changes
  // We need to use a temporary index to capture ALL changes, not just staged ones
  const tempIndex = `/tmp/timeline-index-${Date.now()}`;
  
  let tree: string;
  try {
    // Save current index state
    const originalIndex = process.env.GIT_INDEX_FILE;
    
    // Use temporary index
    process.env.GIT_INDEX_FILE = tempIndex;
    
    // First, read the current HEAD into our temporary index
    await git(['read-tree', 'HEAD'], 2);
    
    // Then add all changes from working directory (including untracked files) with retry
    await git(['add', '-A', '.'], 2);
    
    // Create tree from the temporary index with retry
    tree = await git(['write-tree'], 2);
    
    // Restore original index
    if (originalIndex) {
      process.env.GIT_INDEX_FILE = originalIndex;
    } else {
      delete process.env.GIT_INDEX_FILE;
    }
    
    // Clean up temporary index
    try {
      await execCommand(['rm', '-f', tempIndex]);
    } catch {
      // Ignore cleanup errors
    }
  } catch (error) {
    // Restore index on error
    delete process.env.GIT_INDEX_FILE;
    throw error;
  }
  
  // Create commit object with retry
  const commitHash = await git(['commit-tree', tree, '-p', currentCommit, '-m', message], 2);
  
  // Create timeline branch with retry
  const timelineNumber = Date.now();
  const timelineName = `timelines/${branch}/+${timelineNumber}_snapshot`;
  await git(['update-ref', `refs/heads/${timelineName}`, commitHash], 2);
  
  // Add metadata as git note  
  const metadata = JSON.stringify({
    sessionId,
    timestamp,
    branch,
    tool: hookData?.tool,
    files: hookData?.files,
    projectPath: hookData?.projectPath || process.cwd()
  });
  await git(['notes', '--ref=timeline-metadata', 'add', '-f', '-m', metadata, commitHash]);
  
  // Success - exit silently with code 0
  process.exit(0);
  } catch (error) {
    // Silently handle ALL errors - this is called by hooks
    // No output to avoid cluttering user's terminal
    // Always exit with code 0 to prevent hook failures
    process.exit(0);
  }
}

// Install Claude Code hooks
export async function install(): Promise<void> {
  const settingsPath = join(process.env.HOME!, '.claude', 'settings.json');
  
  if (!existsSync(settingsPath)) {
    console.error('❌ Claude Code settings file not found');
    console.error('Please make sure Claude Code is installed and configured.');
    process.exit(1);
  }
  
  const settings = JSON.parse(await Bun.file(settingsPath).text());
  const timelineCmd = join(process.env.HOME!, '.local', 'bin', 'timeline') + ' save';
  
  // Check if already installed
  const checkHook = (hooks: any[]) => {
    return hooks?.some(h => 
      h.hooks?.some((hook: any) => 
        hook.command?.includes('timeline')
      )
    );
  };
  
  if (checkHook(settings.hooks?.PostToolUse) || checkHook(settings.hooks?.PreToolUse)) {
    console.log('✅ Timeline hook is already installed');
    return;
  }
  
  // Backup settings
  await Bun.write(`${settingsPath}.backup`, JSON.stringify(settings, null, 2));
  console.log(`📋 Backed up settings to: ${settingsPath}.backup`);
  
  // Add to PostToolUse
  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];
  
  const postHooks = settings.hooks.PostToolUse;
  if (postHooks.length > 0 && postHooks[0].hooks) {
    postHooks[0].hooks.push({
      type: 'command',
      command: timelineCmd
    });
  } else {
    postHooks.push({
      hooks: [{
        type: 'command',
        command: timelineCmd
      }]
    });
  }
  
  // Add to PreToolUse for Bash commands
  if (!settings.hooks.PreToolUse) settings.hooks.PreToolUse = [];
  
  const preHooks = settings.hooks.PreToolUse;
  let bashMatcher = preHooks.find((h: any) => h.matcher === 'Bash');
  
  if (bashMatcher) {
    if (!bashMatcher.hooks) bashMatcher.hooks = [];
    bashMatcher.hooks.push({
      type: 'command',
      command: timelineCmd
    });
  } else {
    preHooks.push({
      matcher: 'Bash',
      hooks: [{
        type: 'command',
        command: timelineCmd
      }]
    });
  }
  
  // Write updated settings
  await Bun.write(settingsPath, JSON.stringify(settings, null, 2));
  console.log('✅ Installed timeline hooks to settings.json');
  console.log('\n🎉 Timeline hook installation complete!');
}

// Uninstall Claude Code hooks
export async function uninstall(): Promise<void> {
  const settingsPath = join(process.env.HOME!, '.claude', 'settings.json');
  
  if (!existsSync(settingsPath)) {
    console.error('❌ Claude Code settings file not found');
    return;
  }
  
  const settings = JSON.parse(await Bun.file(settingsPath).text());
  
  // Backup settings
  await Bun.write(`${settingsPath}.backup`, JSON.stringify(settings, null, 2));
  console.log(`📋 Backed up settings to: ${settingsPath}.backup`);
  
  // Remove from PostToolUse
  if (settings.hooks?.PostToolUse) {
    settings.hooks.PostToolUse = settings.hooks.PostToolUse.map((group: any) => {
      if (group.hooks) {
        group.hooks = group.hooks.filter((h: any) => 
          !h.command?.includes('timeline')
        );
      }
      return group;
    }).filter((g: any) => g.hooks?.length > 0);
  }
  
  // Remove from PreToolUse
  if (settings.hooks?.PreToolUse) {
    settings.hooks.PreToolUse = settings.hooks.PreToolUse.map((group: any) => {
      if (group.hooks) {
        group.hooks = group.hooks.filter((h: any) => 
          !h.command?.includes('timeline')
        );
      }
      return group;
    }).filter((g: any) => g.hooks?.length > 0);
  }
  
  // Write updated settings
  await Bun.write(settingsPath, JSON.stringify(settings, null, 2));
  console.log('✅ Timeline hooks removed from settings.json');
  console.log('\n🗑️  Timeline hook uninstallation complete!');
}

// List timelines
export async function list(): Promise<void> {
  const branch = await getCurrentBranch();
  const pattern = `refs/heads/timelines/${branch}/+*`;
  
  const timelines = await git(['for-each-ref', '--format=%(refname:short)', pattern]);
  
  if (!timelines) {
    console.log('No timelines found');
    return;
  }
  
  const lines = timelines.split('\n').filter(Boolean);
  console.log(`Found ${lines.length} timeline(s) on branch '${branch}':\n`);
  
  for (const [idx, timeline] of lines.entries()) {
    const hash = await git(['rev-parse', '--short', timeline]);
    const message = await git(['log', '-1', '--pretty=%s', timeline]);
    const time = await git(['log', '-1', '--pretty=%ar', timeline]);
    
    console.log(`${idx + 1}. [${hash}] ${message} (${time})`);
  }
}

// Delete timeline(s)
export async function deleteTimelines(): Promise<void> {
  const branch = await getCurrentBranch();
  const pattern = `refs/heads/timelines/${branch}/+*`;
  
  const timelines = await git(['for-each-ref', '--format=%(refname:short)', pattern]);
  
  if (!timelines) {
    console.log('No timelines to delete');
    return;
  }
  
  const lines = timelines.split('\n').filter(Boolean);
  console.log(`\n⚠️  Found ${lines.length} timeline(s) to delete\n`);
  
  // Show timelines
  for (const timeline of lines) {
    const hash = await git(['rev-parse', '--short', timeline]);
    const message = await git(['log', '-1', '--pretty=%s', timeline]);
    console.log(`  - [${hash}] ${timeline}: ${message}`);
  }
  
  // Confirm deletion
  console.log('\nThis will permanently delete these timelines.');
  console.log('Type "yes" to confirm: ');
  
  const confirmation = await new Promise<string>(resolve => {
    process.stdin.once('data', data => resolve(data.toString().trim()));
  });
  
  if (confirmation.toLowerCase() !== 'yes') {
    console.log('Deletion cancelled');
    return;
  }
  
  // Delete timelines
  for (const timeline of lines) {
    await git(['branch', '-D', timeline]);
  }
  
  console.log(`\n✅ Deleted ${lines.length} timeline(s)`);
}

// Travel to a timeline
export async function travel(target?: string): Promise<void> {
  if (!target) {
    // Interactive mode - list timelines
    await list();
    console.log('\nEnter timeline number or commit hash: ');
    
    target = await new Promise<string>(resolve => {
      process.stdin.once('data', data => resolve(data.toString().trim()));
    });
  }
  
  // Parse target
  let timelineRef: string;
  
  if (/^\d+$/.test(target)) {
    // Timeline number
    const branch = await getCurrentBranch();
    const pattern = `refs/heads/timelines/${branch}/+*`;
    const timelines = await git(['for-each-ref', '--format=%(refname:short)', pattern]);
    const lines = timelines.split('\n').filter(Boolean);
    
    const idx = parseInt(target) - 1;
    if (idx < 0 || idx >= lines.length) {
      console.error('Invalid timeline number');
      process.exit(1);
    }
    
    timelineRef = lines[idx];
  } else {
    // Direct reference
    timelineRef = target;
  }
  
  // Create backup before travel
  await save();
  
  // Restore from timeline
  console.log(`🚀 Traveling to ${timelineRef}...`);
  await git(['restore', '--source=' + timelineRef, '--worktree', '.']);
  
  console.log('✅ Timeline restored successfully!');
}

// Search in timelines
export async function search(pattern: string): Promise<void> {
  const branch = await getCurrentBranch();
  const timelinePattern = `refs/heads/timelines/${branch}/+*`;
  
  const timelines = await git(['for-each-ref', '--format=%(refname:short)', timelinePattern]);
  
  if (!timelines) {
    console.log('No timelines to search');
    return;
  }
  
  const lines = timelines.split('\n').filter(Boolean);
  console.log(`Searching for "${pattern}" in ${lines.length} timeline(s)...\n`);
  
  let totalMatches = 0;
  
  for (const timeline of lines) {
    try {
      // Search in timeline
      const matches = await git(['grep', '-n', pattern, timeline]);
      
      if (matches) {
        const hash = await git(['rev-parse', '--short', timeline]);
        const message = await git(['log', '-1', '--pretty=%s', timeline]);
        
        console.log(`\n📍 [${hash}] ${message}:`);
        console.log(matches);
        totalMatches++;
      }
    } catch {
      // No matches in this timeline
    }
  }
  
  if (totalMatches === 0) {
    console.log('No matches found');
  } else {
    console.log(`\n✅ Found matches in ${totalMatches} timeline(s)`);
  }
}

// Cleanup orphaned timeline branches
export async function cleanup(): Promise<void> {
  // Get all timeline branches
  const allTimelines = await git(['for-each-ref', '--format=%(refname:short)', 'refs/heads/timelines/']);
  
  if (!allTimelines) {
    console.log('No timelines to cleanup');
    return;
  }
  
  const lines = allTimelines.split('\n').filter(Boolean);
  const orphaned: string[] = [];
  
  // Check each timeline's branch
  for (const timeline of lines) {
    const match = timeline.match(/^timelines\/([^\/]+)\//);
    if (match) {
      const branch = match[1];
      
      // Check if branch exists
      try {
        await git(['rev-parse', `refs/heads/${branch}`]);
      } catch {
        // Branch doesn't exist - this is orphaned
        orphaned.push(timeline);
      }
    }
  }
  
  if (orphaned.length === 0) {
    console.log('No orphaned timelines found');
    return;
  }
  
  console.log(`\n⚠️  Found ${orphaned.length} orphaned timeline(s):\n`);
  
  for (const timeline of orphaned) {
    console.log(`  - ${timeline}`);
  }
  
  console.log('\nType "yes" to delete these orphaned timelines: ');
  
  const confirmation = await new Promise<string>(resolve => {
    process.stdin.once('data', data => resolve(data.toString().trim()));
  });
  
  if (confirmation.toLowerCase() !== 'yes') {
    console.log('Cleanup cancelled');
    return;
  }
  
  // Delete orphaned timelines
  for (const timeline of orphaned) {
    await git(['branch', '-D', timeline]);
  }
  
  console.log(`\n✅ Cleaned up ${orphaned.length} orphaned timeline(s)`);
}