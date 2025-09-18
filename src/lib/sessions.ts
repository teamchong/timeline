import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { $ } from 'bun';

interface Timeline {
  branch: string;
  hash: string;
  shortHash: string;
  time: string;
  date: string;
  message: string;
  sessionId?: string;
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
  projects: ProjectTimelines[];
  fileCount: number;
}

export async function getSessionFiles(projectPath: string): Promise<Map<string, number>> {
  const sessionFiles = new Map<string, number>();
  const claudeProjectPath = join(process.env.HOME!, '.claude', 'projects');
  
  if (!existsSync(claudeProjectPath)) {
    return sessionFiles;
  }
  
  // Find project-specific sessions
  const projectHash = projectPath.replace(/\//g, '-');
  const projectDir = join(claudeProjectPath, projectHash);
  
  if (existsSync(projectDir)) {
    const files = await $`ls -1 ${projectDir}/*.jsonl 2>/dev/null || true`.text();
    files.trim().split('\n').filter(Boolean).forEach((file, index) => {
      const sessionId = basename(file).replace('.jsonl', '');
      sessionFiles.set(sessionId, index + 1);
    });
  }
  
  return sessionFiles;
}

export async function readSessionFile(sessionPath: string): Promise<{
  created: string;
  modified: string;
  fileCount: number;
}> {
  try {
    const content = await Bun.file(sessionPath).text();
    const lines = content.trim().split('\n');
    
    let created = 'Unknown';
    let modified = 'Unknown';
    
    // Find first line with timestamp
    for (const line of lines) {
      try {
        const json = JSON.parse(line);
        if (json.timestamp) {
          created = json.timestamp;
          break;
        }
      } catch {
        continue;
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
        continue;
      }
    }
    
    return { created, modified, fileCount: 1 };
  } catch (error) {
    console.error(`Error reading session file ${sessionPath}:`, error);
    return { created: 'Unknown', modified: 'Unknown', fileCount: 0 };
  }
}

export async function processSessionsParallel(
  sessionIds: string[],
  timelineCache: Map<string, { hash: string; sessionId?: string; projectPath?: string }>
): Promise<Session[]> {
  console.log(`\n📊 Processing ${sessionIds.length} sessions in parallel...`);

  // Use the provided timeline cache (already built)
  const timelinesFound = Array.from(timelineCache.entries()).filter(([_, meta]) => meta.sessionId);
  console.log(`✅ Using cached ${timelinesFound.length} timelines`);

  const sessionPromises = sessionIds.map(async (sessionId, index) => {
    const projectHash = process.cwd().replace(/\//g, '-');
    const sessionPath = join(process.env.HOME!, '.claude', 'projects', projectHash, `${sessionId}.jsonl`);
    
    const sessionInfo = await readSessionFile(sessionPath);
    
    // Get timelines for this session from cache
    const sessionTimelines = timelinesFound
      .filter(([_, meta]) => meta.sessionId === sessionId)
      .map(([branch, meta]) => {
        const timelineName = branch.split('/').pop() || '';
        
        return {
          branch,
          hash: meta.hash,
          shortHash: meta.hash.substring(0, 7),
          time: 'Loading...',
          date: new Date().toISOString(),
          message: 'Loading...',
          sessionId,
        };
      });

    // Group by project
    const projectMap = new Map<string, Timeline[]>();
    
    sessionTimelines.forEach(timeline => {
      const projectPath = timelineCache.get(timeline.branch)?.projectPath || process.cwd();
      if (!projectMap.has(projectPath)) {
        projectMap.set(projectPath, []);
      }
      projectMap.get(projectPath)!.push(timeline);
    });
    
    const projects: ProjectTimelines[] = Array.from(projectMap.entries()).map(([path, timelines]) => ({
      projectPath: path,
      projectName: basename(path),
      timelines,
    }));

    return {
      id: sessionId,
      index: index + 1,
      created: sessionInfo.created,
      modified: sessionInfo.modified,
      timelines: sessionTimelines,
      projects,
      fileCount: sessionInfo.fileCount,
    };
  });

  return Promise.all(sessionPromises);
}