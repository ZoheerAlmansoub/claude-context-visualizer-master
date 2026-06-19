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

export type AnalyzeType =
  | "summarize"
  | "intent-map"
  | "experience-extract"
  | "session-review"
  | "token-audit"
  | "loop-diagnosis"
  | "tool-hardening"
  | "artifact-blueprint"
  | "memory-file-drafts"
  | "agent-orchestration"
  | "agentic-lessons"
  | "project-health-report"
  | "user-ai-fluency"
  | "user-growth-plan"
  | "memory-diff"
  | "rule-dedup"
  | "compaction-recovery"
  | "mcp-tool-audit"
  | "project-synthesis";

export type AnalysisCategory =
  | "overview"
  | "context"
  | "loops"
  | "artifacts"
  | "learning"
  | "governance";

export type ArtifactKind = "skill" | "rule" | "tool-hint" | "hook" | "subagent";

export type TokenWasteItem = {
  source: string;
  description: string;
  estimatedImpact: "low" | "medium" | "high";
  recommendation: string;
  turns?: number[];
};

export type MemoryFileDraft = {
  path: string;
  purpose: string;
  action: "create" | "update" | "append";
  rationale: string;
  content: string;
};

export type SubAgentSpec = {
  name: string;
  role: string;
  whenToUse: string;
  contextBudget: string;
  handoffPoints: string;
  tools: string[];
  confidence: "high" | "medium" | "low";
};

export type GeneratedArtifact = {
  kind: ArtifactKind;
  name: string;
  description: string;
  trigger: string;
  content: string;
  rendered?: string;
  sourceTurns: number[];
  confidence: "high" | "medium" | "low";
};

export type RootCauseItem = {
  id: string;
  category: string;
  title: string;
  impact: "critical" | "high" | "medium" | "low";
  description: string;
  sessionIds: string[];
  estimatedTokenWaste?: number;
  fixPriority: number;
  recommendation: string;
};

export type FluencyDimension = {
  id: string;
  label: string;
  score: number;
  evidence: string;
  examples: Array<{ turn: number; quote: string }>;
};

export type GrowthArea = {
  area: string;
  whyItMatters: string;
  concreteActions: string[];
  suggestedRule?: string;
  suggestedSkill?: string;
  practiceExercise?: string;
};

export type MemoryDiffItem = {
  path: string;
  action: "create" | "update" | "append" | "skip";
  existingSummary: string;
  proposedSummary: string;
  diffPreview: string;
  rationale: string;
};

export type RuleDedupItem = {
  name: string;
  proposedPath: string;
  existingPath?: string;
  action: "create" | "merge" | "replace" | "skip";
  rationale: string;
  content: string;
};

export type CompactionRecoveryItem = {
  priority: "critical" | "high" | "medium";
  action: string;
  rationale: string;
  suggestedMemoryPath?: string;
  suggestedContent?: string;
};

export type McpToolFinding = {
  toolName: string;
  callCount: number;
  errorCount: number;
  severity: "critical" | "high" | "medium" | "low";
  pattern: string;
  recommendation: string;
  turns: number[];
};

export type StructuredAnalysis =
  | { kind: "token-audit"; wasteItems: TokenWasteItem[]; summary: string }
  | { kind: "prevention-rules"; rules: GeneratedArtifact[]; summary: string }
  | { kind: "artifacts"; items: GeneratedArtifact[]; summary: string }
  | { kind: "memory-files"; files: MemoryFileDraft[]; summary: string }
  | {
      kind: "orchestration";
      agents: SubAgentSpec[];
      summary: string;
      whenSwarm: string;
    }
  | { kind: "project-health"; healthScore: number; rootCauses: RootCauseItem[]; summary: string; openRisks: string[] }
  | {
      kind: "user-fluency";
      overallScore: number;
      dimensions: FluencyDimension[];
      strengths: string[];
      growthAreas: GrowthArea[];
      summary: string;
    }
  | {
      kind: "user-growth";
      overallScore: number;
      weeklyPlan: Array<{ day: string; focus: string; task: string }>;
      growthAreas: GrowthArea[];
      summary: string;
    }
  | { kind: "memory-diff"; items: MemoryDiffItem[]; summary: string }
  | { kind: "rule-dedup"; items: RuleDedupItem[]; summary: string }
  | {
      kind: "compaction-recovery";
      recoveryItems: CompactionRecoveryItem[];
      summary: string;
      boundaryTurn?: number;
    }
  | { kind: "mcp-tool-audit"; findings: McpToolFinding[]; summary: string }
  | {
      kind: "project-synthesis";
      themes: Array<{ id: string; title: string; sessions: string[]; summary: string; status: string }>;
      decisions: Array<{ decision: string; rationale: string; sessionIds: string[] }>;
      memoryGaps: Array<{ path: string; gap: string; suggestedAction: string }>;
      driftWarnings: string[];
      summary: string;
    };

export type AnalysisSource = "llm" | "heuristic" | "hybrid";

