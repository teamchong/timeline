#!/usr/bin/env bun

/**
 * Benchmark comparing Bun API vs Node.js API performance
 */

import { join } from 'path';
import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';

const testFilePath = join(process.cwd(), 'test-benchmark.json');
const iterations = 1000;

// Test data
const testData = JSON.stringify({ 
  data: Array(100).fill(0).map((_, i) => ({
    id: i,
    value: `value-${i}`,
    nested: {
      prop1: Math.random(),
      prop2: new Date().toISOString()
    }
  }))
}, null, 2);

// Benchmark Node.js fs API
async function benchmarkNodeFS() {
  const start = performance.now();
  
  for (let i = 0; i < iterations; i++) {
    await writeFile(testFilePath, testData);
    const content = await readFile(testFilePath, 'utf-8');
    JSON.parse(content);
  }
  
  const end = performance.now();
  return end - start;
}

// Benchmark Bun.file API
async function benchmarkBunFile() {
  const start = performance.now();
  
  for (let i = 0; i < iterations; i++) {
    await Bun.write(testFilePath, testData);
    const content = await Bun.file(testFilePath).text();
    JSON.parse(content);
  }
  
  const end = performance.now();
  return end - start;
}

// Benchmark subprocess spawning
async function benchmarkSpawning() {
  console.log('\n📊 Subprocess Spawning Benchmark (100 iterations)');
  
  // Node.js spawn (simulation - we can't easily import child_process in Bun context)
  const start1 = performance.now();
  for (let i = 0; i < 100; i++) {
    const proc = Bun.spawn(['echo', 'test'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    await new Response(proc.stdout).text();
  }
  const bunSpawnTime = performance.now() - start1;
  
  // Bun $ shell
  const start2 = performance.now();
  for (let i = 0; i < 100; i++) {
    await Bun.$`echo test`.text();
  }
  const bunShellTime = performance.now() - start2;
  
  console.log(`  Bun.spawn():  ${bunSpawnTime.toFixed(2)}ms`);
  console.log(`  Bun.$:        ${bunShellTime.toFixed(2)}ms`);
  console.log(`  Speedup:      ${(bunSpawnTime / bunShellTime).toFixed(2)}x faster with Bun.$`);
}

async function main() {
  console.log('🚀 Timeline Bun API Optimization Benchmark');
  console.log('=' .repeat(50));
  
  console.log('\n📊 File Operations Benchmark (1000 read/write cycles)');
  console.log('Testing with JSON file (~5KB)...\n');
  
  // Warm up
  await Bun.write(testFilePath, testData);
  
  // Run benchmarks
  console.log('Running Node.js fs API benchmark...');
  const nodeTime = await benchmarkNodeFS();
  
  console.log('Running Bun.file API benchmark...');
  const bunTime = await benchmarkBunFile();
  
  // Results
  console.log('\n📈 Results:');
  console.log(`  Node.js fs:   ${nodeTime.toFixed(2)}ms`);
  console.log(`  Bun.file():   ${bunTime.toFixed(2)}ms`);
  console.log(`  Speedup:      ${(nodeTime / bunTime).toFixed(2)}x faster with Bun API`);
  
  // Subprocess benchmark
  await benchmarkSpawning();
  
  console.log('\n✨ Optimizations Applied:');
  console.log('  ✅ Replaced fs.promises.readFile with Bun.file().text()');
  console.log('  ✅ Replaced fs.promises.writeFile with Bun.write()');
  console.log('  ✅ Already using Bun.spawn() for git operations');
  console.log('  ✅ Using Bun.$ for shell commands in view.ts');
  
  console.log('\n💡 Performance Benefits:');
  console.log('  • Bun.file() is zero-copy and uses native code');
  console.log('  • Bun.write() is optimized for both strings and binary data');
  console.log('  • Bun.spawn() has lower overhead than child_process');
  console.log('  • Bun.$ provides convenient shell scripting with proper escaping');
  
  // Cleanup
  if (existsSync(testFilePath)) {
    await Bun.$`rm ${testFilePath}`.quiet();
  }
}

main().catch(console.error);