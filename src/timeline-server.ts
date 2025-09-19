#!/usr/bin/env bun

import { existsSync } from 'fs';
import { readFile, writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { spawn } from 'child_process';

const SERVER_DIR = join(process.env.HOME!, '.timeline');
const PID_FILE = join(SERVER_DIR, 'server.pid');
const PORT_FILE = join(SERVER_DIR, 'server.port');
const DEFAULT_PORT = 8888;

// Check if server is already running
async function isServerRunning(): Promise<{ running: boolean; pid?: number; port?: number }> {
  try {
    if (!existsSync(PID_FILE)) {
      return { running: false };
    }

    const pid = parseInt(await readFile(PID_FILE, 'utf-8'));
    
    // Check if process is actually running
    try {
      process.kill(pid, 0); // Signal 0 = check if process exists
      
      // Get port if available
      const port = existsSync(PORT_FILE) 
        ? parseInt(await readFile(PORT_FILE, 'utf-8'))
        : DEFAULT_PORT;
      
      return { running: true, pid, port };
    } catch {
      // Process not running, clean up stale PID file
      await unlink(PID_FILE).catch(() => {});
      if (existsSync(PORT_FILE)) {
        await unlink(PORT_FILE).catch(() => {});
      }
      return { running: false };
    }
  } catch (error) {
    return { running: false };
  }
}

// Start the timeline server in background
export async function startServer(port: number = DEFAULT_PORT): Promise<void> {
  // Ensure server directory exists
  if (!existsSync(SERVER_DIR)) {
    await mkdir(SERVER_DIR, { recursive: true });
  }
  
  const status = await isServerRunning();
  
  if (status.running) {
    // Stop existing server first
    console.log(`🔄 Restarting server on port ${port}...`);
    await stopServer(true); // silent mode
    // Give it a moment to fully stop
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Start the server in background
  const viewPath = join(process.env.HOME!, 'Downloads/repos/timeline/src/view.ts');
  
  const child = spawn('bun', [viewPath, 'view', '--background', `--port=${port}`], {
    detached: true,
    stdio: 'ignore',
  });

  // Allow parent to exit independently
  child.unref();

  // Save PID and port
  if (child.pid) {
    await writeFile(PID_FILE, child.pid.toString());
    await writeFile(PORT_FILE, port.toString());
    console.log(`🚀 Timeline server started on port ${port} (PID: ${child.pid})`);
    console.log(`   View at: http://localhost:${port}`);
    console.log(`   Stop with: timeline stop`);
  } else {
    console.error('❌ Failed to start server - no PID available');
    return;
  }
}

// Stop the timeline server
export async function stopServer(silent: boolean = false): Promise<void> {
  const status = await isServerRunning();
  
  if (!status.running) {
    if (!silent) {
      console.log('❌ Timeline server is not running');
    }
    return;
  }

  try {
    process.kill(status.pid!, 'SIGTERM');
    await unlink(PID_FILE).catch(() => {});
    await unlink(PORT_FILE).catch(() => {});
    if (!silent) {
      console.log(`✅ Timeline server stopped (was PID: ${status.pid})`);
    }
  } catch (error) {
    if (!silent) {
      console.error('❌ Failed to stop server:', error);
    }
    // Try force kill
    try {
      process.kill(status.pid!, 'SIGKILL');
      await unlink(PID_FILE).catch(() => {});
      await unlink(PORT_FILE).catch(() => {});
      if (!silent) {
        console.log('✅ Timeline server force stopped');
      }
    } catch {
      if (!silent) {
        console.error('❌ Could not stop server. You may need to kill it manually.');
      }
    }
  }
}

// Get server status
export async function serverStatus(): Promise<void> {
  const status = await isServerRunning();
  
  if (status.running) {
    console.log(`✅ Timeline server is running`);
    console.log(`   PID: ${status.pid}`);
    console.log(`   Port: ${status.port}`);
    console.log(`   URL: http://localhost:${status.port}`);
  } else {
    console.log('❌ Timeline server is not running');
    console.log('   Start with: timeline view');
  }
}

// Open browser to timeline view
export async function openBrowser(): Promise<void> {
  const status = await isServerRunning();
  
  if (!status.running) {
    console.error('❌ Server is not running. Start with: timeline view');
    return;
  }
  
  const port = status.port || DEFAULT_PORT;
  const url = `http://localhost:${port}`;
  
  // Open browser based on platform
  const platform = process.platform;
  let cmd: string;
  
  if (platform === 'darwin') {
    cmd = `open "${url}"`;
  } else if (platform === 'win32') {
    cmd = `start "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }
  
  const { exec } = await import('child_process');
  exec(cmd, (error) => {
    if (error) {
      console.log(`❌ Could not open browser. Visit: ${url}`);
    } else {
      console.log(`🌐 Opened: ${url}`);
    }
  });
}