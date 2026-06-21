import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { getAgentConfig } from "./paths.ts";
import type { ProjectInfo, SessionListItem, AgentKind } from "./types.ts";
import { realTotalFromUsage } from "./usage.ts";
import { extractTitle } from "./text-utils.ts";

export type OpenCodeLoadResult =
  | { ok: true; records: unknown[] }
  | { ok: false; reason: string };

/** Combined message + parts as stored on disk or SQLite (MessageV2.WithParts shape). */
export type { OpenCodeMessageBundle } from "./opencode-db.ts";
import {
  findOpenCodeSessionInDb,
  getOpenCodeProjectWorktree,
  getOpenCodeSessionCountFromDb,
  hasOpenCodeDatabase,
  isOpenCodeDbSessionPath,
  listOpenCodeProjectsFromDb,
  listOpenCodeSessionsFromDb,
  loadOpenCodeMessageBundlesFromDb,
  openCodeDbSessionPath,
  parseOpenCodeDbSessionPath,
  sessionRowMtimeMs,
  sessionRowToRealTotal,
} from "./opencode-db.ts";
import type { OpenCodeMessageBundle } from "./opencode-db.ts";
import { resolveAntigravitySessionSourceMtimeMs } from "./antigravity-loader.ts";

const SESSION_JSON = ".json";

export function getOpenCodeStorageDir(): string {
  return getAgentConfig("opencode").sessionsDir;
}

/** Session reference path: storage/session/{projectId}/{sessionId}.json */
export function openCodeSessionPath(projectId: string, sessionId: string, storageDir?: string): string {
  return join(storageDir ?? getOpenCodeStorageDir(), "session", projectId, `${sessionId}${SESSION_JSON}`);
}

export function isOpenCodeSessionPath(filePath: string): boolean {
  return isOpenCodeDbSessionPath(filePath) || isOpenCodeFileSessionPath(filePath);
}

function isOpenCodeFileSessionPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.includes("/storage/session/") && normalized.endsWith(SESSION_JSON);
}

export function parseOpenCodeSessionPath(filePath: string): { projectId: string; sessionId: string } | null {
  const dbSessionId = parseOpenCodeDbSessionPath(filePath);
  if (dbSessionId) {
    const row = findOpenCodeSessionInDb(dbSessionId);
    return { projectId: row?.project_id ?? "", sessionId: dbSessionId };
  }
  if (!isOpenCodeFileSessionPath(filePath)) return null;
  const sessionId = basename(filePath, SESSION_JSON);
  const parts = filePath.replace(/\\/g, "/").split("/");
  const sessionIdx = parts.lastIndexOf("session");
  if (sessionIdx < 0 || sessionIdx + 1 >= parts.length - 1) return null;
  return { projectId: parts[sessionIdx + 1]!, sessionId };
}

async function readJsonFile(path: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function listJsonBasenames(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && e.name.endsWith(SESSION_JSON)).map((e) => e.name);
  } catch {
    return [];
  }
}

