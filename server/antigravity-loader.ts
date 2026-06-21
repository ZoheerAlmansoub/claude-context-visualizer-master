import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { getAgentConfig, encodeWorkspaceSlug, decodeProjectSlugForAgent } from "./paths.ts";
import { readAllJSONL, streamJSONL } from "./jsonl.ts";
import type { AgentKind, ProjectInfo, SessionListItem } from "./types.ts";
import { extractTitle } from "./text-utils.ts";
import { resolveSessionRealTotal } from "./session-real-total.ts";

export type AntigravityLoadResult =
  | { ok: true; records: unknown[] }
  | { ok: false; reason: string };

export const ANTIGRAVITY_UNASSIGNED_SLUG = "_unassigned";

const TRANSCRIPT_CANDIDATES = ["transcript_full.jsonl", "transcript.jsonl"] as const;

export type AntigravitySessionRef = {
  sessionId: string;
  filePath: string;
  projectSlug: string;
  projectPath: string;
  mtimeMs: number;
  source: "brain" | "ide-cli";
};

export function getAntigravityIdeCliProjectsDir(): string {
  return join(homedir(), ".antigravity-ide-cli", "projects");
}

export function listAntigravityBrainRoots(): string[] {
  const candidates = [
    join(homedir(), ".gemini", "antigravity-ide", "brain"),
    join(homedir(), ".gemini", "antigravity-cli", "brain"),
    join(homedir(), ".antigravity", "brain"),
    join(homedir(), ".antigravity"),
    join(homedir(), "Library", "Application Support", "Antigravity", "brain"),
    join(homedir(), "Library", "Application Support", "Antigravity"),
  ];
  if (process.env.APPDATA) {
    candidates.push(join(process.env.APPDATA, "Antigravity", "brain"));
    candidates.push(join(process.env.APPDATA, "Antigravity"));
  }
  return [...new Set(candidates)];
}

export function isAntigravityIdeCliSessionPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return (
    normalized.includes("/.antigravity-ide-cli/projects/") && normalized.endsWith(".jsonl")
  );
}

export function isAntigravityBrainSessionPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return (
    normalized.includes("/brain/") &&
    normalized.includes("/.system_generated/logs/") &&
    normalized.endsWith(".jsonl")
  );
}

export function isAntigravitySessionPath(filePath: string): boolean {
  return isAntigravityBrainSessionPath(filePath) || isAntigravityIdeCliSessionPath(filePath);
}

export function parseAntigravitySessionPath(filePath: string): {
  sessionId: string;
  projectSlug: string;
  source: "brain" | "ide-cli";
} | null {
  if (isAntigravityIdeCliSessionPath(filePath)) {
    const sessionId = basename(filePath, ".jsonl");
    const projectSlug = basename(dirname(filePath));
    return { sessionId, projectSlug, source: "ide-cli" };
  }
  if (!isAntigravityBrainSessionPath(filePath)) return null;
  const parts = filePath.replace(/\\/g, "/").split("/");
  const brainIdx = parts.lastIndexOf("brain");
  if (brainIdx < 0 || brainIdx + 1 >= parts.length) return null;
  const sessionId = parts[brainIdx + 1]!;
  return { sessionId, projectSlug: ANTIGRAVITY_UNASSIGNED_SLUG, source: "brain" };
}

export async function resolveTranscriptPath(conversationDir: string): Promise<string | null> {
  const logsDir = join(conversationDir, ".system_generated", "logs");
  for (const name of TRANSCRIPT_CANDIDATES) {
    const candidate = join(logsDir, name);
    try {
      await stat(candidate);
      return candidate;
    } catch {}
  }
  return null;
}

function unwrapQuotedPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let s = value.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  s = s.replace(/\\\\/g, "\\");
  return s.trim() || null;
}

function normalizeFsPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "");
}

