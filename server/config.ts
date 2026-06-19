import { homedir } from "node:os";
import { join } from "node:path";
import type { AnalysisCategory, AnalyzeType } from "./types.ts";
import {
  getLlmConfigLegacy,
  getPublicLlmConfigFromStore,
  resolveModelForProvider,
} from "./llm-config-store.ts";

export type LlmConfig = ReturnType<typeof getLlmConfigLegacy>;

export function getLlmConfig(): LlmConfig {
  return getLlmConfigLegacy();
}

export function getPublicLlmConfig() {
  return getPublicLlmConfigFromStore();
}

export { resolveModelForProvider };

export const ANALYSIS_TYPE_CATEGORIES: Record<
  AnalysisCategory,
  { label: string; labelAr: string }
> = {
  overview: { label: "Overview", labelAr: "نظرة عامة" },
  context: { label: "Context & tokens", labelAr: "السياق والتوكنز" },
  loops: { label: "Loops & tools", labelAr: "الحلقات والأدوات" },
  artifacts: { label: "Artifacts & memory", labelAr: "Artifacts والذاكرة" },
  learning: { label: "Learning", labelAr: "التعلّم" },
  governance: { label: "Governance", labelAr: "الحوكمة" },
};

export const ANALYSIS_TYPES: Array<{
  id: AnalyzeType;
  label: string;
  description: string;
  category: AnalysisCategory;
}> = [
  {
    id: "summarize",
    label: "Summarize",
    description: "Goals, decisions, and key outcomes",
    category: "overview",
  },
  {
    id: "intent-map",
    label: "Intent map",
    description: "User intents and first principles",
    category: "overview",
  },
  {
    id: "experience-extract",
    label: "Experience extract",
    description: "Preferences, patterns, and anti-patterns",
    category: "overview",
  },
  {
    id: "session-review",
    label: "Session review",
    description: "What worked, failures, recommendations",
    category: "overview",
  },
  {
    id: "token-audit",
    label: "Token audit",
    description: "Top context waste sources and savings opportunities",
    category: "context",
  },
  {
    id: "loop-diagnosis",
    label: "Loop diagnosis",
    description: "Root cause of retry loops and prevention rules",
    category: "loops",
  },
  {
    id: "tool-hardening",
    label: "Tool hardening",
    description: "Per-tool error patterns and pre-check rules",
    category: "loops",
  },
  {
    id: "artifact-blueprint",
    label: "Artifact blueprint",
    description: "Skills, rules, hooks, and sub-agent specs",
    category: "artifacts",
  },
  {
    id: "memory-file-drafts",
    label: "Memory file drafts",
    description: "Persistent context files: AGENTS.md, CLAUDE.md, design.md (not .cursor/rules)",
    category: "artifacts",
  },
  {
    id: "agent-orchestration",
    label: "Agent orchestration",
    description: "Sub-agents, swarms, and delegation design",
    category: "artifacts",
  },
  {
    id: "agentic-lessons",
    label: "Agentic lessons",
    description: "Principles and patterns for agentic engineering",
    category: "learning",
  },
  {
    id: "project-health-report",
    label: "Project health report",
    description: "Cross-session root causes, health score, and risks",
    category: "governance",
  },
  {
    id: "user-ai-fluency",
    label: "User AI fluency",
    description: "Assess how effectively the user directs AI agents",
    category: "governance",
  },
  {
    id: "user-growth-plan",
    label: "User growth plan",
    description: "Cross-session plan to improve AI collaboration skills",
    category: "governance",
  },
  {
    id: "memory-diff",
    label: "Memory diff",
    description: "Compare proposed memory updates against files on disk",
    category: "governance",
  },
  {
    id: "rule-dedup",
    label: "Rule deduplication",
    description: "Merge or skip rules that duplicate existing project rules",
    category: "governance",
  },
  {
    id: "compaction-recovery",
    label: "Compaction recovery",
    description: "Recover context lost after compaction and prevent repeat loss",
    category: "context",
  },
  {
    id: "mcp-tool-audit",
    label: "MCP tool audit",
    description: "Audit MCP tool usage: errors, redundancy, and hardening",
    category: "loops",
  },
  {
    id: "project-synthesis",
    label: "Project synthesis",
    description: "Cross-session themes, decisions, memory gaps, and drift",
    category: "governance",
  },
];

export function defaultSkillDir(): string {
  return join(homedir(), ".cursor", "skills");
}

export function defaultRuleDir(cwd?: string): string {
  if (cwd) return join(cwd, ".cursor", "rules");
  return join(homedir(), ".cursor", "rules");
}
