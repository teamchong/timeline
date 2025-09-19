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
import { existsSync } from 'fs';
import { join, basename } from 'path';

// Types
interface Timeline {
  branch: string;
  hash: string;
  shortHash: string;
  time: string;
  date: string;
  message: string;
  sessionId?: string;
  // Lazy-loaded details
  stats?: {
    filesChanged: number;
    additions: number;
    deletions: number;
  };
  files?: Array<{
    status: string;
    path: string;
  }>;
}

interface ProjectTimelines {
  projectPath: string;
  projectName: string;
  timelines: Timeline[];
}

interface Session {
  id: string;
  index: number;
  created: string;
  modified: string;
  timelines: Timeline[];
  projects: ProjectTimelines[];  // Group timelines by project
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
    const gitDir = await $`git rev-parse --git-dir`.text().then(d => d.trim());
    const timelinesDir = join(gitDir, 'refs', 'heads', 'timelines', branch);
    
    if (!existsSync(timelinesDir)) return [];
    
    // Use Bun's Glob to find timeline refs
    const glob = new Bun.Glob("*");
    const timelines: string[] = [];
    
    for await (const file of glob.scan(timelinesDir)) {
      // Reconstruct the full ref name
      timelines.push(`timelines/${branch}/${file}`);
    }
    
    // Sort by modification time (newest first)
    const timelinesWithStats = await Promise.all(
      timelines.map(async (timeline) => {
        const filePath = join(timelinesDir, basename(timeline));
        const stat = await Bun.file(filePath).stat();
        return { timeline, mtime: stat.mtime };
      })
    );
    
    return timelinesWithStats
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
      .map(t => t.timeline);
  } catch (e) {
    // Silently return empty array if no timelines
    return [];
  }
}

async function getTimelineMetadata(
  timeline: string
): Promise<{ hash: string; sessionId?: string; projectPath?: string }> {
  const hash = await $`git rev-parse ${timeline}`
    .text()
    .then(h => h.trim())
    .catch(() => '');
  if (!hash) return { hash: '' };

  const notes = await $`git notes --ref=timeline-metadata show ${hash}`.text().catch(() => '');
  
  // Try to parse as JSON first (new format)
  try {
    const metadata = JSON.parse(notes);
    return { hash, sessionId: metadata.sessionId, projectPath: metadata.projectPath };
  } catch {
    // Fall back to old format
    const sessionId = notes.match(/^Session-Id:\s*(.+)$/m)?.[1];
    return { hash, sessionId };
  }
}

async function getSessionFiles(projectPath?: string): Promise<Map<string, string>> {
  const sessions = new Map<string, string>();
  
  // Encode the project path to match Claude's directory naming
  // Claude replaces all '/' and '_' with '-' in the path
  const encodedPath = projectPath 
    ? projectPath.replace(/[/_]/g, '-')
    : '-Users-steven-chong-Downloads-repos-timeline';
  
  const projectDir = `${process.env.HOME}/.claude/projects/${encodedPath}`;

  if (!existsSync(projectDir)) return sessions;

  // Use Bun's Glob API to find files
  const glob = new Bun.Glob("*.jsonl");
  for await (const file of glob.scan(projectDir)) {
    const fullPath = join(projectDir, file);
    const sessionId = basename(file, '.jsonl');
    sessions.set(sessionId, fullPath);
  }

  return sessions;
}

// Fast timeline info (just basic info, no diff stats)
async function getTimelineInfo(branch: string): Promise<Timeline> {
  const [hash, shortHash, time, date, message] = await Promise.all([
    $`git rev-parse ${branch}`.text().then(h => h.trim()),
    $`git rev-parse --short ${branch}`.text().then(h => h.trim()),
    $`git log -1 --pretty=format:"%cr" ${branch}`.text(),
    $`git log -1 --pretty=format:"%ci" ${branch}`.text(),
    $`git log -1 --pretty=format:"%s" ${branch}`.text(),
  ]);

  const metadata = await getTimelineMetadata(branch);

  return {
    branch,
    hash,
    shortHash,
    time: time.trim(),
    date: date.trim(),
    message: message.trim(),
    sessionId: metadata.sessionId,
    // Stats and files are lazy-loaded
  };
}

