import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CACHE_DIR } from "../paths.ts";
import type { AgentKind, RecurringPattern } from "../types.ts";
import { listSessions } from "../indexer.ts";
import { computeTranscript } from "../transcript.ts";
import { detectSessionPatterns, mergePatterns } from "./pattern-detector.ts";

function insightsCachePath(agent: AgentKind, project: string): string {
  return join(CACHE_DIR, "insights", agent, `${project}.json`);
}

export async function getProjectInsights(
  agent: AgentKind,
  project: string,
  opts: { refresh?: boolean; limit?: number; scanLimit?: number } = {},
): Promise<RecurringPattern[]> {
  const cachePath = insightsCachePath(agent, project);
  if (!opts.refresh) {
    try {
      const cached = JSON.parse(await readFile(cachePath, "utf8")) as RecurringPattern[];
      return cached.slice(0, opts.limit ?? 20);
    } catch {}
  }

  const sessions = await listSessions(project, agent);
  let patterns: RecurringPattern[] = [];
  const scanLimit = Math.min(sessions.length, opts.scanLimit ?? 50);

  for (const session of sessions.slice(0, scanLimit)) {
    try {
      const transcript = await computeTranscript(session.filePath, agent, session.id);
      patterns = mergePatterns(patterns, detectSessionPatterns(transcript));
    } catch {}
  }

  await mkdir(join(CACHE_DIR, "insights", agent), { recursive: true });
  await writeFile(cachePath, JSON.stringify(patterns, null, 2), "utf8");
  return patterns.slice(0, opts.limit ?? 20);
}
