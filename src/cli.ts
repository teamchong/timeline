#!/usr/bin/env bun

import * as timeline from './timeline-core';
import { startServer, stopServer, serverStatus, openBrowser } from './timeline-server';

const VERSION = '2.0.0';

// Handle signals to prevent zombie processes
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
process.on('SIGHUP', () => process.exit(0));

async function showHelp() {
  console.log(`
Timeline - Git-based snapshot tool for Claude Code (Bun version)
Version: ${VERSION}

Usage: timeline <command> [options]

Commands:
  save              Create a manual snapshot
  view              Start timeline server in background and open browser
  stop              Stop timeline server
  status            Check if timeline server is running
  list              List all timelines
  travel [n|hash]   Travel to timeline by number or commit hash
  search <pattern>  Search across timelines
  delete            Delete all timelines (interactive)
  cleanup           Remove orphaned timeline branches
  install           Install Claude Code hooks
  uninstall         Remove Claude Code hooks

Examples:
  timeline save                     # Create snapshot
  timeline view                     # Start server & open browser
  timeline stop                     # Stop background server
  timeline list                     # Show all timelines
  timeline travel 3                 # Travel to timeline #3
  timeline search "function foo"    # Search in timelines
`);
}

async function runView() {
  // Run the view.ts directly with bun
  // This is the fast implementation that generates HTML in ~3 seconds
  const { spawn } = await import('child_process');
  const viewPath = `${process.env.HOME}/Downloads/repos/timeline/src/view.ts`;
  
  const proc = spawn('bun', [viewPath, 'view'], {
    stdio: 'inherit',
  });

  proc.on('exit', code => {
    process.exit(code || 0);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'view':
      // Start server in background and open browser
      await startServer();
      await openBrowser();
      break;

    case 'stop':
      await stopServer();
      break;

    case 'status':
      await serverStatus();
      break;

    case 'save':
      await timeline.save();
      break;

    case 'list':
      await timeline.list();
      break;

    case 'install':
      await timeline.install();
      break;

    case 'uninstall':
      await timeline.uninstall();
      break;

    case 'delete':
      await timeline.deleteTimelines();
      break;

    case 'cleanup':
      await timeline.cleanup();
      break;

    case 'travel':
      await timeline.travel(args[1]);
      break;

    case 'search':
      if (!args[1]) {
        console.error('Please provide a search pattern');
        process.exit(1);
      }
      await timeline.search(args[1]);
      break;

    case 'browse':
      console.log('Browse command not yet implemented in Bun version');
      break;

    case undefined:
    case 'help':
    case '--help':
    default:
      await showHelp();
      break;
  }
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