function inferProjectRootFromFilePath(filePath: string): string | null {
  const normalized = normalizeFsPath(filePath);
  const parts = normalized.split("/");
  if (parts.length < 2) return null;
  const driveMatch = normalized.match(/^([a-zA-Z]):\//);
  if (driveMatch && parts.length >= 3) {
    return `${driveMatch[1]!.toUpperCase()}:/${parts.slice(1, 3).join("/")}`;
  }
  if (parts[0] === "" && parts.length >= 3) {
    return `/${parts.slice(1, 3).join("/")}`;
  }
  return dirname(normalized).replace(/\\/g, "/");
}

const ACTIVE_DOC_RE = /Active Document:\s*([^\n(]+)/i;

export function extractWorkspaceFromRecords(records: unknown[]): string | null {
  for (const rec of records) {
    const r = rec as Record<string, unknown>;
    if (r?.type !== "USER_INPUT" || typeof r.content !== "string") continue;
    const match = r.content.match(ACTIVE_DOC_RE);
    if (match?.[1]) {
      const activeDoc = match[1].trim();
      const root = inferProjectRootFromFilePath(activeDoc);
      if (root) return root;
    }
  }

  const paths: string[] = [];
  for (const rec of records) {
    const r = rec as Record<string, unknown>;
    if (r?.type === "PLANNER_RESPONSE" && Array.isArray(r.tool_calls)) {
      for (const tc of r.tool_calls) {
        const args = (tc as Record<string, unknown>)?.args as Record<string, unknown> | undefined;
        if (!args) continue;
        for (const key of ["AbsolutePath", "DirectoryPath", "SearchPath", "TargetFile", "Cwd"]) {
          const p = unwrapQuotedPath(args[key]);
          if (p && !p.includes(".gemini/antigravity")) paths.push(normalizeFsPath(p));
        }
      }
    }
  }

  if (paths.length === 0) return null;

  const splitPaths = paths.map((p) => p.split("/"));
  const minLen = Math.min(...splitPaths.map((p) => p.length));
  const common: string[] = [];
  for (let i = 0; i < minLen; i++) {
    const seg = splitPaths[0]![i];
    if (splitPaths.every((p) => p[i] === seg)) common.push(seg!);
    else break;
  }
  if (common.length >= 2) {
    if (/^[a-zA-Z]:$/.test(common[0]!)) {
      return `${common[0]!.toUpperCase()}/${common.slice(1).join("/")}`.replace(/\//g, "/");
    }
    return common.join("/");
  }

  return inferProjectRootFromFilePath(paths[0]!);
}

function projectSlugForWorkspace(workspace: string | null): { slug: string; path: string } {
  if (!workspace) {
    return { slug: ANTIGRAVITY_UNASSIGNED_SLUG, path: ANTIGRAVITY_UNASSIGNED_SLUG };
  }
  return { slug: encodeWorkspaceSlug(workspace), path: workspace };
}

async function listSubdirs(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function discoverTranscriptsInTree(root: string, maxDepth = 8): Promise<Array<{ sessionId: string; filePath: string }>> {
  const found: Array<{ sessionId: string; filePath: string }> = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === ".system_generated") {
          const logsDir = join(full, "logs");
          for (const name of TRANSCRIPT_CANDIDATES) {
            const candidate = join(logsDir, name);
            try {
              await stat(candidate);
              const sessionId = basename(dirname(dirname(dirname(candidate))));
              found.push({ sessionId, filePath: candidate });
              break;
            } catch {}
          }
          continue;
        }
        await walk(full, depth + 1);
      }
    }
  }
  await walk(root, 0);
  return found;
}

async function discoverBrainSessions(brainRoot: string): Promise<AntigravitySessionRef[]> {
  const sessions: AntigravitySessionRef[] = [];
  const convIds = await listSubdirs(brainRoot);
  for (const sessionId of convIds) {
    const conversationDir = join(brainRoot, sessionId);
    const filePath = await resolveTranscriptPath(conversationDir);
    if (!filePath) continue;
    let mtimeMs = 0;
    try {
      mtimeMs = (await stat(filePath)).mtimeMs;
    } catch {
      continue;
    }
    sessions.push({
      sessionId,
      filePath,
      projectSlug: ANTIGRAVITY_UNASSIGNED_SLUG,
      projectPath: ANTIGRAVITY_UNASSIGNED_SLUG,
      mtimeMs,
      source: "brain",
    });
  }
  if (sessions.length > 0) return sessions;

  // Fallback: non-canonical layout under this root (e.g. ~/.antigravity without brain/)
  const transcripts = await discoverTranscriptsInTree(brainRoot);
  for (const { sessionId, filePath } of transcripts) {
    let mtimeMs = 0;
    try {
      mtimeMs = (await stat(filePath)).mtimeMs;
    } catch {
      continue;
    }
    sessions.push({
      sessionId,
      filePath,
      projectSlug: ANTIGRAVITY_UNASSIGNED_SLUG,
      projectPath: ANTIGRAVITY_UNASSIGNED_SLUG,
      mtimeMs,
      source: "brain",
    });
  }
  return sessions;
}