export type AnalyzeResult = {
  analysisId: string;
  type: AnalyzeType;
  markdown: string;
  structured?: StructuredAnalysis;
  analysisSource?: AnalysisSource;
  llmUnavailable?: "timeout";
  parseWarning?: string;
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
  tokensUsed?: number;
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

export type LlmProviderKind =
  | "anthropic"
  | "openai"
  | "openrouter"
  | "opencode-zen"
  | "groq"
  | "deepseek"
  | "ollama"
  | "nvidia";

export type GovernancePipelineMode = "quick" | "standard" | "full";

export type GovernancePipelineStatus = "running" | "complete" | "cancelled" | "error";

export type GovernancePipelineResult = {
  pipelineId: string;
  scope: "session" | "project";
  mode?: GovernancePipelineMode;
  status?: GovernancePipelineStatus;
  cancelled?: boolean;
  steps: Array<{
    type: AnalyzeType;
    status: "pending" | "running" | "done" | "error" | "skipped";
    analysisId?: string;
    error?: string;
  }>;
  playbookMarkdown?: string;
  projectRoot?: string;
  applyResults?: Array<{ path: string; ok: boolean; error?: string }>;
};

export type ProjectContextSummary = {
  projectRoot: string;
  verified: boolean;
  source: string;
  warning?: string;
  inventoryHash: string;
  files: Array<{ relativePath: string; sizeBytes: number; hash: string; truncated: boolean }>;
};

export type ProjectContextResponse = {
  projectRoot: string;
  verified: boolean;
  source: string;
  warning?: string;
  inventoryHash: string;
  files: Array<{
    relativePath: string;
    sizeBytes: number;
    hash: string;
    truncated: boolean;
    content: string;
  }>;
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
  analysisTypes: Array<{
    id: AnalyzeType;
    label: string;
    description: string;
    category?: AnalysisCategory;
  }>;
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
    body: {
      type: AnalyzeType;
      provider?: LlmProviderKind;
      model?: string;
      locale?: "ar" | "en";
      force?: boolean;
    },
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
  writeArtifact: (
    path: string,
    content: string,
    opts?: { projectRoot?: string; action?: "create" | "update" | "append" },
  ) =>
    post<{ ok: boolean; path: string; merged?: boolean }>("/api/artifacts/write", {
      path,
      content,
      ...opts,
    }),
  applyArtifactPack: (
    items: Array<{
      path: string;
      content: string;
      action?: "create" | "update" | "append";
      selected?: boolean;
    }>,
    projectRoot?: string,
  ) =>
    post<{ results: Array<{ path: string; ok: boolean; error?: string }> }>(
      "/api/artifacts/apply-pack",
      { items, projectRoot },
    ),
  projectContext: (agent: AgentKind, project: string, cwd?: string) =>
    get<ProjectContextResponse>(
      `/api/projects/${encodeURIComponent(project)}/context?agent=${encodeURIComponent(agent)}${cwd ? `&cwd=${encodeURIComponent(cwd)}` : ""}`,
    ),
  projectContextSummary: (agent: AgentKind, project: string, cwd?: string) =>
    get<ProjectContextSummary>(
      `/api/projects/${encodeURIComponent(project)}/context/summary?agent=${encodeURIComponent(agent)}${cwd ? `&cwd=${encodeURIComponent(cwd)}` : ""}`,
    ),
  projectDashboard: (agent: AgentKind, project: string, cwd?: string) =>
    get<{
      context: ProjectContextSummary;
      patterns: RecurringPattern[];
      sessions: Array<{ id: string; title: string; mtimeMs: number; realTotal: number | null; hasCompaction: boolean }>;
      schedule: { lastRunAt: string | null; lastSessionCount: number; minNewSessions: number };
      eligibility: { eligible: boolean; newSessions: number; reason: string };
    }>(
      `/api/projects/${encodeURIComponent(project)}/dashboard?agent=${encodeURIComponent(agent)}${cwd ? `&cwd=${encodeURIComponent(cwd)}` : ""}`,
    ),
  governEligible: (agent: AgentKind, project: string) =>
    get<{ eligible: boolean; newSessions: number; reason: string; sessionCount: number }>(
      `/api/projects/${encodeURIComponent(project)}/govern/eligible?agent=${encodeURIComponent(agent)}`,
    ),
  getGovernancePipeline: (pipelineId: string) =>
    get<GovernancePipelineResult>(`/api/governance/${encodeURIComponent(pipelineId)}`),
  cancelGovernancePipeline: (pipelineId: string) =>
    post<GovernancePipelineResult>(`/api/governance/${encodeURIComponent(pipelineId)}/cancel`, {}),
  resumeGovernancePipeline: (pipelineId: string) =>
    post<GovernancePipelineResult>(`/api/governance/${encodeURIComponent(pipelineId)}/resume`, {}),
  governSession: (
    agent: AgentKind,
    sessionId: string,
    body?: {
      provider?: LlmProviderKind;
      model?: string;
      locale?: "ar" | "en";
      force?: boolean;
      mode?: GovernancePipelineMode;
      autoApply?: boolean;
    },
  ) =>
    post<GovernancePipelineResult>(
      `/api/sessions/${encodeURIComponent(sessionId)}/govern?agent=${encodeURIComponent(agent)}`,
      body ?? {},
    ),
  governProject: (
    agent: AgentKind,
    project: string,
    body?: {
      provider?: LlmProviderKind;
      model?: string;
      locale?: "ar" | "en";
      force?: boolean;
      mode?: GovernancePipelineMode;
      autoApply?: boolean;
    },
  ) =>
    post<GovernancePipelineResult>(
      `/api/projects/${encodeURIComponent(project)}/govern?agent=${encodeURIComponent(agent)}`,
      body ?? {},
    ),
  fetchPlaybook: (agent: AgentKind, project: string, opts?: { save?: boolean; refresh?: boolean }) =>
    fetch(
      `/api/projects/${encodeURIComponent(project)}/playbook?agent=${encodeURIComponent(agent)}&save=${opts?.save ? "true" : "false"}&refresh=${opts?.refresh ? "true" : "false"}`,
    ).then(async (r) => {
      if (!r.ok) throw new Error(await r.text());
      return r.text();
    }),
};

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}
