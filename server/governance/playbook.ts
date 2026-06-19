import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  AgentKind,
  GovernancePipelineStep,
  RecurringPattern,
} from "../types.ts";

export async function generateProjectPlaybook(opts: {
  agent: AgentKind;
  projectSlug: string;
  projectRoot: string;
  scope: "session" | "project";
  sessionTitle?: string;
  patterns?: RecurringPattern[];
  steps: GovernancePipelineStep[];
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

  if (opts.sessionTitle) {
    lines.push(`- **Session:** ${opts.sessionTitle}`);
  }

  lines.push("", "## Pipeline status", "");
  for (const step of opts.steps) {
    lines.push(`- \`${step.type}\`: ${step.status}${step.error ? ` — ${step.error}` : ""}`);
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
    "2. Apply high-confidence artifacts via Apply Pack.",
    "3. Merge memory file updates after diff preview.",
    "4. Re-run project pipeline after 5+ new sessions.",
    "",
  );

  return lines.join("\n");
}

export async function exportPlaybookToProject(
  projectRoot: string,
  markdown: string,
): Promise<string> {
  const dir = join(projectRoot, "docs", "governance");
  const file = join(dir, `${new Date().toISOString().slice(0, 10)}-playbook.md`);
  await mkdir(dir, { recursive: true });
  await writeFile(file, markdown, "utf8");
  return file;
}
