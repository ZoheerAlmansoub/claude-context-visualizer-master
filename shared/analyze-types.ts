/** Shared analysis / governance types (no Node deps — safe for web + server). */

export type AgentKind = "claude" | "pi" | "cursor" | "opencode";

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

export type GovernancePipelineMode = "quick" | "standard" | "full";

export type ArtifactKind = "skill" | "rule" | "tool-hint" | "hook" | "subagent";
