import type { AnalyzeType } from "../types.ts";
import type { GovernancePipelineMode } from "../types.ts";

export const SESSION_PIPELINES: Record<GovernancePipelineMode, AnalyzeType[]> = {
  quick: ["token-audit", "loop-diagnosis"],
  standard: ["token-audit", "loop-diagnosis", "tool-hardening", "memory-file-drafts"],
  full: [
    "token-audit",
    "loop-diagnosis",
    "tool-hardening",
    "memory-file-drafts",
    "artifact-blueprint",
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
