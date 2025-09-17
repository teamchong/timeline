// Test setup - suppress console output during tests
import { beforeAll, afterAll } from 'bun:test';

let originalConsoleLog: typeof console.log;
let originalConsoleError: typeof console.error;

beforeAll(() => {
  // Save original console methods
  originalConsoleLog = console.log;
  originalConsoleError = console.error;
  
  // Suppress console output during tests
  console.log = () => {};
  console.error = () => {};
});

afterAll(() => {
  // Restore original console methods
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});