async function discoverIdeCliSessions(projectsDir: string): Promise<AntigravitySessionRef[]> {
  const sessions: AntigravitySessionRef[] = [];
  const slugs = await listSubdirs(projectsDir);
  for (const projectSlug of slugs) {
    const dirPath = join(projectsDir, projectSlug);
    let files: string[];
    try {
      files = (await readdir(dirPath)).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }
    for (const f of files) {
      const filePath = join(dirPath, f);
      const sessionId = basename(f, ".jsonl");
      let mtimeMs = 0;
      try {
        mtimeMs = (await stat(filePath)).mtimeMs;
      } catch {
        continue;
      }
      sessions.push({
        sessionId,
        filePath,
        projectSlug,
        projectPath: decodeProjectSlugForAgent("antigravity", projectSlug),
        mtimeMs,
        source: "ide-cli",
      });
    }
  }
  return sessions;
}

async function enrichBrainSessionProjects(sessions: AntigravitySessionRef[]): Promise<void> {
  const brainSessions = sessions.filter((s) => s.source === "brain");
  await Promise.all(
    brainSessions.map(async (session) => {
      try {
        const records = await readAllJSONL(session.filePath);
        const workspace = extractWorkspaceFromRecords(records);
        const { slug, path } = projectSlugForWorkspace(workspace);
        session.projectSlug = slug;
        session.projectPath = path;
      } catch {
        // keep unassigned
      }
    }),
  );
}

