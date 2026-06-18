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

export type AnalyzeType = "summarize" | "intent-map" | "experience-extract" | "session-review";

export type LlmProviderKind = "anthropic" | "openai" | "ollama" | "nvidia";

export type AnalyzeResult = {
  analysisId: string;
  type: AnalyzeType;
  markdown: string;
  structured?: unknown;
  tokensUsed?: number;
  cached: boolean;
  provider: LlmProviderKind;
  model: string;
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
