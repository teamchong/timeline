#!/usr/bin/env bun

/**
 * Timeline - Fast git-based snapshot tool (Bun version)
 *
 * Commands:
 *   view    - Interactive timeline view with HTML output
 *   save    - Create a new timeline snapshot
 *   travel  - Travel to a specific timeline
 *   search  - Search across timelines
 *   browse  - Browse diffs
 *   delete  - Delete timelines
 *   cleanup - Remove orphaned timeline branches
 */

import { $ } from 'bun';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { join, basename } from 'path';
import { tmpdir } from 'os';

// Types
interface Timeline {
  branch: string;
  hash: string;
  shortHash: string;
  time: string;
  date: string;
  message: string;
  sessionId?: string;
  stats: {
    filesChanged: number;
    additions: number;
    deletions: number;
  };
  files: Array<{
    status: string;
    path: string;
  }>;
}

interface Session {
  id: string;
  index: number;
  created: string;
  modified: string;
  timelines: Timeline[];
  fileCount?: number;
}

interface TimelineData {
  sessions: Session[];
  totalTimelines: number;
}

// Utility functions
async function getCurrentBranch(): Promise<string> {
  try {
    const result = await $`git branch --show-current`.text();
    return result.trim() || 'detached';
  } catch {
    return 'detached';
  }
}

async function isGitRepo(): Promise<boolean> {
  try {
    await $`git rev-parse --git-dir`.quiet();
    return true;
  } catch {
    return false;
  }
}

async function getAllTimelines(branch: string): Promise<string[]> {
  try {
    const refPattern = `refs/heads/timelines/${branch}/`;
    // Use string array to properly handle the command
    const result =
      await $`git for-each-ref --sort=-committerdate --format="%(refname:short)" ${refPattern}`.text();
    const lines = result
      .trim()
      .split('\n')
      .filter(line => line && line !== '');
    return lines;
  } catch (e) {
    // Silently return empty array if no timelines
    return [];
  }
}

async function getTimelineMetadata(
  timeline: string
): Promise<{ hash: string; sessionId?: string }> {
  const hash = await $`git rev-parse ${timeline}`
    .text()
    .then(h => h.trim())
    .catch(() => '');
  if (!hash) return { hash: '' };

  const notes = await $`git notes --ref=timeline show ${hash}`.text().catch(() => '');
  const sessionId = notes.match(/^Session-Id:\s*(.+)$/m)?.[1];

  return { hash, sessionId };
}

async function getSessionFiles(): Promise<Map<string, string>> {
  const sessions = new Map<string, string>();
  const projectDir = `${process.env.HOME}/.claude/projects/-Users-steven-chong-Downloads-repos-timeline`;

  if (!existsSync(projectDir)) return sessions;

  const files = await $`find ${projectDir} -name "*.jsonl" -type f`.text();
  for (const file of files
    .trim()
    .split('\n')
    .filter(f => f)) {
    const sessionId = basename(file, '.jsonl');
    sessions.set(sessionId, file);
  }

  return sessions;
}

async function getTimelineDetails(branch: string): Promise<Timeline> {
  const [hash, shortHash, time, date, message] = await Promise.all([
    $`git rev-parse ${branch}`.text().then(h => h.trim()),
    $`git rev-parse --short ${branch}`.text().then(h => h.trim()),
    $`git log -1 --pretty=format:"%cr" ${branch}`.text(),
    $`git log -1 --pretty=format:"%ci" ${branch}`.text(),
    $`git log -1 --pretty=format:"%s" ${branch}`.text(),
  ]);

  // Get stats
  const stats = await $`git diff --shortstat HEAD ${branch}`.text();
  const filesChanged = parseInt(stats.match(/(\d+) files? changed/)?.[1] || '0');
  const additions = parseInt(stats.match(/(\d+) insertions?/)?.[1] || '0');
  const deletions = parseInt(stats.match(/(\d+) deletions?/)?.[1] || '0');

  // Get changed files
  const filesText = await $`git diff --name-status HEAD ${branch}`.text();
  const files = filesText
    .trim()
    .split('\n')
    .filter(line => line)
    .map(line => {
      const [status, ...pathParts] = line.split(/\s+/);
      return { status, path: pathParts.join(' ') };
    });

  const metadata = await getTimelineMetadata(branch);

  return {
    branch,
    hash,
    shortHash,
    time: time.trim(),
    date: date.trim(),
    message: message.trim(),
    sessionId: metadata.sessionId,
    stats: { filesChanged, additions, deletions },
    files,
  };
}

