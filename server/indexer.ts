import { readdir, stat, open } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import {
  decodeProjectSlugForAgent,
  getAgentConfig,
} from "./paths.ts";
import { streamJSONL } from "./jsonl.ts";
import type { AgentKind, SessionListItem, ProjectInfo } from "./types.ts";
import { realTotalFromUsage } from "./usage.ts";
import { extractTitle } from "./text-utils.ts";
import { listOpenCodeProjects, listOpenCodeSessions, findOpenCodeSessionById, parseOpenCodeSessionPath } from "./opencode-loader.ts";

const IO_CONCURRENCY = 16;

// Map an async fn over items with bounded concurrency, preserving input order.
// Bounded so listing a project with hundreds of sessions doesn't open hundreds
// of file handles at once.
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Pull a human-readable title from the first user message.
function titleFromRaw(raw: string): string {
  return extractTitle(raw);
}

async function firstCwdQuick(filePath: string): Promise<string | null> {
  try {
    const fh = await open(filePath, "r");
    try {
      const buf = Buffer.alloc(32 * 1024);
      const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
      const text = buf.toString("utf8", 0, bytesRead);
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try {
          const rec = JSON.parse(line);
          if (typeof rec?.cwd === "string") return rec.cwd;
          if (rec?.type === "session" && typeof rec?.cwd === "string") return rec.cwd;
        } catch {}
      }
    } finally {
      await fh.close();
    }
  } catch {}
  return null;
}