async function listSubdirs(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

export async function hasOpenCodeMessages(storageDir?: string): Promise<boolean> {
  const root = storageDir ?? getOpenCodeStorageDir();
  try {
    const entries = await readdir(root);
    if (!entries.includes("message") || !entries.includes("part")) return false;
    const messageDir = join(root, "message");
    const partDir = join(root, "part");
    const [msgChildren, partChildren] = await Promise.all([listSubdirs(messageDir), listSubdirs(partDir)]);
    return msgChildren.length > 0 || partChildren.length > 0;
  } catch {
    return false;
  }
}

export async function hasOpenCodeSessions(storageDir?: string): Promise<boolean> {
  const root = storageDir ?? getOpenCodeStorageDir();
  const sessionDir = join(root, "session");
  const projects = await listSubdirs(sessionDir);
  for (const projectId of projects) {
    const files = await listJsonBasenames(join(sessionDir, projectId));
    if (files.length > 0) return true;
  }
  return false;
}

async function readOpenCodeProjectPath(storageDir: string, projectId: string): Promise<string | null> {
  const project = await readJsonFile(join(storageDir, "project", `${projectId}${SESSION_JSON}`));
  if (project) {
    const worktree = project.worktree ?? project.cwd ?? project.root;
    if (typeof worktree === "string" && worktree.trim()) return worktree;
  }
  return null;
}

async function loadMessageParts(storageDir: string, messageId: string): Promise<Record<string, unknown>[]> {
  const partDir = join(storageDir, "part", messageId);
  const files = await listJsonBasenames(partDir);
  const parts: Record<string, unknown>[] = [];
  for (const file of files) {
    const part = await readJsonFile(join(partDir, file));
    if (part) parts.push(part);
  }
  parts.sort((a, b) => String(a.id ?? "").localeCompare(String(b.id ?? "")));
  return parts;
}

export async function loadOpenCodeMessageBundles(
  storageDir: string,
  sessionId: string,
): Promise<OpenCodeMessageBundle[]> {
  const messageDir = join(storageDir, "message", sessionId);
  const files = await listJsonBasenames(messageDir);
  const bundles: OpenCodeMessageBundle[] = [];

  for (const file of files) {
    const info = await readJsonFile(join(messageDir, file));
    if (!info || typeof info.role !== "string") continue;
    const messageId = String(info.id ?? basename(file, SESSION_JSON));
    const parts = await loadMessageParts(storageDir, messageId);
    bundles.push({ info, parts });
  }

  bundles.sort((a, b) => {
    const ta = Number((a.info.time as Record<string, unknown> | undefined)?.created ?? 0);
    const tb = Number((b.info.time as Record<string, unknown> | undefined)?.created ?? 0);
    if (ta !== tb) return ta - tb;
    return String(a.info.id ?? "").localeCompare(String(b.info.id ?? ""));
  });

  return bundles;
}

export function resolveOpenCodeStorageDir(filePath: string): string | null {
  if (isOpenCodeDbSessionPath(filePath)) return getOpenCodeStorageDir();
  if (!isOpenCodeFileSessionPath(filePath)) return null;
  return dirname(dirname(dirname(filePath)));
}

async function loadOpenCodeRecordsFromDb(sessionId: string): Promise<OpenCodeLoadResult> {
  const bundles = loadOpenCodeMessageBundlesFromDb(sessionId);
  if (bundles.length === 0) {
    return { ok: false, reason: `OpenCode session ${sessionId} has no messages in opencode.db.` };
  }
  return { ok: true, records: bundles };
}

export async function loadOpenCodeRecords(filePath: string): Promise<OpenCodeLoadResult> {
  const parsed = parseOpenCodeSessionPath(filePath);
  if (!parsed) {
    return { ok: false, reason: "Invalid OpenCode session path." };
  }

  if (isOpenCodeDbSessionPath(filePath) || (await hasOpenCodeDatabase())) {
    const dbResult = await loadOpenCodeRecordsFromDb(parsed.sessionId);
    if (dbResult.ok) return dbResult;
    if (isOpenCodeDbSessionPath(filePath)) return dbResult;
  }

  const storageDir = resolveOpenCodeStorageDir(filePath) ?? getOpenCodeStorageDir();
  const hasMessages = await hasOpenCodeMessages(storageDir);
  if (!hasMessages) {
    if (await hasOpenCodeDatabase()) {
      return loadOpenCodeRecordsFromDb(parsed.sessionId);
    }
    return {
      ok: false,
      reason:
        "OpenCode storage has no message/part directories. Only session_diff patches are available.",
    };
  }

  try {
    await stat(filePath);
  } catch {
    return { ok: false, reason: `OpenCode session not found: ${parsed.sessionId}` };
  }

  const bundles = await loadOpenCodeMessageBundles(storageDir, parsed.sessionId);
  if (bundles.length === 0) {
    return {
      ok: false,
      reason: `OpenCode session ${parsed.sessionId} has no messages in storage/message/.`,
    };
  }

  return { ok: true, records: bundles };
}

function textFromUserBundle(bundle: OpenCodeMessageBundle): string {
  for (const p of bundle.parts) {
    if (p.type === "text" && typeof p.text === "string" && p.text.trim()) return p.text;
  }
  const summary = bundle.info.summary as Record<string, unknown> | undefined;
  if (typeof summary?.body === "string" && summary.body.trim()) return summary.body;
  if (typeof summary?.title === "string" && summary.title.trim()) return summary.title;
  return "";
}

function cwdFromBundles(bundles: OpenCodeMessageBundle[]): string | null {
  for (const b of bundles) {
    if (b.info.role !== "assistant") continue;
    const path = b.info.path as Record<string, unknown> | undefined;
    if (typeof path?.cwd === "string" && path.cwd.trim()) return path.cwd;
  }
  return null;
}

function usageFromAssistant(info: Record<string, unknown>): Record<string, unknown> | null {
  const tokens = info.tokens as Record<string, unknown> | undefined;
  if (!tokens) return null;
  const cache = tokens.cache as Record<string, number> | undefined;
  return {
    input_tokens: Number(tokens.input ?? 0),
    output_tokens: Number(tokens.output ?? 0),
    cache_read_input_tokens: Number(cache?.read ?? 0),
    cache_creation_input_tokens: Number(cache?.write ?? 0),
  };
}

export async function indexOpenCodeSession(filePath: string): Promise<{
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
  const parsed = parseOpenCodeSessionPath(filePath);
  const id = parsed?.sessionId ?? basename(filePath, SESSION_JSON);

  if (parsed && (isOpenCodeDbSessionPath(filePath) || (await hasOpenCodeDatabase()))) {
    const row = findOpenCodeSessionInDb(parsed.sessionId);
    if (row) {
      const realTotal = sessionRowToRealTotal(row);
      return {
        id: row.id,
        title: row.title?.trim() || "(no user message)",
        realTotal,
        model: row.model,
        hasCompaction: row.time_compacting != null,
        inputTokens: Number(row.tokens_input ?? 0),
        cacheCreationTokens: Number(row.tokens_cache_write ?? 0),
        cacheReadTokens: Number(row.tokens_cache_read ?? 0),
        outputTokens: Number(row.tokens_output ?? 0),
        cwd: row.directory?.trim() || getOpenCodeProjectWorktree(row.project_id) || null,
      };
    }
  }

  const loaded = await loadOpenCodeRecords(filePath);

  if (!loaded.ok) {
    return {
      id,
      title: "(no user message)",
      realTotal: null,
      model: null,
      hasCompaction: false,
      inputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      outputTokens: 0,
      cwd: null,
    };
  }

  const bundles = loaded.records as OpenCodeMessageBundle[];
  let title = "";
  let realTotal: number | null = null;
  let model: string | null = null;
  let hasCompaction = false;
  let inputTokens = 0;
  let cacheCreationTokens = 0;
  let cacheReadTokens = 0;
  let outputTokens = 0;

  for (const bundle of bundles) {
    for (const p of bundle.parts) {
      if (p.type === "compaction") hasCompaction = true;
    }
    if (!title && bundle.info.role === "user") {
      title = extractTitle(textFromUserBundle(bundle));
    }
    if (bundle.info.role === "assistant") {
      const usage = usageFromAssistant(bundle.info);
      if (usage) {
        const total = realTotalFromUsage(usage);
        if (total > 0) {
          realTotal = total;
          inputTokens = Number(usage.input_tokens ?? 0);
          cacheCreationTokens = Number(usage.cache_creation_input_tokens ?? 0);
          cacheReadTokens = Number(usage.cache_read_input_tokens ?? 0);
          outputTokens = Number(usage.output_tokens ?? 0);
        }
      }
      if (typeof bundle.info.modelID === "string") model = bundle.info.modelID;
    }
  }

  return {
    id,
    title: title || "(no user message)",
    realTotal,
    model,
    hasCompaction,
    inputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    outputTokens,
    cwd: cwdFromBundles(bundles),
  };
}

export async function listOpenCodeProjects(storageDir?: string): Promise<ProjectInfo[]> {
  if (!storageDir && (await hasOpenCodeDatabase())) {
    return listOpenCodeProjectsFromDb().map((p) => ({
      agent: "opencode" as const,
      slug: p.id,
      path: p.worktree?.trim() || p.name?.trim() || p.id,
      sessionCount: p.session_count,
      latestMtimeMs: p.latest_mtime > 1e12 ? p.latest_mtime : p.latest_mtime * 1000,
    }));
  }

  const root = storageDir ?? getOpenCodeStorageDir();
  const sessionRoot = join(root, "session");
  const projectIds = await listSubdirs(sessionRoot);
  const hasMessages = await hasOpenCodeMessages(root);

  if (projectIds.length === 0 && !hasMessages) {
    const status = await opencodeProjectStatus(root);
    return [
      {
        agent: "opencode",
        slug: "__unavailable__",
        path: "OpenCode transcripts unavailable",
        sessionCount: 0,
        latestMtimeMs: 0,
        unavailableReason: status.reason,
      },
    ];
  }

  const projects: ProjectInfo[] = [];
  for (const projectId of projectIds) {
    const dir = join(sessionRoot, projectId);
    const sessionFiles = await listJsonBasenames(dir);
    if (sessionFiles.length === 0) continue;

    const mtimes = await Promise.all(
      sessionFiles.map(async (f) => {
        try {
          return (await stat(join(dir, f))).mtimeMs;
        } catch {
          return 0;
        }
      }),
    );
    const latest = Math.max(...mtimes, 0);
    const projectPath = (await readOpenCodeProjectPath(root, projectId)) ?? projectId;

    projects.push({
      agent: "opencode",
      slug: projectId,
      path: projectPath,
      sessionCount: sessionFiles.length,
      latestMtimeMs: latest,
    });
  }

  if (projects.length === 0 && !hasMessages) {
    const status = await opencodeProjectStatus(root);
    return [
      {
        agent: "opencode",
        slug: "__unavailable__",
        path: "OpenCode transcripts unavailable",
        sessionCount: 0,
        latestMtimeMs: 0,
        unavailableReason: status.reason,
      },
    ];
  }

  return projects.sort((a, b) => b.latestMtimeMs - a.latestMtimeMs);
}

export async function listOpenCodeSessions(
  projectSlug: string,
  storageDir?: string,
): Promise<SessionListItem[]> {
  if (!storageDir && (await hasOpenCodeDatabase())) {
    const projectPath = getOpenCodeProjectWorktree(projectSlug) ?? projectSlug;
    return listOpenCodeSessionsFromDb(projectSlug).map((row) => {
      const filePath = openCodeDbSessionPath(row.id);
      return {
        agent: "opencode" as const,
        id: row.id,
        project: projectSlug,
        projectPath: row.directory?.trim() || projectPath,
        filePath,
        mtimeMs: sessionRowMtimeMs(row),
        title: row.title?.trim() || "(no title)",
        realTotal: sessionRowToRealTotal(row),
        model: row.model,
        hasCompaction: row.time_compacting != null,
      };
    });
  }

  const root = storageDir ?? getOpenCodeStorageDir();
  const sessionDir = join(root, "session", projectSlug);
  const sessionFiles = await listJsonBasenames(sessionDir);

  const items: SessionListItem[] = [];
  for (const file of sessionFiles) {
    const filePath = join(sessionDir, file);
    let st;
    try {
      st = await stat(filePath);
    } catch {
      continue;
    }
    const sessionId = basename(file, SESSION_JSON);
    try {
      const meta = await indexOpenCodeSession(filePath);
      const projectPath =
        meta.cwd ?? (await readOpenCodeProjectPath(root, projectSlug)) ?? projectSlug;
      items.push({
        agent: "opencode",
        id: meta.id,
        project: projectSlug,
        projectPath,
        filePath,
        mtimeMs: st.mtimeMs,
        title: meta.title,
        realTotal: meta.realTotal,
        model: meta.model,
        hasCompaction: meta.hasCompaction,
      });
    } catch {
      items.push({
        agent: "opencode",
        id: sessionId,
        project: projectSlug,
        projectPath: projectSlug,
        filePath,
        mtimeMs: st.mtimeMs,
        title: "(failed to read)",
        realTotal: null,
        model: null,
        hasCompaction: false,
      });
    }
  }

  return items.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export async function findOpenCodeSessionById(sessionId: string, storageDir?: string): Promise<string | null> {
  if (!storageDir && (await hasOpenCodeDatabase())) {
    const row = findOpenCodeSessionInDb(sessionId);
    if (row) return openCodeDbSessionPath(sessionId);
  }

  const root = storageDir ?? getOpenCodeStorageDir();
  const sessionRoot = join(root, "session");
  const projectIds = await listSubdirs(sessionRoot);
  for (const projectId of projectIds) {
    const candidate = openCodeSessionPath(projectId, sessionId, root);
    try {
      await stat(candidate);
      return candidate;
    } catch {}
  }
  return null;
}

export async function resolveSessionSourceMtimeMs(filePath: string, agent: AgentKind): Promise<number> {
  if (agent === "antigravity") {
    return resolveAntigravitySessionSourceMtimeMs(filePath);
  }
  if (agent === "opencode" && isOpenCodeDbSessionPath(filePath)) {
    const sessionId = parseOpenCodeDbSessionPath(filePath);
    const row = sessionId ? findOpenCodeSessionInDb(sessionId) : null;
    if (row) return sessionRowMtimeMs(row);
    throw new Error(`OpenCode session not found in database: ${sessionId ?? filePath}`);
  }
  return (await stat(filePath)).mtimeMs;
}

export async function opencodeProjectStatus(storageDir?: string): Promise<{ available: boolean; reason?: string }> {
  if (!storageDir && (await hasOpenCodeDatabase())) {
    const count = getOpenCodeSessionCountFromDb();
    if (count > 0) return { available: true };
    return { available: false, reason: "OpenCode database exists but contains no sessions." };
  }

  const root = storageDir ?? getOpenCodeStorageDir();
  const hasMessages = await hasOpenCodeMessages(root);
  if (hasMessages) {
    const hasSessions = await hasOpenCodeSessions(root);
    if (hasSessions) return { available: true };
    return {
      available: false,
      reason: "OpenCode message storage detected but no sessions indexed yet. Start a session in OpenCode.",
    };
  }
  try {
    const entries = await readdir(root);
    if (entries.includes("session_diff")) {
      if (await hasOpenCodeDatabase()) {
        const count = getOpenCodeSessionCountFromDb();
        if (count > 0) return { available: true };
      }
      return {
        available: false,
        reason:
          "OpenCode file storage has session_diff patches only. Full transcripts are read from opencode.db when present.",
      };
    }
  } catch {}
  return {
    available: false,
    reason: "OpenCode storage not found or empty. Install OpenCode and run at least one session.",
  };
}
