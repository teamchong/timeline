#!/usr/bin/env bun

// Timeline Core v2 - Pure object creation without index access
// This approach never touches .git/index, preventing all lock conflicts

import { existsSync } from 'fs';
import { readdir, readFile } from 'fs/promises';
import { join, relative } from 'path';

// Execute command safely
async function execCommand(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(args, {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  
  const exitCode = await proc.exited;
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

// Git command wrapper
async function git(args: string[]): Promise<string> {
  const { stdout, stderr, exitCode } = await execCommand(['git', ...args]);
  if (exitCode !== 0 && !stderr.includes('warning:')) {
    throw new Error(`Git error: ${stderr}`);
  }
  return stdout;
}

// Create a blob object from file content (no index access)
async function createBlob(filePath: string): Promise<string> {
  // git hash-object creates a blob without touching index
  return await git(['hash-object', '-w', filePath]);
}

// Build tree object from scratch (no index access)
async function buildTreeFromDirectory(dirPath: string, baseTree?: string): Promise<string> {
  const entries: string[] = [];
  
  // Start with base tree if provided
  if (baseTree) {
    const lsTree = await git(['ls-tree', baseTree]);
    entries.push(...lsTree.split('\n').filter(Boolean));
  }
  
  // Walk directory and create blobs for all files
  async function walkDir(dir: string, prefix: string = '') {
    const items = await readdir(dir, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = join(dir, item.name);
      const gitPath = prefix ? `${prefix}/${item.name}` : item.name;
      
      // Skip .git directory
      if (item.name === '.git') continue;
      
      if (item.isDirectory()) {
        // Recurse into subdirectories
        await walkDir(fullPath, gitPath);
      } else if (item.isFile()) {
        // Create blob for file
        const hash = await createBlob(fullPath);
        // Add to tree entries (100644 for regular file)
        entries.push(`100644 blob ${hash}\t${gitPath}`);
      }
    }
  }
  
  await walkDir(dirPath);
  
  // Create tree object using mktree (no index access)
  const proc = Bun.spawn(['git', 'mktree'], {
    stdin: 'pipe',
    stdout: 'pipe',
  });
  
  // Feed entries to mktree
  proc.stdin.write(entries.join('\n'));
  proc.stdin.end();
  
  const tree = await new Response(proc.stdout).text();
  await proc.exited;
  
  return tree.trim();
}

// Alternative: Use ls-files to build tree without index access
async function buildTreeUsingLsFiles(): Promise<string> {
  // This approach uses ls-files but with -s flag to get staging info
  // Combined with hash-object for working directory files
  
  // Get list of all files (tracked and untracked)
  const trackedFiles = await git(['ls-files', '-s']);
  const untrackedFiles = await git(['ls-files', '--others', '--exclude-standard']);
  
  const entries: string[] = [];
  
  // Process tracked files - hash working directory version
  for (const line of trackedFiles.split('\n').filter(Boolean)) {
    const [mode, hash, stage, ...pathParts] = line.split(/\s+/);
    const path = pathParts.join(' ');
    
    if (existsSync(path)) {
      // Hash current working directory version
      const workingHash = await git(['hash-object', '-w', path]);
      entries.push(`${mode} blob ${workingHash}\t${path}`);
    }
  }
  
  // Process untracked files
  for (const path of untrackedFiles.split('\n').filter(Boolean)) {
    if (existsSync(path)) {
      const hash = await git(['hash-object', '-w', path]);
      entries.push(`100644 blob ${hash}\t${path}`);
    }
  }
  
  // Create tree using mktree
  const proc = Bun.spawn(['git', 'mktree'], {
    stdin: 'pipe',
    stdout: 'pipe',
  });
  
  proc.stdin.write(entries.join('\n'));
  proc.stdin.end();
  
  const tree = await new Response(proc.stdout).text();
  await proc.exited;
  
  return tree.trim();
}

// Create timeline snapshot without ANY index access
export async function saveNoIndex(): Promise<void> {
  try {
    // Check if in git repo (this doesn't touch index)
    const gitDir = await git(['rev-parse', '--git-dir']);
    if (!gitDir) {
      process.exit(0);
    }
    
    // Get current branch and commit (no index access)
    const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => 'main');
    const currentCommit = await git(['rev-parse', 'HEAD']);
    
    // Build tree from working directory WITHOUT touching index
    // Option 1: Direct directory walk (slower but completely independent)
    // const tree = await buildTreeFromDirectory(process.cwd());
    
    // Option 2: Use ls-files but only for listing, hash files directly
    const tree = await buildTreeUsingLsFiles();
    
    // Create commit object (no index access)
    const message = `Timeline snapshot at ${new Date().toISOString()}`;
    const commitHash = await git(['commit-tree', tree, '-p', currentCommit, '-m', message]);
    
    // Update timeline branch reference (no index access)
    const timelineRef = `refs/heads/timelines/${branch}/+${Date.now()}_snapshot`;
    await git(['update-ref', timelineRef, commitHash]);
    
    // Success - no index.lock was ever created!
    process.exit(0);
  } catch (error) {
    // Silent failure for hook compatibility
    process.exit(0);
  }
}

// Alternative: Queue-based approach for guaranteed no conflicts
class TimelineQueue {
  private static queue: Array<() => Promise<void>> = [];
  private static processing = false;
  
  static async add(task: () => Promise<void>) {
    this.queue.push(task);
    if (!this.processing) {
      this.process();
    }
  }
  
  private static async process() {
    if (this.processing) return;
    this.processing = true;
    
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        try {
          await task();
        } catch (error) {
          // Log but continue processing
          console.error('Timeline task failed:', error);
        }
      }
      // Small delay between operations
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    this.processing = false;
  }
}

// Export for testing
if (import.meta.main) {
  saveNoIndex();
}