async function listCursorSessionFiles(projectDir: string): Promise<string[]> {
  const transcriptsDir = join(projectDir, "agent-transcripts");
  let entries;
  try {
    entries = await readdir(transcriptsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const candidate = join(transcriptsDir, e.name, `${e.name}.jsonl`);
    try {
      await stat(candidate);
      files.push(candidate);
    } catch {}
  }
  return files;
}

export async function listProjects(agent: AgentKind = "claude"): Promise<ProjectInfo[]> {
  if (agent === "opencode") return listOpenCodeProjects();

  const sessionsDir = getAgentConfig(agent).sessionsDir;
  const entries = await readdir(sessionsDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());

  if (agent === "cursor") {
    const projects = await mapLimit(dirs, IO_CONCURRENCY, async (e): Promise<ProjectInfo | null> => {
      const dirPath = join(sessionsDir, e.name);
      const sessionFiles = await listCursorSessionFiles(dirPath);
      if (sessionFiles.length === 0) return null;
      const mtimes = await Promise.all(
        sessionFiles.map(async (f) => {
          try {
            return (await stat(f)).mtimeMs;
          } catch {
            return 0;
          }
        }),
      );
      const latest = Math.max(...mtimes, 0);
      return {
        agent,
        slug: e.name,
        path: decodeProjectSlugForAgent(agent, e.name),
        sessionCount: sessionFiles.length,
        latestMtimeMs: latest,
      };
    });
    return projects
      .filter((p): p is ProjectInfo => p !== null)
      .sort((a, b) => b.latestMtimeMs - a.latestMtimeMs);
  }

  const projects = await mapLimit(dirs, IO_CONCURRENCY, async (e): Promise<ProjectInfo | null> => {
    const dirPath = join(sessionsDir, e.name);
    let files: string[];
    try {
      files = (await readdir(dirPath)).filter((f) => f.endsWith(".jsonl"));
    } catch {
      return null;
    }
    if (files.length === 0) return null;
    const mtimes = await Promise.all(
      files.map(async (f) => {
        try {
          return (await stat(join(dirPath, f))).mtimeMs;
        } catch {
          return 0;
        }
      }),
    );
    let latest = 0;
    let latestFile = "";
    files.forEach((f, i) => {
      if (mtimes[i]! > latest) {
        latest = mtimes[i]!;
        latestFile = f;
      }
    });
    const cwd = latestFile ? await firstCwdQuick(join(dirPath, latestFile)) : null;
    return {
      agent,
      slug: e.name,
      path: cwd ?? decodeProjectSlugForAgent(agent, e.name),
      sessionCount: files.length,
      latestMtimeMs: latest,
    };
  });
  return projects
    .filter((p): p is ProjectInfo => p !== null)
    .sort((a, b) => b.latestMtimeMs - a.latestMtimeMs);
}

// Lightweight per-file metadata extraction. Reads enough to:
// - get first user text (title)
// - get last assistant usage (real total + model)
// - detect compaction
// Avoids tokenization entirely.
export async function indexSessionFile(filePath: string): Promise<{
  id: string;
  title: string;
  realTotal: number | null;
  model: string | null;
  hasCompaction: boolean;
  inputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  cwd: string | null;
}> {
  const id = basename(filePath, ".jsonl");
  let title = "";
  let realTotal: number | null = null;
  let model: string | null = null;
  let inputTokens = 0;
  let cacheCreationTokens = 0;
  let cacheReadTokens = 0;
  let outputTokens = 0;
  let hasCompaction = false;
  let latestUsageOrder = -1;
  let cwd: string | null = null;

  await streamJSONL(filePath, (rec, idx) => {
    if (!cwd && typeof rec?.cwd === "string") cwd = rec.cwd;
    if (!cwd && rec?.type === "session" && typeof rec?.cwd === "string") cwd = rec.cwd;
    if (rec?.type === "system" && rec?.subtype === "compact_boundary") {
      hasCompaction = true;
    }
    if (rec?.type === "compaction") {
      hasCompaction = true;
    }
    const role = rec?.message?.role;
    const isClaudeUser = rec?.type === "user";
    const isPiUser = rec?.type === "message" && role === "user";
    const isCursorUser = rec?.role === "user";
    if (!title && (isClaudeUser || isPiUser || isCursorUser) && rec?.message?.content) {
      const c = rec.message.content;
      let raw = "";
      if (typeof c === "string") {
        raw = c;
      } else if (Array.isArray(c)) {
        for (const block of c) {
          if (block?.type === "text" && typeof block.text === "string") {
            raw = block.text;
            break;
          }
        }
      }
      title = titleFromRaw(raw);
    }
    const isClaudeAssistant = rec?.type === "assistant";
    const isPiAssistant = rec?.type === "message" && role === "assistant";
    const isCursorAssistant = rec?.role === "assistant";
    if ((isClaudeAssistant || isPiAssistant || isCursorAssistant) && rec?.message?.usage && idx > latestUsageOrder) {
      const u = rec.message.usage;
      const it = u.input_tokens ?? u.input ?? 0;
      const cc = u.cache_creation_input_tokens ?? u.cacheWrite ?? 0;
      const cr = u.cache_read_input_tokens ?? u.cacheRead ?? 0;
      const ot = u.output_tokens ?? u.output ?? 0;
      const total = realTotalFromUsage(u);
      if (total > 0) {
        latestUsageOrder = idx;
        realTotal = total;
        inputTokens = it;
        cacheCreationTokens = cc;
        cacheReadTokens = cr;
        outputTokens = ot;
        model = rec.message.model ?? null;
      }
    }
  });

  if (!title) title = "(no user message)";
  return {
    id,
    title,
    realTotal,
    model,
    hasCompaction,
    inputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    outputTokens,
    cwd,
  };
}

export async function listSessions(projectSlug: string, agent: AgentKind = "claude"): Promise<SessionListItem[]> {
  if (agent === "opencode") return listOpenCodeSessions(projectSlug);

  if (agent === "cursor") {
    const projectDir = join(getAgentConfig(agent).sessionsDir, projectSlug);
    const sessionFiles = await listCursorSessionFiles(projectDir);
    const items = await mapLimit(sessionFiles, IO_CONCURRENCY, async (filePath): Promise<SessionListItem | null> => {
      let st;
      try {
        st = await stat(filePath);
      } catch {
        return null;
      }
      const id = basename(filePath, ".jsonl");
      try {
        const meta = await indexSessionFile(filePath);
        return {
          agent,
          id: meta.id,
          project: projectSlug,
          projectPath: meta.cwd ?? decodeProjectSlugForAgent(agent, projectSlug),
          filePath,
          mtimeMs: st.mtimeMs,
          title: meta.title,
          realTotal: meta.realTotal,
          model: meta.model,
          hasCompaction: meta.hasCompaction,
        };
      } catch {
        return {
          agent,
          id,
          project: projectSlug,
          projectPath: meta.cwd ?? decodeProjectSlugForAgent(agent, projectSlug),
          filePath,
          mtimeMs: st.mtimeMs,
          title: "(failed to read)",
          realTotal: null,
          model: null,
          hasCompaction: false,
        };
      }
    });
    return items
      .filter((x): x is SessionListItem => x !== null)
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  }

  const dirPath = join(getAgentConfig(agent).sessionsDir, projectSlug);
  const entries = (await readdir(dirPath)).filter((f) => f.endsWith(".jsonl"));
  // Index each session file concurrently (bounded) rather than one-at-a-time —
  // this is the dominant latency when opening a project with many sessions.
  const items = await mapLimit(entries, IO_CONCURRENCY, async (f): Promise<SessionListItem | null> => {
    const filePath = join(dirPath, f);
    let st;
    try {
      st = await stat(filePath);
    } catch {
      return null;
    }
    try {
      const meta = await indexSessionFile(filePath);
      return {
        agent,
        id: meta.id,
        project: projectSlug,
        projectPath: meta.cwd ?? decodeProjectSlugForAgent(agent, projectSlug),
        filePath,
        mtimeMs: st.mtimeMs,
        title: meta.title,
        realTotal: meta.realTotal,
        model: meta.model,
        hasCompaction: meta.hasCompaction,
      };
    } catch {
      return {
        agent,
        id: basename(f, ".jsonl"),
        project: projectSlug,
        projectPath: decodeProjectSlugForAgent(agent, projectSlug),
        filePath,
        mtimeMs: st.mtimeMs,
        title: "(failed to read)",
        realTotal: null,
        model: null,
        hasCompaction: false,
      };
    }
  });
  return items
    .filter((x): x is SessionListItem => x !== null)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export async function findSessionById(sessionId: string, agent: AgentKind = "claude"): Promise<string | null> {
  if (agent === "opencode") return findOpenCodeSessionById(sessionId);

  const sessionsDir = getAgentConfig(agent).sessionsDir;

  if (agent === "cursor") {
    const projects = await readdir(sessionsDir, { withFileTypes: true });
    for (const p of projects) {
      if (!p.isDirectory()) continue;
      const candidate = join(sessionsDir, p.name, "agent-transcripts", sessionId, `${sessionId}.jsonl`);
      try {
        await stat(candidate);
        return candidate;
      } catch {}
    }
    return null;
  }

  const projects = await readdir(sessionsDir, { withFileTypes: true });
  for (const p of projects) {
    if (!p.isDirectory()) continue;
    const candidate = join(sessionsDir, p.name, `${sessionId}.jsonl`);
    try {
      await stat(candidate);
      return candidate;
    } catch {}
  }
  return null;
}

export async function findSessionMeta(
  sessionId: string,
  agent: AgentKind = "claude",
): Promise<SessionListItem | null> {
  const filePath = await findSessionById(sessionId, agent);
  if (!filePath) return null;

  let projectSlug = "";
  if (agent === "opencode") {
    projectSlug = parseOpenCodeSessionPath(filePath)?.projectId ?? "";
  } else if (agent === "cursor") {
    const parts = filePath.split(/[/\\]/);
    const idx = parts.indexOf("agent-transcripts");
    projectSlug = idx > 0 ? parts[idx - 1]! : "";
  } else {
    projectSlug = basename(dirname(filePath));
  }

  if (!projectSlug) return null;

  const sessions = await listSessions(projectSlug, agent);
  return sessions.find((s) => s.id === sessionId) ?? null;
}
