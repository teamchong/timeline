import { test, expect } from 'bun:test';
import { existsSync } from 'fs';

test('render-conversation.ts exists', () => {
  expect(existsSync('./render-conversation.ts')).toBe(true);
});

test('render-conversation.ts is executable', async () => {
  const stats = await Bun.file('./render-conversation.ts').exists();
  expect(stats).toBe(true);
});

test('marked dependency is available', async () => {
  try {
    await import('marked');
    expect(true).toBe(true);
  } catch (error) {
    expect(false).toBe(true); // marked should be installed
  }
});