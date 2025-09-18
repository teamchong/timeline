import { $ } from 'bun';

export async function isGitRepo(): Promise<boolean> {
  try {
    await $`git rev-parse --git-dir`.quiet();
    return true;
  } catch {
    return false;
  }
}

export async function getCurrentBranch(): Promise<string> {
  const result = await $`git rev-parse --abbrev-ref HEAD`.text();
  return result.trim();
}

export async function getAllTimelines(branch: string): Promise<string[]> {
  const pattern = `refs/heads/timelines/${branch}/+*`;
  const result = await $`git for-each-ref --format="%(refname:short)" ${pattern}`.text();
  return result.trim().split('\n').filter(Boolean);
}

export async function getTimelineInfo(branch: string): Promise<{
  hash: string;
  shortHash: string;
  time: string;
  date: string;
  message: string;
}> {
  const hash = await $`git rev-parse ${branch}`.text();
  const shortHash = await $`git rev-parse --short ${branch}`.text();
  const time = await $`git log -1 --pretty="%ar" ${branch}`.text();
  const date = await $`git log -1 --pretty="%aI" ${branch}`.text();
  const message = await $`git log -1 --pretty="%s" ${branch}`.text();
  
  return {
    hash: hash.trim(),
    shortHash: shortHash.trim(),
    time: time.trim(),
    date: date.trim(),
    message: message.trim(),
  };
}

export async function getTimelineMetadata(timeline: string): Promise<{
  hash: string;
  sessionId?: string;
  projectPath?: string;
}> {
  const hash = await $`git rev-parse ${timeline}`.text();
  const hashTrim = hash.trim();
  
  try {
    const metadata = await $`git notes --ref=timeline-metadata show ${hashTrim}`.quiet().text();
    const parsed = JSON.parse(metadata.trim());
    return {
      hash: hashTrim,
      sessionId: parsed.sessionId,
      projectPath: parsed.projectPath,
    };
  } catch {
    return { hash: hashTrim };
  }
}

export async function getTimelineDetails(branch: string, baseInfo: any): Promise<any> {
  // Get stats
  const stats = await $`git diff --stat HEAD ${branch}`.text();
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