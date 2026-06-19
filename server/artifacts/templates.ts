import type { ArtifactKind, GeneratedArtifact, RecurringPattern } from "../types.ts";
import { normalizeArtifactForAgent } from "./agent-registry.ts";
import type { AgentKind } from "../types.ts";

type PatternTemplate = {
  kind: ArtifactKind;
  nameFrom: (p: RecurringPattern) => string;
  triggerFrom: (p: RecurringPattern) => string;
  contentFrom: (p: RecurringPattern) => string;
};

export const PATTERN_ARTIFACT_TEMPLATES: Record<string, PatternTemplate> = {
  repeated_tool_error: {
    kind: "tool-hint",
    nameFrom: (p) => {
      const tool = p.id.split(":")[1] ?? "tool";
      return `${tool}-error-hardening`;
    },
    triggerFrom: (p) => `Before calling ${p.id.split(":")[1] ?? "tool"} after a failure`,
    contentFrom: (p) =>
      `# Tool hardening: ${p.label}\n\n${p.description}\n\n## Pre-checks\n- Validate inputs and schema before retry\n- Read error output fully; change approach after 2 failures\n\n## Fix\n${p.recommendation}`,
  },
  retry_loop: {
    kind: "skill",
    nameFrom: () => "stop-retry-loop",
    triggerFrom: () => "When the same tool call fails or repeats 3+ times",
    contentFrom: (p) =>
      `# Stop retry loops\n\n${p.description}\n\n## Protocol\n1. After 2 identical failures, stop and diagnose root cause\n2. Change tool, parameters, or approach\n3. Summarize findings before next attempt\n\n${p.recommendation}`,
  },
  token_waste_read: {
    kind: "rule",
    nameFrom: () => "context-efficient-reads",
    triggerFrom: () => "Before Read/Grep/Glob on large files or broad patterns",
    contentFrom: (p) =>
      `# Context-efficient reads\n\n${p.description}\n\n- Prefer semantic search over full file dumps\n- Batch related reads; summarize before injecting\n- Skip files already in recent context\n\n${p.recommendation}`,
  },
  bash_failure_loop: {
    kind: "skill",
    nameFrom: () => "shell-debug-first",
    triggerFrom: () => "Before re-running a failed shell command",
    contentFrom: (p) =>
      `# Shell debug first\n\n${p.description}\n\n## Steps\n1. Capture exit code and stderr\n2. Verify cwd, env, and permissions\n3. Do not retry the same command more than twice\n\n${p.recommendation}`,
  },
  duplicate_user_intent: {
    kind: "rule",
    nameFrom: () => "confirm-scope-once",
    triggerFrom: () => "At the start of multi-step user requests",
    contentFrom: (p) =>
      `# Confirm scope once\n\n${p.description}\n\n- Restate understanding in 2–3 bullets before acting\n- Ask one clarifying question if scope is ambiguous\n\n${p.recommendation}`,
  },
  compaction_pressure: {
    kind: "rule",
    nameFrom: () => "pre-compaction-trim",
    triggerFrom: () => "When context usage exceeds ~70% or long sessions",
    contentFrom: (p) =>
      `# Pre-compaction trim\n\n${p.description}\n\n- Persist decisions to AGENTS.md before compaction\n- Summarize tool outputs; drop redundant reads\n\n${p.recommendation}`,
  },
};

export function suggestedArtifactFromPattern(
  pattern: RecurringPattern,
  agent: AgentKind = "cursor",
): GeneratedArtifact | undefined {
  const tpl = PATTERN_ARTIFACT_TEMPLATES[pattern.kind];
  if (!tpl) return undefined;
  const artifact: GeneratedArtifact = {
    kind: tpl.kind,
    name: tpl.nameFrom(pattern),
    description: pattern.description,
    trigger: tpl.triggerFrom(pattern),
    content: tpl.contentFrom(pattern),
    sourceTurns: [],
    confidence: pattern.count >= 4 ? "high" : pattern.count >= 2 ? "medium" : "low",
  };
  return normalizeArtifactForAgent(agent, artifact);
}

export function enrichPatternWithArtifact(pattern: RecurringPattern, agent: AgentKind = "cursor"): RecurringPattern {
  const suggested = suggestedArtifactFromPattern(pattern, agent);
  return suggested ? { ...pattern, suggestedArtifact: suggested } : pattern;
}
