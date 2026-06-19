import type { AnalysisCategory, AnalyzeType, LlmConfig } from "./api";

export const ANALYSIS_TYPE_CATEGORY: Record<AnalyzeType, AnalysisCategory> = {
  summarize: "overview",
  "intent-map": "overview",
  "experience-extract": "overview",
  "session-review": "overview",
  "token-audit": "context",
  "loop-diagnosis": "loops",
  "tool-hardening": "loops",
  "artifact-blueprint": "artifacts",
  "memory-file-drafts": "artifacts",
  "agent-orchestration": "artifacts",
  "agentic-lessons": "learning",
};

/** Canonical list — always shown in the UI (merged with server metadata when available). */
export const FALLBACK_ANALYSIS_TYPES: LlmConfig["analysisTypes"] = [
  { id: "summarize", label: "Summarize", description: "Goals, decisions, and key outcomes", category: "overview" },
  { id: "intent-map", label: "Intent map", description: "User intents and first principles", category: "overview" },
  { id: "experience-extract", label: "Experience extract", description: "Preferences, patterns, and anti-patterns", category: "overview" },
  { id: "session-review", label: "Session review", description: "What worked, failures, recommendations", category: "overview" },
  { id: "token-audit", label: "Token audit", description: "Top context waste sources and savings opportunities", category: "context" },
  { id: "loop-diagnosis", label: "Loop diagnosis", description: "Root cause of retry loops and prevention rules", category: "loops" },
  { id: "tool-hardening", label: "Tool hardening", description: "Per-tool error patterns and pre-check rules", category: "loops" },
  { id: "artifact-blueprint", label: "Artifact blueprint", description: "Skills, rules, hooks, and sub-agent specs", category: "artifacts" },
  { id: "memory-file-drafts", label: "Memory file drafts", description: "Drafts for AGENTS.md, agent.md, claude.md, design.md", category: "artifacts" },
  { id: "agent-orchestration", label: "Agent orchestration", description: "Sub-agents, swarms, and delegation design", category: "artifacts" },
  { id: "agentic-lessons", label: "Agentic lessons", description: "Principles and patterns for agentic engineering", category: "learning" },
];

export const EXPECTED_ANALYSIS_TYPE_COUNT = FALLBACK_ANALYSIS_TYPES.length;

/**
 * Merge server types over the canonical list so new types always appear in the UI
 * even when the API server has not been restarted yet.
 */
export function normalizeAnalysisTypes(
  types: Array<{
    id: AnalyzeType;
    label: string;
    description: string;
    category?: AnalysisCategory;
  }>,
): LlmConfig["analysisTypes"] {
  const fromServer = new Map(types.map((t) => [t.id, t]));

  const merged = FALLBACK_ANALYSIS_TYPES.map((fallback) => {
    const server = fromServer.get(fallback.id);
    return {
      id: fallback.id,
      label: server?.label ?? fallback.label,
      description: server?.description ?? fallback.description,
      category:
        server?.category ??
        fallback.category ??
        ANALYSIS_TYPE_CATEGORY[fallback.id] ??
        "overview",
    };
  });

  // Include any future server-only types not in our canonical list
  for (const t of types) {
    if (!merged.some((m) => m.id === t.id)) {
      merged.push({
        ...t,
        category: t.category ?? ANALYSIS_TYPE_CATEGORY[t.id] ?? "overview",
      });
    }
  }

  return merged;
}

export function isStaleAnalysisTypesResponse(serverCount: number): boolean {
  return serverCount > 0 && serverCount < EXPECTED_ANALYSIS_TYPE_COUNT;
}

export function groupAnalysisTypes(
  types: LlmConfig["analysisTypes"],
  categoryOrder: AnalysisCategory[],
): Array<{ category: AnalysisCategory; types: LlmConfig["analysisTypes"] }> {
  return categoryOrder
    .map((category) => ({
      category,
      types: types.filter((t) => t.category === category),
    }))
    .filter((g) => g.types.length > 0);
}
