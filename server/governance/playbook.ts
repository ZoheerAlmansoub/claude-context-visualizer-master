import type {
  AgentKind,
  AnalyzeResult,
  GovernancePipelineStep,
  RecurringPattern,
} from "../types.ts";

export type PlaybookStepExcerpt = {
  type: string;
  status: string;
  summary?: string;
  artifacts?: Array<{ name: string; kind: string; confidence: string; excerpt: string }>;
  memoryFiles?: Array<{ path: string; action: string; excerpt: string }>;
  error?: string;
};

export async function generateProjectPlaybook(opts: {
  agent: AgentKind;
  projectSlug: string;
  projectRoot: string;
  scope: "session" | "project";
  sessionTitle?: string;
  patterns?: RecurringPattern[];
  steps: GovernancePipelineStep[];
  stepAnalyses?: PlaybookStepExcerpt[];
  pipelineId?: string;
}): Promise<string> {
  const date = new Date().toISOString().slice(0, 10);
  const lines = [
    `# Agent Governance Playbook`,
    "",
    `- **Date:** ${date}`,
    `- **Scope:** ${opts.scope}`,
    `- **Agent:** ${opts.agent}`,
    `- **Project:** ${opts.projectSlug}`,
    `- **Root:** ${opts.projectRoot}`,
  ];

  if (opts.pipelineId) {
    lines.push(`- **Pipeline ID:** \`${opts.pipelineId}\``);
  }
  if (opts.sessionTitle) {
    lines.push(`- **Session:** ${opts.sessionTitle}`);
  }

  lines.push("", "## Pipeline status", "");
  for (const step of opts.steps) {
    lines.push(`- \`${step.type}\`: ${step.status}${step.error ? ` — ${step.error}` : ""}`);
  }

  if (opts.stepAnalyses?.length) {
    lines.push("", "## Analysis excerpts", "");
    for (const excerpt of opts.stepAnalyses) {
      if (excerpt.status !== "done") continue;
      lines.push(`### ${excerpt.type}`, "");
      if (excerpt.summary?.trim()) {
        lines.push(excerpt.summary.trim(), "");
      }
      if (excerpt.artifacts?.length) {
        lines.push("**Suggested artifacts:**", "");
        for (const a of excerpt.artifacts.slice(0, 5)) {
          lines.push(`- \`${a.kind}\` **${a.name}** (${a.confidence}): ${a.excerpt.slice(0, 200)}`);
        }
        lines.push("");
      }
      if (excerpt.memoryFiles?.length) {
        lines.push("**Memory drafts:**", "");
        for (const f of excerpt.memoryFiles.slice(0, 4)) {
          lines.push(`- \`${f.path}\` (${f.action}): ${f.excerpt.slice(0, 180)}`);
        }
        lines.push("");
      }
    }
  }

  if (opts.patterns?.length) {
    lines.push("", "## Cross-session patterns", "");
    for (const p of opts.patterns.slice(0, 10)) {
      lines.push(`- **${p.label}** (×${p.count}): ${p.recommendation}`);
    }
  }

  lines.push(
    "",
    "## Recommended next actions",
    "",
    "1. Review structured analysis cards in the Governance tab.",
    "2. Apply high-confidence artifacts via Apply Pack (check grounding badges).",
    "3. Merge memory file updates after diff preview.",
    "4. Re-run project pipeline after 5+ new sessions.",
    "",
    `_Exported to docs/governance/ on ${date}_`,
  );

  return lines.join("\n");
}

export function buildPlaybookExcerptFromAnalysis(
  type: string,
  status: string,
  analysis: AnalyzeResult | null,
  error?: string,
): PlaybookStepExcerpt {
  const excerpt: PlaybookStepExcerpt = { type, status, error };
  if (!analysis?.structured) return excerpt;

  const structured = analysis.structured;
  if ("summary" in structured && structured.summary.trim()) {
    excerpt.summary = structured.summary.trim();
  }

  if (structured.kind === "artifacts" || structured.kind === "prevention-rules") {
    const items = structured.kind === "artifacts" ? structured.items : structured.rules;
    excerpt.artifacts = items
      .filter((a) => a.confidence !== "low")
      .slice(0, 6)
      .map((a) => ({
        name: a.name,
        kind: a.kind,
        confidence: a.confidence,
        excerpt: (a.rendered ?? a.content).slice(0, 300),
      }));
  }

  if (structured.kind === "memory-files") {
    excerpt.memoryFiles = structured.files.slice(0, 5).map((f) => ({
      path: f.path,
      action: f.action,
      excerpt: f.content.slice(0, 250),
    }));
  }

  return excerpt;
}

export async function exportPlaybookToProject(
  projectRoot: string,
  markdown: string,
): Promise<string> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const dir = join(projectRoot, "docs", "governance");
  const file = join(dir, `${new Date().toISOString().slice(0, 10)}-playbook.md`);
  await mkdir(dir, { recursive: true });
  await writeFile(file, markdown, "utf8");
  return file;
}
