#!/usr/bin/env bun

// Timeline Queue - Ensures snapshots are never lost, just delayed
// This can run as a background process or be integrated into save()

import { existsSync } from 'fs';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const QUEUE_DIR = join(process.env.HOME!, '.timeline', 'queue');
const QUEUE_FILE = join(QUEUE_DIR, 'pending.jsonl');
const LOCK_FILE = join(QUEUE_DIR, 'processor.lock');

interface QueuedSnapshot {
  timestamp: number;
  projectPath: string;
  branch: string;
  sessionId?: string;
  retries: number;
}

// Ensure queue directory exists
async function ensureQueueDir() {
  if (!existsSync(QUEUE_DIR)) {
    await mkdir(QUEUE_DIR, { recursive: true });
  }
}

// Add a snapshot request to the queue
export async function enqueueSnapshot(snapshot: Omit<QueuedSnapshot, 'retries'>) {
  await ensureQueueDir();
  
  const entry: QueuedSnapshot = {
    ...snapshot,
    retries: 0
  };
  
  // Append to queue file (JSONL format)
  const line = JSON.stringify(entry) + '\n';
  
  if (existsSync(QUEUE_FILE)) {
    const content = await readFile(QUEUE_FILE, 'utf-8');
    await writeFile(QUEUE_FILE, content + line);
  } else {
    await writeFile(QUEUE_FILE, line);
  }
}

// Process queued snapshots
export async function processQueue() {
  await ensureQueueDir();
  
  if (!existsSync(QUEUE_FILE)) {
    return; // Nothing to process
  }
  
  // Check if another processor is already running
  if (existsSync(LOCK_FILE)) {
    const lockContent = await readFile(LOCK_FILE, 'utf-8');
    const lockTime = parseInt(lockContent);
    
    // If lock is older than 30 seconds, assume it's stale
    if (Date.now() - lockTime > 30000) {
      // Remove stale lock
      await writeFile(LOCK_FILE, Date.now().toString());
    } else {
      // Another processor is running
      return;
    }
  } else {
    // Create lock
    await writeFile(LOCK_FILE, Date.now().toString());
  }
  
  try {
    // Read queue
    const content = await readFile(QUEUE_FILE, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    
    if (lines.length === 0) {
      // Empty queue, clean up
      await Bun.$`rm -f ${QUEUE_FILE}`.quiet();
      return;
    }
    
    const pending: QueuedSnapshot[] = [];
    const failed: QueuedSnapshot[] = [];
    
    // Process each queued snapshot
    for (const line of lines) {
      try {
        const snapshot: QueuedSnapshot = JSON.parse(line);
        
        // Change to project directory
        process.chdir(snapshot.projectPath);
        
        // Check if we can proceed (no index.lock)
        const gitDir = await Bun.$`git rev-parse --git-dir`.text();
        const indexLockPath = join(gitDir.trim(), 'index.lock');
        
        if (existsSync(indexLockPath)) {
          // Still locked, keep in queue
          snapshot.retries++;
          if (snapshot.retries < 5) {
            pending.push(snapshot);
          } else {
            // Too many retries, move to failed
            failed.push(snapshot);
          }
          continue;
        }
        
        // Try to create snapshot
        const { save } = await import('./timeline-core');
        await save();
        
        // Success! Don't add back to queue
        console.log(`✅ Processed queued snapshot for ${snapshot.projectPath}`);
        
      } catch (error) {
        // Failed, keep in queue with retry count
        const snapshot: QueuedSnapshot = JSON.parse(line);
        snapshot.retries++;
        if (snapshot.retries < 5) {
          pending.push(snapshot);
        } else {
          failed.push(snapshot);
        }
      }
    }
    
    // Rewrite queue with pending items
    if (pending.length > 0) {
      const newContent = pending.map(s => JSON.stringify(s)).join('\n') + '\n';
      await writeFile(QUEUE_FILE, newContent);
    } else {
      // Queue is empty, remove file
      await Bun.$`rm -f ${QUEUE_FILE}`.quiet();
    }
    
    // Log failed items (could write to a separate file)
    if (failed.length > 0) {
      console.warn(`⚠️ ${failed.length} snapshots failed after max retries`);
    }
    
  } finally {
    // Remove lock
    await Bun.$`rm -f ${LOCK_FILE}`.quiet();
  }
}

// Run queue processor as a daemon
export async function runDaemon() {
  console.log('🚀 Timeline queue daemon started');
  
  while (true) {
    try {
      await processQueue();
    } catch (error) {
      console.error('Queue processing error:', error);
    }
    
    // Wait 5 seconds before next check
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

// CLI interface
if (import.meta.main) {
  const command = process.argv[2];
  
  switch (command) {
    case 'daemon':
      await runDaemon();
      break;
    case 'process':
      await processQueue();
      break;
    case 'status':
      if (existsSync(QUEUE_FILE)) {
        const content = await readFile(QUEUE_FILE, 'utf-8');
        const count = content.split('\n').filter(Boolean).length;
        console.log(`📊 ${count} snapshots in queue`);
      } else {
        console.log('📊 Queue is empty');
      }
      break;
    default:
      console.log(`Timeline Queue Manager

Commands:
  daemon  - Run as background daemon
  process - Process queue once
  status  - Show queue status`);
  }
}