export type AgentKind = "claude" | "pi" | "opencode";

export type SessionListItem = {
  agent: AgentKind;
  id: string;
  project: string;
  projectPath: string;
  filePath: string;
  mtimeMs: number;
  title: string;
  realTotal: number | null;
  model: string | null;
  hasCompaction: boolean;
};

export type ProjectInfo = {
  agent: AgentKind;
  slug: string;
  path: string;
  sessionCount: number;
  latestMtimeMs: number;
  unavailableReason?: string;
};

export type LeafItem = {
  tokens: number;
  turn: number;
  summary: string;
  fullContent: string;
  toolInput?: string;
};
export type SubBucket = { id: string; name: string; tokens: number; items: LeafItem[] };
export type Bucket = { id: string; name: string; tokens: number; children: SubBucket[] };
export type Headline = {
  realTotal: number;
  modelCap: number;
  model: string;
  inputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
};
export type CompactionInfo = {
  boundaryCount: number;
  latestBoundaryAt: number;
  preTokens: number;
  postTokens: number;
  trigger: string;
};
export type Snapshot = {
  schemaVersion?: number;
  agent: AgentKind;
  sessionId: string;
  filePath: string;
  mtimeMs: number;
  headline: Headline;
  buckets: Bucket[];
  compaction: CompactionInfo | null;
  warnings: string[];
  fromCache?: boolean;
};

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function post<T>(url: string): Promise<T> {
  const r = await fetch(url, { method: "POST" });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

export const api = {
  projects: (agent: AgentKind) => get<ProjectInfo[]>(`/api/projects?agent=${encodeURIComponent(agent)}`),
  sessions: (agent: AgentKind, project: string) =>
    get<SessionListItem[]>(
      `/api/sessions?agent=${encodeURIComponent(agent)}&project=${encodeURIComponent(project)}`,
    ),
  snapshot: (agent: AgentKind, sessionId: string) =>
    get<Snapshot>(`/api/sessions/${encodeURIComponent(sessionId)}/snapshot?agent=${encodeURIComponent(agent)}`),
  invalidate: (agent: AgentKind, sessionId: string) =>
    post<{ ok: boolean }>(
      `/api/sessions/${encodeURIComponent(sessionId)}/invalidate-cache?agent=${encodeURIComponent(agent)}`,
    ),
};