async function processSessionsParallel(
  sessionIds: string[],
  allTimelines: string[]
): Promise<Session[]> {
  console.log(`\n📊 Processing ${sessionIds.length} sessions in parallel...`);

  // Create timeline cache for fast lookup
  console.log('📦 Building timeline cache...');
  const timelineCache = new Map<string, { hash: string; sessionId?: string }>();

  await Promise.all(
    allTimelines.map(async timeline => {
      const metadata = await getTimelineMetadata(timeline);
      timelineCache.set(timeline, metadata);
    })
  );

  console.log(`✅ Cached ${timelineCache.size} timelines`);

  // Process all sessions in parallel
  const sessionFiles = await getSessionFiles();

  const sessions = await Promise.all(
    sessionIds.map(async (sessionId, index) => {
      // Get session timestamps from file
      let created = 'Unknown';
      let modified = 'Unknown';

      const sessionFile = sessionFiles.get(sessionId);
      if (sessionFile && existsSync(sessionFile)) {
        try {
          // Get first and last timestamps from JSONL
          const firstLine = await $`head -1 ${sessionFile} | jq -r '.timestamp // empty'`.text();
          const lastLine = await $`tail -1 ${sessionFile} | jq -r '.timestamp // empty'`.text();

          if (firstLine.trim()) created = firstLine.trim();
          if (lastLine.trim()) modified = lastLine.trim();
        } catch {
          // Fallback to file times
          const stat = await Bun.file(sessionFile).stat();
          created = stat.birthtime?.toISOString() || 'Unknown';
          modified = stat.mtime.toISOString();
        }
      }

      // Find timelines for this session
      const sessionTimelines: Timeline[] = [];

      for (const [timeline, metadata] of timelineCache) {
        if (metadata.sessionId === sessionId) {
          const details = await getTimelineDetails(timeline);
          sessionTimelines.push(details);
        }
      }

      // Sort timelines by date (newest first)
      sessionTimelines.sort((a, b) => b.date.localeCompare(a.date));

      return {
        id: sessionId,
        index,
        created,
        modified,
        timelines: sessionTimelines,
        fileCount: sessionFile ? 1 : 0,
      };
    })
  );

  // Sort sessions by modification time (newest first)
  sessions.sort((a, b) => b.modified.localeCompare(a.modified));

  return sessions;
}

