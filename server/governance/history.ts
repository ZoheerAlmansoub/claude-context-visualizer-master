import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { getSessionAnalysis } from "../analysis.ts";
import { CACHE_DIR } from "../paths.ts";
import type {
  AgentKind,
  AnalyzeType,
  GovernancePipelineResult,
  GovernancePipelineStep,
} from "../types.ts";

export type GovernancePipelineListItem = {
  pipelineId: string;
  scope: "session" | "project";
  mode?: GovernancePipelineResult["mode"];
  status?: GovernancePipelineResult["status"];
  createdAt?: string;
  updatedAt?: string;
  sessionId?: string;
  projectSlug?: string;
  stepsDone: number;
  stepsTotal: number;
  stepsFailed: number;
  hasPlaybook: boolean;
  hasSummary: boolean;
  autoApply?: boolean;
};

const SUMMARY_STEP_TYPES: AnalyzeType[] = [
  "project-synthesis",
  "project-health-report",
  "user-growth-plan",
  "token-audit",
  "loop-diagnosis",
  "memory-file-drafts",
  "artifact-blueprint",
  "agentic-lessons",
];

function pipelineCachePath(id: string): string {
  return join(CACHE_DIR, "pipeline", `${id}.json`);
}

export function toGovernanceListItem(payload: GovernancePipelineResult): GovernancePipelineListItem {
  const stepsDone = payload.steps.filter(
    (s) => s.status === "done" || s.status === "skipped",
  ).length;
  const stepsFailed = payload.steps.filter((s) => s.status === "error").length;
  return {
    pipelineId: payload.pipelineId,
    scope: payload.scope,
    mode: payload.mode,
    status: payload.status,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
    sessionId: payload.sessionId,
    projectSlug: payload.projectSlug,
    stepsDone,
    stepsTotal: payload.steps.length,
    stepsFailed,
    hasPlaybook: Boolean(payload.playbookMarkdown?.trim()),
    hasSummary: Boolean(payload.summaryMarkdown?.trim()),
    autoApply: payload.autoApply,
  };
}

export async function listGovernancePipelines(opts: {
  agent: AgentKind;
  projectSlug: string;
  sessionId?: string;
  limit?: number;
}): Promise<GovernancePipelineListItem[]> {
  const dir = join(CACHE_DIR, "pipeline");
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const items: GovernancePipelineListItem[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const payload = JSON.parse(
        await readFile(join(dir, file), "utf8"),
      ) as GovernancePipelineResult;
      if (payload.agent !== opts.agent) continue;
      if (payload.projectSlug !== opts.projectSlug) continue;
      if (opts.sessionId && payload.sessionId !== opts.sessionId) continue;
      items.push(toGovernanceListItem(payload));
    } catch {
      /* skip corrupt cache files */
    }
  }

  items.sort((a, b) => {
    const aTs = a.updatedAt ?? a.createdAt ?? "";
    const bTs = b.updatedAt ?? b.createdAt ?? "";
    return bTs.localeCompare(aTs);
  });

  return items.slice(0, opts.limit ?? 20);
}

export async function buildGovernanceSummaryMarkdown(
  agent: AgentKind,
  analysisSessionId: string,
  steps: GovernancePipelineStep[],
): Promise<string> {
  const lines: string[] = [];
  const done = steps.filter((s) => s.status === "done").length;
  const errors = steps.filter((s) => s.status === "error").length;
  const skipped = steps.filter((s) => s.status === "skipped").length;

  lines.push(
    "## Executive summary",
    "",
    `- **Steps completed:** ${done}/${steps.length}`,
  );
  if (errors) lines.push(`- **Failed steps:** ${errors}`);
  if (skipped) lines.push(`- **Skipped:** ${skipped}`);
  lines.push("");

  for (const type of SUMMARY_STEP_TYPES) {
    const step = steps.find((s) => s.type === type && s.status === "done" && s.analysisId);
    if (!step?.analysisId) continue;
    const analysis = await getSessionAnalysis(agent, analysisSessionId, step.analysisId);
    if (!analysis) continue;

    const structured = analysis.structured;
    if (structured && "summary" in structured && structured.summary.trim()) {
      lines.push(`### ${type}`, "", structured.summary.trim(), "");
    }

    if (structured?.kind === "project-synthesis") {
      if (structured.decisions.length) {
        lines.push("### Key decisions", "");
        for (const d of structured.decisions.slice(0, 8)) {
          lines.push(`- **${d.decision}:** ${d.rationale}`);
        }
        lines.push("");
      }
      if (structured.themes.length) {
        lines.push("### Cross-session themes", "");
        for (const t of structured.themes.slice(0, 6)) {
          lines.push(`- **${t.title}** (${t.status}): ${t.summary}`);
        }
        lines.push("");
      }
      if (structured.memoryGaps.length) {
        lines.push("### Memory gaps to address", "");
        for (const g of structured.memoryGaps.slice(0, 5)) {
          lines.push(`- \`${g.path}\`: ${g.gap} → ${g.suggestedAction}`);
        }
        lines.push("");
      }
    }

    if (structured?.kind === "project-health") {
      lines.push(`**Health score:** ${structured.healthScore}/100`, "");
      if (structured.openRisks.length) {
        lines.push("**Open risks:**", ...structured.openRisks.map((r) => `- ${r}`), "");
      }
      if (structured.rootCauses.length) {
        lines.push("**Root causes:**", "");
        for (const rc of structured.rootCauses.slice(0, 5)) {
          lines.push(`- ${rc.title}: ${rc.description}`);
        }
        lines.push("");
      }
    }

    if (structured?.kind === "user-growth") {
      if (structured.growthAreas.length) {
        lines.push("### Growth areas", "");
        for (const g of structured.growthAreas.slice(0, 5)) {
          const action = g.concreteActions[0] ?? g.whyItMatters;
          lines.push(`- **${g.area}:** ${action}`);
        }
        lines.push("");
      }
    }
  }

  const body = lines.join("\n").trim();
  return body || "## Executive summary\n\nNo structured summary was produced for this run.";
}

export { pipelineCachePath };
