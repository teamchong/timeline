import { test, expect } from 'bun:test';

// Test conversation rendering by running the CLI script
async function runRenderConversation(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(['bun', 'render-conversation.ts', ...args], {
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

test('render-conversation shows usage when no args provided', async () => {
  const result = await runRenderConversation([]);
  
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('Usage:');
  expect(result.stderr).toContain('render-conversation.ts');
});

test('render-conversation handles invalid session id', async () => {
  const result = await runRenderConversation(['invalid-session-id']);
  
  // Should not crash, may exit with error
  expect([0, 1]).toContain(result.exitCode);
});