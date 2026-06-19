export type AgentKind = "claude" | "pi" | "cursor" | "opencode";

export type MessageRole = "user" | "assistant" | "tool";

export type TranscriptMessage = {
  id: string;
  turn: number;
  role: MessageRole;
  text: string;
  tokens?: number;
  timestamp?: string;
  isError?: boolean;
  toolName?: string;
  toolInput?: string;
};

export type ToolEvent = {
  id: string;
  turn: number;
  toolName: string;
  toolInput: string;
  resultText: string;
  isError: boolean;
  tokens?: number;
};

export type UserMessageBundle = {
  messages: TranscriptMessage[];
  aggregatedText: string;
  totalChars: number;
  totalTokens: number;
};

export type UserMessageStats = {
  /** User messages included in the current view (after filters). */
  visibleCount: number;
  /** Total user messages in the session transcript window. */
  totalCount: number;
  postCompactionOnly: boolean;
};

export type SessionTranscript = {
  agent: AgentKind;
  sessionId: string;
  filePath: string;
  userMessages: UserMessageBundle;
  userMessageStats: UserMessageStats;
  conversation: TranscriptMessage[];
  toolEvents: ToolEvent[];
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

export type LlmProviderKind =
  | "anthropic"
  | "openai"
  | "openrouter"
  | "opencode-zen"
  | "groq"
  | "deepseek"
  | "ollama"
  | "nvidia";

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

export type ProjectTheme = {
  id: string;
  title: string;
  sessions: string[];
  summary: string;
  status: "active" | "resolved" | "blocked";
};

export type ProjectDecision = {
  decision: string;
  rationale: string;
  sessionIds: string[];
};

export type MemoryGap = {
  path: string;
  gap: string;
  suggestedAction: string;
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
      themes: ProjectTheme[];
      decisions: ProjectDecision[];
      memoryGaps: MemoryGap[];
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
  /** Set when LLM could not run (e.g. gateway timeout) but heuristic data was returned */
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

export type RecurringPattern = {
  id: string;
  kind: string;
  label: string;
  description: string;
  count: number;
  sessionIds: string[];
  estimatedTokenWaste?: number;
  recommendation: string;
  suggestedArtifact?: GeneratedArtifact;
};

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

export type ProjectContextSummary = {
  projectRoot: string;
  verified: boolean;
  source: string;
  warning?: string;
  inventoryHash: string;
  files: Array<{ relativePath: string; sizeBytes: number; hash: string; truncated: boolean }>;
};

export type GovernancePipelineMode = "quick" | "standard" | "full";

export type GovernancePipelineStatus = "running" | "complete" | "cancelled" | "error";

export type GovernancePipelineStep = {
  type: AnalyzeType;
  status: "pending" | "running" | "done" | "error" | "skipped";
  analysisId?: string;
  error?: string;
};

export type GovernancePipelineResult = {
  pipelineId: string;
  scope: "session" | "project";
  mode?: GovernancePipelineMode;
  status?: GovernancePipelineStatus;
  cancelled?: boolean;
  steps: GovernancePipelineStep[];
  playbookMarkdown?: string;
  projectRoot?: string;
  updatedAt?: string;
  agent?: AgentKind;
  sessionId?: string;
  projectSlug?: string;
  provider?: LlmProviderKind;
  model?: string;
  locale?: "ar" | "en";
  autoApply?: boolean;
  applyResults?: Array<{ path: string; ok: boolean; error?: string }>;
};

export type ProjectInfo = {
  agent: AgentKind;
  slug: string;
  path: string;
  sessionCount: number;
  latestMtimeMs: number;
  unavailableReason?: string;
};

export type Headline = {
  realTotal: number;
  modelCap: number;
  model: string;
  inputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
};

export type LeafItem = {
  tokens: number;
  turn: number;
  summary: string;
  fullContent: string;
  // For tool calls / tool results: the (pretty-printed) tool input that was
  // sent to the model. Omitted for non-tool items (messages, thinking, …).
  toolInput?: string;
};

// Bump when the snapshot shape changes so stale on-disk caches are ignored.
export const SNAPSHOT_SCHEMA_VERSION = 2;

export type SubBucket = {
  id: string;
  name: string;
  tokens: number;
  items: LeafItem[];
};

export type Bucket = {
  id: string;
  name: string;
  tokens: number;
  children: SubBucket[];
};

export type CompactionInfo = {
  boundaryCount: number;
  latestBoundaryAt: number;
  preTokens: number;
  postTokens: number;
  trigger: string;
};

export type Snapshot = {
  schemaVersion: number;
  agent: AgentKind;
  sessionId: string;
  filePath: string;
  mtimeMs: number;
  headline: Headline;
  buckets: Bucket[];
  compaction: CompactionInfo | null;
  warnings: string[];
};