// Full timeline details (with diff stats - used on demand)
async function getTimelineDetails(branch: string): Promise<Timeline> {
  const baseInfo = await getTimelineInfo(branch);
  
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
      return { status: status || '', path: pathParts.join(' ') };
    });

  return {
    ...baseInfo,
    stats: { filesChanged, additions, deletions },
    files,
  };
}

async function processSessionsParallel(
  sessionIds: string[],
  timelineCache: Map<string, { hash: string; sessionId?: string; projectPath?: string }>
): Promise<Session[]> {
  console.log(`\n📊 Processing ${sessionIds.length} sessions in parallel...`);

  // Use the provided timeline cache (already built)
  console.log(`✅ Using cached ${timelineCache.size} timelines`);

  // Process all sessions in parallel
  const sessionFiles = await getSessionFiles();

  const sessions = await Promise.all(
    sessionIds.map(async (sessionId, index) => {
      // Get session timestamps from the actual Claude session file
      let created = 'Unknown';
      let modified = 'Unknown';

      const sessionFile = sessionFiles.get(sessionId);
      if (sessionFile && existsSync(sessionFile)) {
        try {
          // Use Bun to read and parse the file efficiently
          const file = Bun.file(sessionFile);
          const fileContent = await file.text();
          const lines = fileContent.trim().split('\n').filter(Boolean);
          
          // Find first line with timestamp
          for (const line of lines) {
            try {
              const json = JSON.parse(line);
              if (json.timestamp) {
                created = json.timestamp;
                break;
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
          
          // Find last line with timestamp (iterate backwards)
          for (let i = lines.length - 1; i >= 0; i--) {
            try {
              const json = JSON.parse(lines[i] || '{}');
              if (json.timestamp) {
                modified = json.timestamp;
                break;
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
          
          // If we still don't have timestamps, use file stats
          if (created === 'Unknown' || modified === 'Unknown') {
            const stat = await file.stat();
            if (created === 'Unknown') created = stat.birthtime?.toISOString() || 'Unknown';
            if (modified === 'Unknown') modified = stat.mtime.toISOString();
          }
        } catch (error) {
          // Fallback to file times
          try {
            const stat = await Bun.file(sessionFile).stat();
            created = stat.birthtime?.toISOString() || 'Unknown';
            modified = stat.mtime.toISOString();
          } catch {
            // Keep as Unknown if we can't even stat the file
          }
        }
      } else {
        // This shouldn't happen if we're only processing real Claude sessions
        console.warn(`Session file not found for ${sessionId}`);
      }

      // Find timelines for this session (might be empty for sessions with no timelines)
      const sessionTimelines: Timeline[] = [];
      const projectMap = new Map<string, Timeline[]>();

      for (const [timeline, metadata] of timelineCache) {
        if (metadata.sessionId === sessionId) {
          // Get actual timeline info from git
          const timelineInfo = await getTimelineInfo(timeline);
          
          const info: Timeline = {
            branch: timeline,
            hash: metadata.hash,
            shortHash: metadata.hash.substring(0, 7),
            time: timelineInfo.time,
            date: timelineInfo.date,
            message: timelineInfo.message,
            sessionId: metadata.sessionId,
          };
          sessionTimelines.push(info);
          
          // Group by project
          const projectPath = metadata.projectPath || process.cwd();
          if (!projectMap.has(projectPath)) {
            projectMap.set(projectPath, []);
          }
          projectMap.get(projectPath)!.push(info);
        }
      }
      
      // If no timelines, still show the session for the current project
      if (sessionTimelines.length === 0) {
        projectMap.set(process.cwd(), []);
      }

      // Sort timelines by date (newest first)
      sessionTimelines.sort((a, b) => b.date.localeCompare(a.date));
      
      // Create project groups
      const projects: ProjectTimelines[] = Array.from(projectMap.entries()).map(([path, timelines]) => ({
        projectPath: path,
        projectName: path.split('/').pop() || 'Unknown',
        timelines: timelines.sort((a, b) => b.date.localeCompare(a.date))
      }));

      return {
        id: sessionId,
        index,
        created,
        modified,
        timelines: sessionTimelines,
        projects,
        fileCount: sessionFiles.has(sessionId) ? 1 : 0,
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
        <div class="space-y-2">
            <template x-for="(session, idx) in sessions" :key="session.id">
                <div class="border border-gray-200 rounded-lg bg-white shadow-sm hover:shadow-md transition-shadow">
                    <!-- Session Header -->
                    <div @click="activeSession = activeSession === idx ? -1 : idx"
                         class="p-4 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-100">
                        <div class="flex items-center justify-between">
                            <div class="flex-1">
                                <h3 class="text-lg font-semibold text-gray-800">Session #<span x-text="idx + 1"></span></h3>
                                <p class="text-xs text-gray-500 font-mono mt-1" x-text="session.id"></p>
                                <div class="text-xs text-gray-500 mt-2 flex gap-4">
                                    <span>📅 Created: <span x-text="formatTime(session.created)"></span></span>
                                    <span>🔄 Modified: <span x-text="formatTime(session.modified)"></span></span>
                                </div>
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
                                <span class="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                                    <span x-text="session.projects.reduce((sum, p) => sum + p.timelines.length, 0)"></span> timelines
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
                    <div x-show="activeSession === idx" x-cloak class="p-4 bg-gray-50">
                        <template x-if="session.projects && session.projects.length > 0">
                            <div class="space-y-3">
                                <template x-for="(project, pIdx) in session.projects" :key="project.projectPath">
                                    <div class="bg-white rounded-lg border border-gray-200 p-3">
                                        <h4 class="font-semibold mb-2 text-gray-700 text-sm">
                                            📂 <span x-text="project.projectName"></span>
                                            <span class="text-xs text-gray-500 font-mono ml-2" x-text="project.projectPath"></span>
                                        </h4>
                                        <div class="space-y-1 ml-2">
                                            <template x-for="(timeline, tIdx) in project.timelines" :key="timeline.hash">
                                                <div class="bg-gray-50 border-l-2 border-green-400 rounded-r p-2 hover:bg-gray-100 transition-colors">
                                                    <div class="flex items-start justify-between">
                                                        <div class="flex-1">
                                                            <p class="text-xs text-gray-500">⏰ <span x-text="timeline.time"></span></p>
                                                            <h5 class="text-sm font-medium text-gray-800 mb-1" x-text="timeline.message"></h5>
                                                            <div class="flex items-center gap-2 text-xs">
                                                                <template x-if="timeline.stats">
                                                                    <span class="text-gray-600">📁 <span x-text="timeline.stats.filesChanged"></span> files</span>
                                                                </template>
                                                                <template x-if="timeline.stats">
                                                                    <span class="text-green-600 font-medium">+<span x-text="timeline.stats.additions"></span></span>
                                                                </template>
                                                                <template x-if="timeline.stats">
                                                                    <span class="text-red-600 font-medium">-<span x-text="timeline.stats.deletions"></span></span>
                                                                </template>
                                                                <code class="bg-gray-200 px-2 py-0.5 rounded font-mono" x-text="timeline.shortHash"></code>
                                                                <button @click.stop="(() => {
                                                                    const cmd = 'timeline travel ' + timeline.shortHash;
                                                                    navigator.clipboard.writeText(cmd);
                                                                    alert('Command copied: ' + cmd);
                                                                })()"
                                                                    class="px-2 py-0.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors">
                                                                    Travel
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </template>
                                        </div>
                                    </div>
                                </template>
                            </div>
                        </template>
                        <template x-if="!session.projects || session.projects.length === 0">
                            <p class="text-center text-gray-500 py-8">No timelines in this session for this project</p>
                        </template>
                    </div>
                </div>
            </template>
        </div>
    </div>
</body>
</html>`;
}

// Generate instant loading HTML with Alpine.js pre-configured
function generateLoadingHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Timeline View</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
        [x-cloak] { display: none !important; }
    </style>
</head>
<body class="bg-gradient-to-br from-green-100 via-emerald-50 to-teal-100 min-h-screen p-4 md:p-8"
      x-data="timelineApp()" x-init="loadData()">
    
    <div class="max-w-7xl mx-auto">
        <!-- Loading State -->
        <div x-show="loading" class="bg-white rounded-3xl shadow-2xl overflow-hidden mb-8">
            <div class="bg-gradient-to-r from-green-500 to-emerald-600 text-white p-8 md:p-12">
                <div class="flex items-center justify-center mb-4">
                    <svg class="w-12 h-12 mr-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    <h1 class="text-4xl md:text-5xl font-bold">Loading Timeline...</h1>
                </div>
                <div class="text-center">
                    <p class="text-xl opacity-90" x-text="loadingMessage"></p>
                </div>
            </div>
        </div>
        
        <!-- Main Content (hidden while loading) -->
        <div x-show="!loading" x-cloak>
            <!-- Header -->
            <div class="bg-white rounded-3xl shadow-2xl overflow-hidden mb-8">
                <div class="bg-gradient-to-r from-green-500 to-emerald-600 text-white p-8 md:p-12">
                    <h1 class="text-4xl md:text-5xl font-bold text-center">Timeline</h1>
                    <div class="text-center mt-4">
                        <p class="text-sm">📂 <span x-text="sessions.length"></span> Sessions • ⏰ <span x-text="totalTimelines"></span> Timelines</p>
                        <button @click="reload()" 
                                class="mt-2 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-full text-xs text-white transition-colors">
                            🔄 Reload
                        </button>
                        <span class="text-xs text-white/80 block mt-1" x-show="streamProgress > 0 && streamProgress < 100">
                            Loading... <span x-text="streamProgress"></span>%
                        </span>
                    </div>
                </div>
            </div>
            
            <!-- Sessions List -->
            <div class="space-y-2">
                <template x-for="(session, idx) in sessions" :key="session.id">
                    <div class="border border-gray-200 rounded-lg bg-white shadow-sm hover:shadow-md transition-shadow">
                        <div @click="activeSession = activeSession === idx ? -1 : idx"
                             class="p-4 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-100">
                            <div class="flex items-center justify-between">
                                <div class="flex-1">
                                    <h3 class="text-lg font-semibold text-gray-800">Session #<span x-text="idx + 1"></span></h3>
                                    <p class="text-xs text-gray-500 font-mono mt-1" x-text="session.id"></p>
                                    <div class="text-xs text-gray-500 mt-2 flex gap-4">
                                        <span>📅 Created: <span x-text="formatTime(session.created)"></span></span>
                                        <span>🔄 Modified: <span x-text="formatTime(session.modified)"></span></span>
                                    </div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <button @click.stop="showResumeModal(session.id)"
                                            class="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm hover:bg-blue-200 transition-colors">
                                        📖 Resume
                                    </button>
                                    <span class="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                                        <span x-text="session.projects?.reduce((sum, p) => sum + p.timelines.length, 0) || 0"></span> timelines
                                    </span>
                                    <svg :class="activeSession === idx ? 'rotate-180' : ''"
                                         class="w-6 h-6 text-gray-400 transition-transform"
                                         fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                    </svg>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Expanded content -->
                        <div x-show="activeSession === idx" x-collapse class="p-4 bg-gray-50">
                            <template x-if="session.projects && session.projects.length > 0">
                                <div class="space-y-3">
                                    <template x-for="(project, pIdx) in session.projects" :key="project.projectPath">
                                        <div class="bg-white rounded-lg border border-gray-200 p-3">
                                            <h4 class="font-semibold mb-2 text-gray-700 text-sm">
                                                📂 <span x-text="project.projectName"></span>
                                            </h4>
                                            <div class="space-y-1 ml-2">
                                                <template x-for="(timeline, tIdx) in project.timelines" :key="timeline.hash">
                                                    <div class="bg-gray-50 border-l-2 border-green-400 rounded-r p-2 hover:bg-gray-100 transition-colors">
                                                        <div class="flex items-center justify-between">
                                                            <div class="flex-1">
                                                                <p class="text-sm font-medium text-gray-800" x-text="timeline.message"></p>
                                                                <p class="text-xs text-gray-500 mt-1">
                                                                    <span x-text="timeline.time"></span> • 
                                                                    <code class="font-mono" x-text="timeline.shortHash"></code>
                                                                </p>
                                                            </div>
                                                            <button @click="showTravelModal(timeline.shortHash)"
                                                                    class="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs hover:bg-purple-200">
                                                                ⏮ Travel
                                                            </button>
                                                        </div>
                                                    </div>
                                                </template>
                                            </div>
                                        </div>
                                    </template>
                                </div>
                            </template>
                            <template x-if="!session.projects || session.projects.length === 0">
                                <p class="text-center text-gray-500 py-8">No timelines in this session for this project</p>
                            </template>
                        </div>
                    </div>
                </template>
            </div>
        </div>
    </div>
    
    <!-- Modals -->
    <div x-show="modalVisible" x-cloak
         class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
         @click.self="modalVisible = false">
        <div class="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 class="text-lg font-semibold mb-4" x-text="modalTitle"></h3>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-2">Command to copy:</label>
                <div class="flex gap-2">
                    <input type="text" x-model="modalCommand" readonly
                           class="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 font-mono text-sm"
                           @click="$event.target.select()">
                    <button @click="copyCommand()"
                            class="px-4 py-2 rounded-md transition-all duration-200"
                            :class="copied ? 'bg-green-500 hover:bg-green-600' : 'bg-blue-500 hover:bg-blue-600'"
                            x-html="copied ? '✓ Copied' : '📋 Copy'">
                    </button>
                </div>
            </div>
            <p class="text-xs text-gray-500 mb-4" x-text="modalDescription"></p>
            <button @click="modalVisible = false"
                    class="w-full px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">
                Close
            </button>
        </div>
    </div>
    
    <script>
    function timelineApp() {
        return {
            loading: true,
            loadingMessage: 'Initializing...',
            sessions: [],
            totalTimelines: 0,
            activeSession: -1,
            modalVisible: false,
            modalTitle: '',
            modalCommand: '',
            modalDescription: '',
            copied: false,
            copyTimer: null,
            streamProgress: 0,
            
            formatTime(timestamp) {
                if (!timestamp || timestamp === 'Unknown') return 'Unknown';
                return new Date(timestamp).toLocaleString();
            },
            
            showResumeModal(sessionId) {
                this.modalTitle = '📖 Resume Session';
                this.modalCommand = 'claude -r ' + sessionId;
                this.modalDescription = 'This command will resume the Claude Code session.';
                this.modalVisible = true;
                this.copied = false;
                if (this.copyTimer) {
                    clearTimeout(this.copyTimer);
                    this.copyTimer = null;
                }
            },
            
            showTravelModal(commitHash) {
                this.modalTitle = '⏮ Travel to Timeline';
                this.modalCommand = 'timeline travel ' + commitHash;
                this.modalDescription = 'This will restore your working directory to commit ' + commitHash + '.';
                this.modalVisible = true;
                this.copied = false;
                if (this.copyTimer) {
                    clearTimeout(this.copyTimer);
                    this.copyTimer = null;
                }
            },
            
            copyCommand() {
                navigator.clipboard.writeText(this.modalCommand);
                
                // Clear existing timer if user clicks again
                if (this.copyTimer) {
                    clearTimeout(this.copyTimer);
                }
                
                // Set copied state
                this.copied = true;
                
                // Set new timer - extends the duration if clicked again
                this.copyTimer = setTimeout(() => {
                    this.copied = false;
                    this.copyTimer = null;
                }, 2000);
            },
            
            async loadDataStreaming() {
                // Use streaming JSONL endpoint for progressive loading
                try {
                    const response = await fetch('/api/timeline-stream');
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '';
                    
                    const sessionsMap = new Map();
                    
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        
                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\\n');
                        buffer = lines.pop() || ''; // Keep incomplete line in buffer
                        
                        for (const line of lines) {
                            if (!line.trim()) continue;
                            
                            try {
                                const event = JSON.parse(line);
                                
                                switch (event.type) {
                                    case 'status':
                                        this.loadingMessage = event.data.message;
                                        break;
                                        
                                    case 'info':
                                        this.totalTimelines = event.data.totalTimelines;
                                        this.loadingMessage = 'Loading ' + event.data.totalTimelines + ' timelines from branch ' + event.data.branch + '...';
                                        break;
                                        
                                    case 'progress':
                                        this.streamProgress = Math.round((event.data.processed / event.data.total) * 100);
                                        this.loadingMessage = event.data.message + ' [' + this.streamProgress + '%]';
                                        break;
                                        
                                    case 'timelines':
                                        // Process incoming timelines chunk
                                        for (const timeline of event.data) {
                                            if (timeline.sessionId) {
                                                if (!sessionsMap.has(timeline.sessionId)) {
                                                    sessionsMap.set(timeline.sessionId, {
                                                        id: timeline.sessionId,
                                                        timelines: [],
                                                        projects: []
                                                    });
                                                }
                                                sessionsMap.get(timeline.sessionId).timelines.push(timeline);
                                            }
                                        }
                                        
                                        // Update UI with partial data
                                        this.updateSessionsFromMap(sessionsMap);
                                        this.loading = false; // Show data as it arrives
                                        break;
                                        
                                    case 'complete':
                                        this.loadingMessage = event.data.message;
                                        this.loading = false;
                                        break;
                                        
                                    case 'error':
                                        console.error('Stream error:', event.data.message);
                                        this.loadingMessage = 'Error: ' + event.data.message;
                                        break;
                                }
                            } catch (e) {
                                console.error('Failed to parse line:', line, e);
                            }
                        }
                    }
                } catch (error) {
                    console.error('Failed to load timeline data:', error);
                    this.loadingMessage = 'Failed to load timeline data';
                    this.loading = false;
                }
            },
            
            updateSessionsFromMap(sessionsMap) {
                // Convert sessions map to array and organize by project
                const sessions = Array.from(sessionsMap.values()).map(session => {
                    // Group timelines by project
                    const projectsMap = new Map();
                    
                    for (const timeline of session.timelines) {
                        const projectPath = timeline.projectPath || process.cwd();
                        const projectName = projectPath.split('/').pop() || 'Unknown';
                        
                        if (!projectsMap.has(projectPath)) {
                            projectsMap.set(projectPath, {
                                projectPath,
                                projectName,
                                timelines: []
                            });
                        }
                        projectsMap.get(projectPath).timelines.push(timeline);
                    }
                    
                    return {
                        ...session,
                        projects: Array.from(projectsMap.values()),
                        created: session.timelines[0]?.date || 'Unknown',
                        modified: session.timelines[session.timelines.length - 1]?.date || 'Unknown'
                    };
                });
                
                // Sort sessions by most recent first
                this.sessions = sessions.sort((a, b) => {
                    const dateA = new Date(a.modified).getTime();
                    const dateB = new Date(b.modified).getTime();
                    return dateB - dateA;
                });
            },
            
            async loadData() {
                // Always use streaming for progressive loading
                await this.loadDataStreaming();
            },
            
            reload() {
                this.loading = true;
                this.sessions = [];
                this.streamProgress = 0;
                this.loadingMessage = 'Reloading...';
                this.loadData();
            }
        }
    }
    </script>
</body>
</html>`;
}

// Command handlers
async function viewCommand(customPort?: number, isBackground: boolean = false) {
  if (!(await isGitRepo())) {
    console.error('❌ Not in a git repository');
    process.exit(1);
  }

  const currentProjectPath = process.cwd();
  const port = customPort || 8888;
  
  // Cache for timeline data
  let cachedData: any = null;
  let loadingStatus = { 
    isLoading: true, 
    message: 'Initializing...', 
    progress: 0,
    totalSteps: 4 
  };

  // Start background data processing
  const loadDataInBackground = async () => {
    try {
      console.log('🚀 Starting background data processing...');
      
      // Step 1: Load git timelines
      loadingStatus.message = 'Loading git timelines...';
      loadingStatus.progress = 1;
      const currentBranch = await getCurrentBranch();
      const allTimelines = await getAllTimelines(currentBranch);
      console.log(`🔍 Found ${allTimelines.length} timelines on branch '${currentBranch}'`);
      
      // Step 2: Load session files
      loadingStatus.message = 'Loading Claude sessions...';
      loadingStatus.progress = 2;
      const sessionFiles = await getSessionFiles(currentProjectPath);
      
      // Step 3: Process metadata
      loadingStatus.message = 'Processing timeline metadata...';
      loadingStatus.progress = 3;
      const timelineMetadataCache = new Map<string, { hash: string; sessionId?: string; projectPath?: string }>();
      
      for (const timeline of allTimelines) {
        const metadata = await getTimelineMetadata(timeline);
        if (metadata.sessionId) {
          timelineMetadataCache.set(timeline, metadata);
        }
      }
      
      const relevantSessions = Array.from(sessionFiles.keys());
      console.log(`📂 Found ${relevantSessions.length} Claude sessions`);
      
      // Step 4: Process sessions
      loadingStatus.message = 'Processing session data...';
      loadingStatus.progress = 4;
      const sessions = await processSessionsParallel(relevantSessions, timelineMetadataCache);
      
      // Filter to current project
      const filteredSessions = sessions.filter(session => 
        session.projects.some(p => p.projectPath === currentProjectPath)
      );
      
      const totalTimelines = filteredSessions.reduce((sum, s) => 
        sum + s.projects.filter(p => p.projectPath === currentProjectPath)
          .reduce((pSum, p) => pSum + p.timelines.length, 0), 0
      );
      
      // Cache the processed data
      cachedData = {
        sessions: filteredSessions,
        totalTimelines
      };
      
      loadingStatus.isLoading = false;
      loadingStatus.message = 'Data loaded successfully!';
      console.log('✅ Background data processing complete');
      
    } catch (error) {
      console.error('❌ Error in background processing:', error);
      loadingStatus.isLoading = false;
      loadingStatus.message = 'Error loading data';
      cachedData = { sessions: [], totalTimelines: 0 };
    }
  };

  // Start background loading immediately
  loadDataInBackground();

  // Start the server with cached data support
  const server = Bun.serve({
    port: port, // Use custom port or 8888
    async fetch(request) {
      const url = new URL(request.url);
      
      // Serve the main HTML page
      if (url.pathname === '/' || url.pathname === '/timeline') {
        return new Response(generateLoadingHTML(), {
          headers: {
            'Content-Type': 'text/html',
          },
        });
      }
      
      // Enable CORS for API requests
      const headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      };
      
      // Serve loading status
      if (url.pathname === '/api/status') {
        return new Response(JSON.stringify(loadingStatus), { headers });
      }
      
      // Serve cached data instantly or loading status
      if (url.pathname === '/api/timeline-data') {
        if (cachedData) {
          // Data is ready, serve immediately from cache
          return new Response(JSON.stringify(cachedData), { headers });
        } else {
          // Data still loading, return loading status
          return new Response(JSON.stringify({
            loading: true,
            status: loadingStatus
          }), { headers });
        }
      }
      
      // Streaming JSONL endpoint for progressive loading
      if (url.pathname === '/api/timeline-stream') {
        // Create a readable stream that sends data as JSONL
        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            
            // Send initial status
            controller.enqueue(encoder.encode(JSON.stringify({ type: 'status', data: { loading: true, message: 'Starting timeline scan...' } }) + '\n'));
            
            try {
              const branch = await getCurrentBranch();
              const timelines = await getAllTimelines(branch);
              const sessionsMap = new Map<string, Session>();
              
              // Send total count
              controller.enqueue(encoder.encode(JSON.stringify({ 
                type: 'info', 
                data: { totalTimelines: timelines.length, branch } 
              }) + '\n'));
              
              // Process timelines in chunks for streaming
              const chunkSize = 5;
              for (let i = 0; i < timelines.length; i += chunkSize) {
                const chunk = timelines.slice(i, Math.min(i + chunkSize, timelines.length));
                
                // Process chunk
                const chunkData = await Promise.all(
                  chunk.map(async (timeline) => {
                    const metadata = await getTimelineMetadata(timeline);
                    if (!metadata.hash) return null;
                    
                    const shortHash = metadata.hash.substring(0, 7);
                    const [date, time, message] = await Promise.all([
                      $`git log -1 --format=%cd --date=short ${metadata.hash}`.text().then(t => t.trim()),
                      $`git log -1 --format=%cr ${metadata.hash}`.text().then(t => t.trim()),
                      $`git log -1 --format=%s ${metadata.hash}`.text().then(m => m.trim())
                    ]);
                    
                    return {
                      branch: timeline,
                      hash: metadata.hash,
                      shortHash,
                      time,
                      date,
                      message: message || 'No message',
                      sessionId: metadata.sessionId,
                      projectPath: metadata.projectPath
                    };
                  })
                );
                
                // Stream this chunk
                const validChunkData = chunkData.filter(Boolean);
                if (validChunkData.length > 0) {
                  controller.enqueue(encoder.encode(JSON.stringify({ 
                    type: 'timelines', 
                    data: validChunkData,
                    progress: Math.min(100, Math.round((i + chunk.length) / timelines.length * 100))
                  }) + '\n'));
                }
                
                // Update progress
                controller.enqueue(encoder.encode(JSON.stringify({ 
                  type: 'progress', 
                  data: { 
                    processed: Math.min(i + chunk.length, timelines.length),
                    total: timelines.length,
                    message: `Processing timeline ${Math.min(i + chunk.length, timelines.length)} of ${timelines.length}...`
                  }
                }) + '\n'));
              }
              
              // Send completion
              controller.enqueue(encoder.encode(JSON.stringify({ 
                type: 'complete', 
                data: { message: 'Timeline loading complete' } 
              }) + '\n'));
              
            } catch (error) {
              controller.enqueue(encoder.encode(JSON.stringify({ 
                type: 'error', 
                data: { message: error instanceof Error ? error.message : String(error) } 
              }) + '\n'));
            } finally {
              controller.close();
            }
          }
        });
        
        return new Response(stream, {
          headers: {
            'Content-Type': 'application/x-ndjson',
            'Cache-Control': 'no-cache',
            'Transfer-Encoding': 'chunked'
          }
        });
      }
      
      return new Response('Not found', { status: 404 });
    },
  });
  
  console.log(`\n✅ Server running at http://localhost:${server.port}`);
  console.log('📊 Loading timeline data in background...');
  
  // Open browser to HTTP URL instead of file
  const timelineUrl = `http://localhost:${server.port}`;
  
  if (!isBackground) {
    // Interactive mode - open browser and show Ctrl+C message
    try {
      await $`open ${timelineUrl}`.quiet();
      console.log(`🌐 Opening browser at ${timelineUrl}...`);
    } catch {
      console.log(`💡 Open ${timelineUrl} in your browser to view the timeline`);
    }
    console.log('\nPress Ctrl+C to stop the server');
  } else {
    // Background mode - just log that server is ready
    console.log(`📡 Server ready at ${timelineUrl}`);
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
    // Parse flags
    let port = 8888;
    let isBackground = false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--background') {
        isBackground = true;
      } else if (args[i].startsWith('--port=')) {
        port = parseInt(args[i].split('=')[1]);
      }
    }
    await viewCommand(port, isBackground);
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
