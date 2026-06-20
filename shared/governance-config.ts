import type { AnalyzeType, GovernancePipelineMode } from "./analyze-types.ts";

export const SESSION_PIPELINES: Record<GovernancePipelineMode, AnalyzeType[]> = {
  quick: ["token-audit", "loop-diagnosis"],
  standard: ["token-audit", "loop-diagnosis", "tool-hardening", "memory-file-drafts"],
  full: [
    "token-audit",
    "loop-diagnosis",
    "tool-hardening",
    "memory-file-drafts",
    "artifact-blueprint",
    "agent-orchestration",
    "user-ai-fluency",
    "compaction-recovery",
    "mcp-tool-audit",
  ],
};

export const PROJECT_PIPELINES: Record<GovernancePipelineMode, AnalyzeType[]> = {
  quick: ["project-health-report"],
  standard: ["project-health-report", "user-growth-plan"],
  full: ["project-health-report", "user-growth-plan", "project-synthesis", "rule-dedup", "memory-diff"],
};

export const SESSION_WIZARD_STEPS: AnalyzeType[] = [
  "token-audit",
  "loop-diagnosis",
  "tool-hardening",
  "memory-file-drafts",
  "artifact-blueprint",
  "agentic-lessons",
];

/** Analysis types included in executive summary markdown (priority order). */
export const SUMMARY_STEP_TYPES: AnalyzeType[] = [
  "project-synthesis",
  "project-health-report",
  "user-growth-plan",
  "token-audit",
  "loop-diagnosis",
  "tool-hardening",
  "mcp-tool-audit",
  "memory-file-drafts",
  "artifact-blueprint",
  "agent-orchestration",
  "user-ai-fluency",
  "compaction-recovery",
  "memory-diff",
  "rule-dedup",
  "agentic-lessons",
];

export const AUTO_APPLY_ANALYSIS_TYPES: AnalyzeType[] = [
  "memory-file-drafts",
  "loop-diagnosis",
  "tool-hardening",
  "artifact-blueprint",
  "agent-orchestration",
  "memory-diff",
  "rule-dedup",
  "compaction-recovery",
];

export const AUTO_APPLY_ANALYSIS_TYPE_SET = new Set<AnalyzeType>(AUTO_APPLY_ANALYSIS_TYPES);

export const PROJECT_PIPELINE_MAX_SESSIONS = 8;

export function pipelineStepTypes(
  scope: "session" | "project",
  mode: GovernancePipelineMode,
): AnalyzeType[] {
  return scope === "session" ? SESSION_PIPELINES[mode] : PROJECT_PIPELINES[mode];
}

export function projectAnalysisSessionId(projectSlug: string): string {
  return `project:${projectSlug}`;
}