let cachedSessionIndex: AntigravitySessionRef[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000;

async function getAllAntigravitySessions(force = false): Promise<AntigravitySessionRef[]> {
  const now = Date.now();
  if (!force && cachedSessionIndex && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedSessionIndex;
  }

  const byId = new Map<string, AntigravitySessionRef>();

  for (const brainRoot of listAntigravityBrainRoots()) {
    try {
      await stat(brainRoot);
    } catch {
      continue;
    }
    const found = await discoverBrainSessions(brainRoot);
    for (const s of found) {
      const prev = byId.get(s.sessionId);
      if (!prev || s.mtimeMs > prev.mtimeMs) byId.set(s.sessionId, s);
    }
  }

  const ideCliDir = getAntigravityIdeCliProjectsDir();
  try {
    await stat(ideCliDir);
    const cliSessions = await discoverIdeCliSessions(ideCliDir);
    for (const s of cliSessions) {
      const prev = byId.get(s.sessionId);
      if (!prev || s.mtimeMs > prev.mtimeMs) byId.set(s.sessionId, s);
    }
  } catch {}

  const sessions = [...byId.values()];
  await enrichBrainSessionProjects(sessions);

  cachedSessionIndex = sessions;
  cacheTimestamp = now;
  return sessions;
}

export function isAntigravityBrainStepFormat(records: unknown[]): boolean {
  return records.some((r) => (r as Record<string, unknown>)?.type === "USER_INPUT");
}

export async function loadAntigravityRecords(filePath: string): Promise<AntigravityLoadResult> {
  try {
    await stat(filePath);
  } catch {
    return { ok: false, reason: `Antigravity session not found: ${filePath}` };
  }
  try {
    const records = await readAllJSONL(filePath);
    if (records.length === 0) {
      return { ok: false, reason: "Antigravity transcript is empty." };
    }
    return { ok: true, records };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Failed to read Antigravity transcript." };
  }
}

export async function indexAntigravitySession(filePath: string): Promise<{
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
  projectSlug: string;
  projectPath: string;
}> {
  const parsed = parseAntigravitySessionPath(filePath);
  const id = parsed?.sessionId ?? basename(filePath, ".jsonl");
  let title = "";
  let model: string | null = null;
  let hasCompaction = false;
  let projectSlug = parsed?.projectSlug ?? ANTIGRAVITY_UNASSIGNED_SLUG;
  let projectPath = parsed?.source === "ide-cli" ? parsed.projectSlug : ANTIGRAVITY_UNASSIGNED_SLUG;
  let cwd: string | null = null;

  await streamJSONL(filePath, (rec) => {
    if (rec?.type === "CONVERSATION_HISTORY" || rec?.type === "CHECKPOINT") hasCompaction = true;
    if (rec?.type === "USER_INPUT" && typeof rec.content === "string" && !title) {
      title = extractTitle(rec.content);
      if (!cwd) {
        const workspace = extractWorkspaceFromRecords([rec]);
        if (workspace) {
          cwd = workspace;
          const mapped = projectSlugForWorkspace(workspace);
          projectSlug = mapped.slug;
          projectPath = mapped.path;
        }
      }
    }
    if (rec?.type === "USER_INPUT" && typeof rec.content === "string") {
      const settingsMatch = rec.content.match(/Model Selection` from None to ([^\n.]+)/i);
      if (settingsMatch?.[1]) model = settingsMatch[1].trim();
    }
  });

  return {
    id,
    title: title || "(no user message)",
    realTotal: null,
    model,
    hasCompaction,
    inputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    outputTokens: 0,
    cwd,
    projectSlug,
    projectPath,
  };
}

export async function listAntigravityProjects(): Promise<ProjectInfo[]> {
  const sessions = await getAllAntigravitySessions();
  const bySlug = new Map<
    string,
    { path: string; sessionCount: number; latestMtimeMs: number }
  >();

  for (const s of sessions) {
    const prev = bySlug.get(s.projectSlug);
    if (!prev) {
      bySlug.set(s.projectSlug, {
        path: s.projectPath,
        sessionCount: 1,
        latestMtimeMs: s.mtimeMs,
      });
    } else {
      prev.sessionCount++;
      prev.latestMtimeMs = Math.max(prev.latestMtimeMs, s.mtimeMs);
    }
  }

  return [...bySlug.entries()]
    .map(([slug, info]) => ({
      agent: "antigravity" as AgentKind,
      slug,
      path: info.path,
      sessionCount: info.sessionCount,
      latestMtimeMs: info.latestMtimeMs,
    }))
    .sort((a, b) => b.latestMtimeMs - a.latestMtimeMs);
}

export async function listAntigravitySessions(projectSlug: string): Promise<SessionListItem[]> {
  const sessions = await getAllAntigravitySessions();
  const filtered = sessions.filter((s) => s.projectSlug === projectSlug);

  const buildItem = async (s: AntigravitySessionRef): Promise<SessionListItem> => {
    try {
      const meta = await indexAntigravitySession(s.filePath);
      const realTotal = await resolveSessionRealTotal({
        agent: "antigravity",
        sessionId: meta.id,
        filePath: s.filePath,
        mtimeMs: s.mtimeMs,
        usageRealTotal: meta.realTotal,
      });
      return {
        agent: "antigravity",
        id: meta.id,
        project: projectSlug,
        projectPath: meta.projectPath || meta.cwd || s.projectPath,
        filePath: s.filePath,
        mtimeMs: s.mtimeMs,
        title: meta.title,
        realTotal,
        model: meta.model,
        hasCompaction: meta.hasCompaction,
      };
    } catch {
      return {
        agent: "antigravity",
        id: s.sessionId,
        project: projectSlug,
        projectPath: s.projectPath,
        filePath: s.filePath,
        mtimeMs: s.mtimeMs,
        title: "(failed to read)",
        realTotal: null,
        model: null,
        hasCompaction: false,
      };
    }
  };

  const items: SessionListItem[] = [];
  for (let i = 0; i < filtered.length; i += 2) {
    const batch = await Promise.all(filtered.slice(i, i + 2).map(buildItem));
    items.push(...batch);
  }

  return items.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export async function findAntigravitySessionById(sessionId: string): Promise<string | null> {
  const sessions = await getAllAntigravitySessions();
  const match = sessions.find((s) => s.sessionId === sessionId);
  return match?.filePath ?? null;
}

export async function resolveAntigravitySessionSourceMtimeMs(filePath: string): Promise<number> {
  return (await stat(filePath)).mtimeMs;
}

export function getAntigravityBrainDir(): string {
  return getAgentConfig("antigravity").sessionsDir;
}

/** Clear in-memory session index (for tests). */
export function resetAntigravitySessionCache(): void {
  cachedSessionIndex = null;
  cacheTimestamp = 0;
}
