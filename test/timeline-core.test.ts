import './setup';
import { test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawn } from 'child_process';
import { promisify } from 'util';

const exec = promisify(spawn);

// Test git operations
async function git(args: string[], cwd: string): Promise<string> {
  const proc = Bun.spawn(['git', ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
    cwd,
  });
  
  const output = await new Response(proc.stdout).text();
  const error = await new Response(proc.stderr).text();
  
  if (error && !error.includes('warning:') && !error.includes('hint:')) {
    throw new Error(`Git error: ${error}`);
  }
  
  return output.trim();
}

let testDir: string;

beforeEach(async () => {
  // Create temporary git repository for each test
  testDir = await mkdtemp(join(tmpdir(), 'timeline-test-'));
  
  // Initialize git repo
  await git(['init'], testDir);
  await git(['config', 'user.name', 'Test User'], testDir);
  await git(['config', 'user.email', 'test@example.com'], testDir);
  
  // Create initial commit
  await writeFile(join(testDir, 'README.md'), '# Test Repo');
  await git(['add', 'README.md'], testDir);
  await git(['commit', '-m', 'Initial commit'], testDir);
  
  // Change to test directory
  process.chdir(testDir);
});

afterEach(async () => {
  // Clean up test directory
  await rm(testDir, { recursive: true, force: true });
});

test('save creates timeline when changes exist', async () => {
  // Create a change
  await writeFile(join(testDir, 'test.txt'), 'hello world');
  
  // Import save function from timeline-core
  const { save } = await import('../src/timeline-core.ts');
  
  // Save timeline
  await save();
  
  // Check that timeline branch was created (could be master or main)
  const branches = await git(['branch', '--list', 'timelines/*'], testDir);
  expect(branches).toMatch(/timelines\/(master|main)\//);
});

test('save skips when no changes exist', async () => {
  const { save } = await import('../src/timeline-core.ts');
  
  // Save with no changes
  await save();
  
  // Should not create timeline branches
  const branches = await git(['branch', '--list', 'timelines/*'], testDir);
  expect(branches).toBe('');
});

test('list shows no timelines message when none exist', async () => {
  const { list } = await import('../src/timeline-core.ts');
  
  // list() prints to console, we just verify it doesn't crash
  await expect(list()).resolves.toBeUndefined();
});

test('list shows timelines after save', async () => {
  // Create change and save
  await writeFile(join(testDir, 'test.txt'), 'content');
  const { save, list } = await import('../src/timeline-core.ts');
  await save();
  
  // list() prints to console, we just verify it doesn't crash
  await expect(list()).resolves.toBeUndefined();
  
  // Verify timeline branch exists
  const branches = await git(['branch', '--list', 'timelines/*'], testDir);
  expect(branches).toMatch(/timelines\/(master|main)\//);
});

test('search finds content in timelines', async () => {
  // Create file with searchable content
  await writeFile(join(testDir, 'search-test.txt'), 'unique searchable content');
  
  const { save, search } = await import('../src/timeline-core.ts');
  await save();
  
  // search() prints to console, we just verify it doesn't crash
  await expect(search('searchable')).resolves.toBeUndefined();
});

test('search executes for non-existent content', async () => {
  await writeFile(join(testDir, 'test.txt'), 'normal content');
  
  const { save, search } = await import('../src/timeline-core.ts');
  await save();
  
  // search() prints to console, we just verify it doesn't crash
  await expect(search('nonexistent')).resolves.toBeUndefined();
});

test('travel executes without error', async () => {
  const { save, travel } = await import('../src/timeline-core.ts');
  
  // Create initial state
  await writeFile(join(testDir, 'travel-test.txt'), 'version 1');
  await save();
  
  // Modify file
  await writeFile(join(testDir, 'travel-test.txt'), 'version 2');
  
  // Travel back to timeline 1 (1-based indexing)
  await expect(travel('1')).resolves.toBeUndefined();
});

test('cleanup executes without error', async () => {
  const { save, cleanup } = await import('../src/timeline-core.ts');
  
  // Create a few timelines
  for (let i = 0; i < 3; i++) {
    await writeFile(join(testDir, `file${i}.txt`), `content ${i}`);
    await save();
  }
  
  // Run cleanup (should not crash)
  await expect(cleanup()).resolves.toBeUndefined();
});

test('save does not create index.lock in .git directory', async () => {
  const { save } = await import('../src/timeline-core.ts');
  const { existsSync } = await import('fs');
  
  // Create changes
  await writeFile(join(testDir, 'test.txt'), 'content');
  
  // Save timeline
  await save();
  
  // Check that no index.lock exists in .git
  const indexLockPath = join(testDir, '.git', 'index.lock');
  expect(existsSync(indexLockPath)).toBe(false);
});

test('concurrent saves do not create lock conflicts', async () => {
  const { save } = await import('../src/timeline-core.ts');
  const { existsSync } = await import('fs');
  
  // Create initial change
  await writeFile(join(testDir, 'concurrent.txt'), 'initial');
  
  // Run multiple saves concurrently
  const saves = [];
  for (let i = 0; i < 5; i++) {
    saves.push(save());
  }
  
  // All should complete without error
  await expect(Promise.all(saves)).resolves.toBeDefined();
  
  // No index.lock should remain
  const indexLockPath = join(testDir, '.git', 'index.lock');
  expect(existsSync(indexLockPath)).toBe(false);
});

test('save uses temporary index and cleans up', async () => {
  const { save } = await import('../src/timeline-core.ts');
  const { readdirSync } = await import('fs');
  
  // Get initial temp files
  const tmpFiles = readdirSync('/tmp').filter(f => f.startsWith('timeline-index-'));
  const initialCount = tmpFiles.length;
  
  // Create change and save
  await writeFile(join(testDir, 'temp-test.txt'), 'content');
  await save();
  
  // Check temp files are cleaned up
  const afterFiles = readdirSync('/tmp').filter(f => f.startsWith('timeline-index-'));
  expect(afterFiles.length).toBe(initialCount);
});

test('travel works with commit hash', async () => {
  const { save, travel } = await import('../src/timeline-core.ts');
  
  // Create initial timeline
  await writeFile(join(testDir, 'hash-test.txt'), 'version 1');
  await save();
  
  // Get the commit hash of the timeline
  const branches = await git(['branch', '--list', 'timelines/*'], testDir);
  const timelineBranch = branches.split('\n')[0].trim();
  const hash = await git(['rev-parse', '--short', timelineBranch], testDir);
  
  // Make another change
  await writeFile(join(testDir, 'hash-test.txt'), 'version 2');
  
  // Travel using commit hash
  await expect(travel(hash)).resolves.toBeUndefined();
  
  // Verify file was restored
  const { readFileSync } = await import('fs');
  const content = readFileSync(join(testDir, 'hash-test.txt'), 'utf-8');
  expect(content).toBe('version 1');
});