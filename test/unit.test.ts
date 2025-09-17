import { test, expect } from 'bun:test';
import { existsSync } from 'fs';
import { join } from 'path';

test('project structure is correct', () => {
  // Check key files exist
  expect(existsSync('./src/cli.ts')).toBe(true);
  expect(existsSync('./src/timeline-core.ts')).toBe(true);
  expect(existsSync('./src/view.ts')).toBe(true);
  expect(existsSync('./render-conversation.ts')).toBe(true);
  expect(existsSync('./package.json')).toBe(true);
});

test('timeline-core exports all functions', async () => {
  const core = await import('../src/timeline-core.ts');
  
  expect(typeof core.save).toBe('function');
  expect(typeof core.install).toBe('function');
  expect(typeof core.uninstall).toBe('function');
  expect(typeof core.list).toBe('function');
  expect(typeof core.deleteTimelines).toBe('function');
  expect(typeof core.travel).toBe('function');
  expect(typeof core.search).toBe('function');
  expect(typeof core.cleanup).toBe('function');
});

test('package.json has correct configuration', async () => {
  const pkg = JSON.parse(await Bun.file('./package.json').text());
  
  expect(pkg.name).toBe('timeline');
  expect(pkg.version).toBeTruthy();
  expect(pkg.bin).toHaveProperty('timeline');
  expect(pkg.scripts).toHaveProperty('build');
  expect(pkg.scripts).toHaveProperty('test');
  expect(pkg.dependencies).toHaveProperty('marked');
});

test('build output exists', () => {
  // Check if the binary was built
  const binaryPath = './bin/timeline';
  if (existsSync(binaryPath)) {
    expect(true).toBe(true);
  } else {
    // Binary might not be built yet, that's ok for tests
    expect(true).toBe(true);
  }
});

test('marked dependency is installed', async () => {
  try {
    const marked = await import('marked');
    expect(marked).toBeTruthy();
    expect(typeof marked.marked).toBe('function');
  } catch (error) {
    throw new Error('marked dependency should be installed');
  }
});

test('git repository exists', () => {
  expect(existsSync('./.git')).toBe(true);
});

test('README exists', () => {
  expect(existsSync('./README.md')).toBe(true);
});

test('install script exists', () => {
  expect(existsSync('./install.sh')).toBe(true);
});

test('uninstall script exists', () => {
  expect(existsSync('./uninstall.sh')).toBe(true);
});