function generateHTML(data: TimelineData): string {
  const jsonData = JSON.stringify(data, null, 2);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Timeline View</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    fontFamily: {
                        'sans': ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
                        'mono': ['JetBrains Mono', 'monospace'],
                    }
                }
            }
        }
    </script>
    <style>
        [x-cloak] { display: none !important; }
        .timeline-gradient { background: linear-gradient(180deg, #10b981 0%, #34d399 50%, #6ee7b7 100%); }
        .header-gradient { background: linear-gradient(135deg, #10b981 0%, #34d399 100%); }
    </style>
    <script>
        const timelineData = ${jsonData};
    </script>
</head>
<body class="bg-gradient-to-br from-green-100 via-emerald-50 to-teal-100 min-h-screen p-4 md:p-8">
    <div x-data="{
        ...timelineData,
        activeSession: 0,
        expandedTimelines: {},
        sessionTabs: {},
        timelineTabs: {},
        showResumeModal: false,
        showTravelModal: false,
        modalSessionId: '',
        modalTravelHash: '',
        
        init() {
            this.sessions.forEach(session => {
                this.sessionTabs[session.id] = 'timelines';
                session.timelines.forEach(timeline => {
                    this.timelineTabs[timeline.hash] = 'files';
                    this.expandedTimelines[timeline.hash] = false;
                });
            });
        },
        
        formatTime(timestamp) {
            if (!timestamp || timestamp === 'Unknown') return 'Unknown';
            return new Date(timestamp).toLocaleString();
        },
        
        getStatusBadge(status) {
            const badges = {
                'A': { class: 'bg-green-100 text-green-700', text: 'Added' },
                'M': { class: 'bg-yellow-100 text-yellow-700', text: 'Modified' },
                'D': { class: 'bg-red-100 text-red-700', text: 'Deleted' }
            };
            return badges[status] || { class: 'bg-gray-100 text-gray-700', text: status };
        },
        
        copyCommand(text) {
            navigator.clipboard.writeText(text);
        }
    }" class="max-w-7xl mx-auto">
        
        <!-- Header -->
        <div class="bg-white rounded-3xl shadow-2xl overflow-hidden mb-8">
            <div class="header-gradient text-white p-8 md:p-12">
                <div class="flex items-center justify-center mb-4">
                    <svg class="w-12 h-12 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    <h1 class="text-4xl md:text-5xl font-bold">Timeline</h1>
                </div>
                <div class="text-center opacity-90">
                    <p class="text-sm">📂 <span x-text="sessions.length"></span> Sessions • ⏰ <span x-text="totalTimelines"></span> Timelines</p>
                </div>
            </div>
        </div>

        <!-- Sessions List -->
        <div class="space-y-4">
            <template x-for="(session, idx) in sessions" :key="session.id">
                <div class="bg-white rounded-xl shadow-lg overflow-hidden">
                    <!-- Session Header -->
                    <div @click="activeSession = activeSession === idx ? -1 : idx"
                         class="p-6 cursor-pointer hover:bg-gray-50 transition-colors">
                        <div class="flex items-center justify-between">
                            <div class="flex-1">
                                <h3 class="text-lg font-semibold">Session #<span x-text="idx + 1"></span></h3>
                                <p class="text-xs text-gray-500 font-mono" x-text="session.id"></p>
                                <p class="text-xs text-gray-500">📅 <span x-text="formatTime(session.created)"></span></p>
                            </div>
                            <div class="flex items-center gap-2">
                                <button @click.stop="(() => { 
                                    const cmd = 'bun /Users/steven_chong/Downloads/repos/timeline/render-conversation.ts ' + session.id;
                                    navigator.clipboard.writeText(cmd);
                                    alert('Command copied! Run in terminal: ' + cmd);
                                })()"
                                        class="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm hover:bg-blue-200 transition-colors">
                                    📖 View Chat
                                </button>
                                <span class="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                                    <span x-text="session.timelines.length"></span> timelines
                                </span>
                                <svg :class="activeSession === idx ? 'rotate-180' : ''"
                                     class="w-6 h-6 text-gray-400 transition-transform"
                                     fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                </svg>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Session Content -->
                    <div x-show="activeSession === idx" x-cloak class="border-t p-6">
                        <template x-if="session.timelines.length > 0">
                            <div class="space-y-4">
                                <template x-for="(timeline, tIdx) in session.timelines" :key="timeline.hash">
                                    <div class="bg-gray-50 rounded-lg p-4">
                                        <div class="flex items-start justify-between">
                                            <div class="flex-1">
                                                <p class="text-sm text-gray-500">⏰ <span x-text="timeline.time"></span></p>
                                                <h4 class="font-semibold" x-text="timeline.message"></h4>
                                                <div class="flex items-center gap-4 mt-2 text-sm">
                                                    <span>📁 <span x-text="timeline.stats.filesChanged"></span> files</span>
                                                    <span class="text-green-600">+<span x-text="timeline.stats.additions"></span></span>
                                                    <span class="text-red-600">-<span x-text="timeline.stats.deletions"></span></span>
                                                    <code class="text-xs bg-gray-200 px-2 py-1 rounded" x-text="timeline.shortHash"></code>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </template>
                            </div>
                        </template>
                        <template x-if="session.timelines.length === 0">
                            <p class="text-center text-gray-500 py-8">No timelines in this session yet</p>
                        </template>
                    </div>
                </div>
            </template>
        </div>
    </div>
</body>
</html>`;
}

// Command handlers
async function viewCommand() {
  if (!(await isGitRepo())) {
    console.error('❌ Not in a git repository');
    process.exit(1);
  }

  const startTime = performance.now();

  const currentBranch = await getCurrentBranch();
  const allTimelines = await getAllTimelines(currentBranch);

  console.log(`🔍 Found ${allTimelines.length} timelines on branch '${currentBranch}'`);

  // Get all unique session IDs
  const sessionIds = new Set<string>();
  const sessionFiles = await getSessionFiles();

  // Add sessions from files
  for (const [sessionId] of sessionFiles) {
    sessionIds.add(sessionId);
  }

  // Add sessions from timeline notes
  for (const timeline of allTimelines) {
    const metadata = await getTimelineMetadata(timeline);
    if (metadata.sessionId) {
      sessionIds.add(metadata.sessionId);
    }
  }

  const sessionList = Array.from(sessionIds);
  console.log(`📂 Found ${sessionList.length} sessions`);

  // Process all sessions in parallel
  const sessions = await processSessionsParallel(sessionList, allTimelines);

  // Calculate total timelines
  const totalTimelines = sessions.reduce((sum, s) => sum + s.timelines.length, 0);

  // Generate HTML
  const html = generateHTML({ sessions, totalTimelines });

  // Write to temp file
  const tempFile = `/tmp/timeline-view-${Date.now()}.html`;
  await Bun.write(tempFile, html);

  const endTime = performance.now();
  console.log(`\n✅ Generated in ${Math.round(endTime - startTime)}ms`);
  console.log(`📄 View saved to: ${tempFile}`);

  // Open in browser
  try {
    await $`open ${tempFile}`.quiet();
    console.log('🌐 Opened in browser');
  } catch {
    console.log('💡 Open the file in your browser to view');
  }
}

async function saveCommand() {
  if (!(await isGitRepo())) {
    console.error('❌ Not in a git repository');
    process.exit(1);
  }

  // Implementation would go here
  console.log('✅ Timeline saved (not yet implemented in TypeScript version)');
}

// Main CLI
const command = Bun.argv[2];
const args = Bun.argv.slice(3);

switch (command) {
  case 'view':
    await viewCommand();
    break;
  case 'save':
    await saveCommand();
    break;
  case 'travel':
    console.log('Travel command not yet implemented in TypeScript version');
    break;
  case 'search':
    console.log('Search command not yet implemented in TypeScript version');
    break;
  default:
    console.log(`Timeline - Git snapshot tool (Bun version)

Commands:
  view    - Interactive timeline view with HTML output
  save    - Create a new timeline snapshot
  travel  - Travel to a specific timeline
  search  - Search across timelines
  
Usage:
  bun timeline.ts <command> [options]`);
    process.exit(command ? 1 : 0);
}
