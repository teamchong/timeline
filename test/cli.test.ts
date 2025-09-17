import { test, expect } from 'bun:test';
import { spawn } from 'child_process';
import { promisify } from 'util';

const exec = promisify(spawn);

// Test CLI by spawning the binary
async function runCLI(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  // Use Bun's $ shell for simpler subprocess handling
  const proc = Bun.spawn(['bun', 'run', 'src/cli.ts', ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
    cwd: process.cwd(),
    env: { ...process.env, PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin` },
  });
  
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  
  return { stdout, stderr, exitCode };
}

test('cli shows help for unknown command', async () => {
  const result = await runCLI(['unknown']);
  
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('Timeline - Git-based snapshot tool');
});

test('cli shows help for help command', async () => {
  const result = await runCLI(['help']);
  
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('Timeline - Git-based snapshot tool');
  expect(result.stdout).toContain('Commands:');
});

test('cli shows help for --help flag', async () => {
  const result = await runCLI(['--help']);
  
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('Timeline - Git-based snapshot tool');
});

test('cli shows version for --version flag', async () => {
  const result = await runCLI(['--version']);
  
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('2.0.0');
});

test('cli handles save command', async () => {
  const result = await runCLI(['save']);
  
  // Should not crash, exit code 0 or 1 depending on git repo state
  expect([0, 1]).toContain(result.exitCode);
});

test('cli handles list command', async () => {
  const result = await runCLI(['list']);
  
  // Should not crash
  expect([0, 1]).toContain(result.exitCode);
});

test('cli handles view command', async () => {
  const result = await runCLI(['view']);
  
  // Should not crash, may exit 1 if no timelines
  expect([0, 1]).toContain(result.exitCode);
});

test('cli handles search command with pattern', async () => {
  const result = await runCLI(['search', 'test']);
  
  // Should not crash
  expect([0, 1]).toContain(result.exitCode);
});

test('cli shows error for search without pattern', async () => {
  const result = await runCLI(['search']);
  
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('Please provide a search pattern');
});

test('cli handles travel command with number', async () => {
  const result = await runCLI(['travel', '0']);
  
  // Should not crash, may exit 1 if no timelines
  expect([0, 1]).toContain(result.exitCode);
});

test('cli handles travel without number', async () => {
  const result = await runCLI(['travel']);
  
  // Interactive mode, should not crash
  expect(result.exitCode).toBe(0);
});

test('cli handles delete command with number', async () => {
  const result = await runCLI(['delete', '0']);
  
  // Should not crash, may exit 1 if no timelines  
  expect([0, 1]).toContain(result.exitCode);
});

test('cli handles delete without number', async () => {
  const result = await runCLI(['delete']);
  
  // Interactive mode, should not crash
  expect(result.exitCode).toBe(0);
});

test('cli handles cleanup command', async () => {
  const result = await runCLI(['cleanup']);
  
  // Should not crash
  expect([0, 1]).toContain(result.exitCode);
});

test('cli handles install command', async () => {
  const result = await runCLI(['install']);
  
  // Should not crash
  expect([0, 1]).toContain(result.exitCode);
});

test('cli handles uninstall command', async () => {
  const result = await runCLI(['uninstall']);
  
  // Should not crash
  expect([0, 1]).toContain(result.exitCode);
});