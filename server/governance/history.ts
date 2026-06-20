import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { getSessionAnalysis } from "../analysis.ts";
import { CACHE_DIR } from "../paths.ts";
import { SUMMARY_STEP_TYPES } from "../../shared/governance-config.ts";
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
      if (structured.weeklyPlan.length) {
        lines.push("### Weekly plan", "");
        for (const d of structured.weeklyPlan) {
          lines.push(`- **${d.day}** — ${d.focus}: ${d.task}`);
        }
        lines.push("");
      }
      if (structured.growthAreas.length) {
        lines.push("### Growth areas", "");
        for (const g of structured.growthAreas.slice(0, 8)) {
          lines.push(`- **${g.area}:** ${g.whyItMatters}`);
          for (const a of g.concreteActions.slice(0, 6)) {
            lines.push(`  - ${a}`);
          }
        }
        lines.push("");
      }
    }

    if (structured?.kind === "artifacts" && structured.items.length) {
      lines.push("**Tool / artifact suggestions:**", "");
      for (const a of structured.items.slice(0, 4)) {
        lines.push(`- \`${a.kind}\` **${a.name}** (${a.confidence}): ${a.description.slice(0, 120)}`);
      }
      lines.push("");
    }

    if (structured?.kind === "prevention-rules" && structured.rules.length) {
      lines.push("**Prevention rules:**", "");
      for (const r of structured.rules.slice(0, 4)) {
        lines.push(`- **${r.name}** (${r.confidence}): ${r.trigger.slice(0, 100)}`);
      }
      lines.push("");
    }

    if (structured?.kind === "mcp-tool-audit" && structured.findings.length) {
      lines.push("**MCP tool findings:**", "");
      for (const f of structured.findings.slice(0, 5)) {
        lines.push(`- **${f.toolName}** (${f.severity}): ${f.pattern.slice(0, 100)}`);
      }
      lines.push("");
    }

    if (structured?.kind === "user-fluency" && structured.dimensions.length) {
      lines.push("**Fluency dimensions:**", "");
      for (const d of structured.dimensions.slice(0, 4)) {
        lines.push(`- **${d.label}:** ${d.score}/100 — ${d.evidence.slice(0, 80)}`);
      }
      lines.push("");
    }

    if (structured?.kind === "compaction-recovery" && structured.recoveryItems.length) {
      lines.push("**Compaction recovery:**", "");
      for (const r of structured.recoveryItems.slice(0, 4)) {
        lines.push(`- (${r.priority}) ${r.action.slice(0, 100)}`);
      }
      lines.push("");
    }

    if (structured?.kind === "memory-diff" && structured.items.length) {
      lines.push("**Memory diff items:**", "");
      for (const item of structured.items.filter((i) => i.action !== "skip").slice(0, 4)) {
        lines.push(`- \`${item.path}\` (${item.action}): ${item.rationale.slice(0, 80)}`);
      }
      lines.push("");
    }

    if (structured?.kind === "rule-dedup" && structured.items.length) {
      lines.push("**Rule dedup:**", "");
      for (const item of structured.items.filter((i) => i.action !== "skip").slice(0, 4)) {
        lines.push(`- **${item.name}** → \`${item.proposedPath}\` (${item.action})`);
      }
      lines.push("");
    }

    if (structured?.kind === "memory-files" && structured.files.length) {
      lines.push("**Memory file drafts:**", "");
      for (const f of structured.files.slice(0, 4)) {
        lines.push(`- \`${f.path}\` (${f.action}): ${f.purpose.slice(0, 80)}`);
      }
      lines.push("");
    }
  }

  const body = lines.join("\n").trim();
  return body || "## Executive summary\n\nNo structured summary was produced for this run.";
}

export { pipelineCachePath };
