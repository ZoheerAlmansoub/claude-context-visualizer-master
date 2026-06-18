export type AgentKind = "claude" | "pi" | "cursor" | "opencode";

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

export type TranscriptMessage = {
  id: string;
  turn: number;
  role: "user" | "assistant" | "tool";
  text: string;
  tokens?: number;
  timestamp?: string;
  isError?: boolean;
  toolName?: string;
};

export type SessionTranscript = {
  agent: AgentKind;
  sessionId: string;
  filePath: string;
  userMessages: {
    messages: TranscriptMessage[];
    aggregatedText: string;
    totalChars: number;
    totalTokens: number;
  };
  userMessageStats: {
    visibleCount: number;
    totalCount: number;
    postCompactionOnly: boolean;
  };
  conversation: TranscriptMessage[];
  toolEvents: unknown[];
  compactionBoundaryIndex: number | null;
  warnings: string[];
};

export type AnalyzeType = "summarize" | "intent-map" | "experience-extract" | "session-review";
export type LlmProviderKind = "anthropic" | "openai" | "ollama" | "nvidia";

export type AnalyzeResult = {
  analysisId: string;
  type: AnalyzeType;
  markdown: string;
  tokensUsed?: number;
  cached: boolean;
  provider: LlmProviderKind;
  model: string;
  locale?: "ar" | "en";
  createdAt?: string;
};

export type AnalysisIndexEntry = {
  analysisId: string;
  type: AnalyzeType;
  provider: LlmProviderKind;
  model: string;
  locale: "ar" | "en";
  createdAt: string;
  preview: string;
  cached: true;
};

export type PromptImprovementResult = {
  improvementId: string;
  messageId: string;
  turn: number;
  originalText: string;
  improvedPrompt: string;
  rationale: string;
  tips: string[];
  issues: string[];
  markdown: string;
  tokensUsed?: number;
  cached: boolean;
  provider: LlmProviderKind;
  model: string;
  locale: "ar" | "en";
  createdAt: string;
};

export type GeneratedArtifact = {
  kind: "skill" | "rule" | "tool-hint";
  name: string;
  description: string;
  trigger: string;
  content: string;
  rendered: string;
  sourceTurns: number[];
  confidence: "high" | "medium" | "low";
};

export type RecurringPattern = {
  id: string;
  kind: string;
  label: string;
  description: string;
  count: number;
  sessionIds: string[];
  estimatedTokenWaste?: number;
  recommendation: string;
};

export type LlmConfig = {
  defaultProvider: LlmProviderKind;
  defaultModel: string;
  providers: Array<{
    id: LlmProviderKind;
    label: string;
    configured: boolean;
    defaultModel: string;
  }>;
  analysisTypes: Array<{ id: AnalyzeType; label: string; description: string }>;
};

export type LlmProviderSettingsView = {
  id: LlmProviderKind;
  label: string;
  configured: boolean;
  defaultModel: string;
  apiKeyMasked: string | null;
  hasApiKey: boolean;
  baseUrl?: string;
  apiUrl?: string;
  textModel?: string;
  visionModel?: string;
};

export type LlmSettingsView = {
  defaultProvider: LlmProviderKind;
  defaultModel: string;
  storagePath: string;
  liveReload: boolean;
  providers: LlmProviderSettingsView[];
};

export type LlmTestResult = {
  ok: boolean;
  provider: LlmProviderKind;
  model: string;
  latencyMs: number;
  message: string;
  preview?: string;
  error?: string;
};

export const UNCHANGED_KEY_SENTINEL = "__UNCHANGED__";

async function put<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`${r.status}: ${err}`);
  }
  return r.json();
}

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`${r.status}: ${err}`);
  }
  return r.json();
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`${r.status}: ${err}`);
  }
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
  transcript: (agent: AgentKind, sessionId: string, postCompactionOnly = false) =>
    get<SessionTranscript>(
      `/api/sessions/${encodeURIComponent(sessionId)}/transcript?agent=${encodeURIComponent(agent)}&postCompactionOnly=${postCompactionOnly}`,
    ),
  llmConfig: () => get<LlmConfig>("/api/config/llm"),
  llmSettings: () => get<LlmSettingsView>("/api/config/llm/settings"),
  saveLlmSettings: (patch: Record<string, string | LlmProviderKind>) =>
    put<{ ok: boolean; settings: LlmSettingsView; public: Omit<LlmConfig, "analysisTypes"> }>(
      "/api/config/llm/settings",
      patch,
    ),
  testLlmConnection: (
    provider: LlmProviderKind,
    overrides?: { apiKey?: string; baseUrl?: string; apiUrl?: string; model?: string },
  ) => post<LlmTestResult>("/api/config/llm/test", { provider, ...overrides }),
  analyze: (
    agent: AgentKind,
    sessionId: string,
    body: { type: AnalyzeType; provider?: LlmProviderKind; model?: string; locale?: "ar" | "en" },
  ) =>
    post<AnalyzeResult>(
      `/api/sessions/${encodeURIComponent(sessionId)}/analyze?agent=${encodeURIComponent(agent)}`,
      body,
    ),
  listAnalyses: (agent: AgentKind, sessionId: string) =>
    get<{ analyses: AnalysisIndexEntry[] }>(
      `/api/sessions/${encodeURIComponent(sessionId)}/analyses?agent=${encodeURIComponent(agent)}`,
    ),
  getAnalysis: (agent: AgentKind, sessionId: string, analysisId: string) =>
    get<AnalyzeResult>(
      `/api/sessions/${encodeURIComponent(sessionId)}/analyses/${encodeURIComponent(analysisId)}?agent=${encodeURIComponent(agent)}`,
    ),
  listPromptImprovements: (agent: AgentKind, sessionId: string) =>
    get<{ improvements: PromptImprovementResult[] }>(
      `/api/sessions/${encodeURIComponent(sessionId)}/prompt-improvements?agent=${encodeURIComponent(agent)}`,
    ),
  improvePrompt: (
    agent: AgentKind,
    sessionId: string,
    messageId: string,
    body?: { provider?: LlmProviderKind; model?: string; locale?: "ar" | "en"; force?: boolean },
  ) =>
    post<PromptImprovementResult>(
      `/api/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}/improve-prompt?agent=${encodeURIComponent(agent)}`,
      body ?? {},
    ),
  generateArtifacts: (
    agent: AgentKind,
    sessionId: string,
    body?: { useLlm?: boolean; provider?: LlmProviderKind; locale?: "ar" | "en" },
  ) =>
    post<{ artifacts: GeneratedArtifact[] }>(
      `/api/sessions/${encodeURIComponent(sessionId)}/generate-artifacts?agent=${encodeURIComponent(agent)}`,
      body ?? {},
    ),
  sessionInsights: (agent: AgentKind, sessionId: string) =>
    get<{ patterns: RecurringPattern[] }>(
      `/api/sessions/${encodeURIComponent(sessionId)}/insights?agent=${encodeURIComponent(agent)}`,
    ),
  projectInsights: (agent: AgentKind, project: string, refresh = false) =>
    get<{ patterns: RecurringPattern[] }>(
      `/api/insights/recurring?agent=${encodeURIComponent(agent)}&project=${encodeURIComponent(project)}&refresh=${refresh}`,
    ),
  writeArtifact: (path: string, content: string) =>
    post<{ ok: boolean; path: string }>("/api/artifacts/write", { path, content }),
};

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}
