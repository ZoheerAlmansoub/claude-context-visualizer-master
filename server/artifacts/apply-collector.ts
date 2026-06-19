import type { AnalyzeResult, AnalyzeType, GeneratedArtifact, RuleDedupItem, StructuredAnalysis } from "../types.ts";
import type { AgentKind } from "../types.ts";

export type ApplyPackItem = {
  path: string;
  content: string;
  action?: "create" | "update" | "append";
  selected?: boolean;
  confidence?: "high" | "medium" | "low";
  label?: string;
};

function defaultArtifactPath(artifact: GeneratedArtifact, agent: AgentKind): string {
  const slug = artifact.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  switch (artifact.kind) {
    case "skill":
      if (agent === "claude") return `.claude/skills/${slug}/SKILL.md`;
      if (agent === "pi") return `.pi/skills/${slug}/SKILL.md`;
      if (agent === "opencode") return `.opencode/skills/${slug}/SKILL.md`;
      return `~/.cursor/skills/${slug}/SKILL.md`;
    case "rule":
      if (agent === "claude") return `.claude/rules/${slug}.md`;
      if (agent === "opencode") return `.opencode/rules/${slug}.md`;
      if (agent === "pi") return `AGENTS.md`;
      return `.cursor/rules/${slug}.mdc`;
    case "hook":
      if (agent === "claude") return `.claude/hooks/${slug}.md`;
      return `.cursor/hooks/${slug}.md`;
    case "subagent":
      if (agent === "cursor") return `.cursor/agents/${slug}.md`;
      return `docs/agents/${slug}.md`;
    default:
      return `docs/agent-hints/${slug}.md`;
  }
}

function mapRuleAction(action: RuleDedupItem["action"]): ApplyPackItem["action"] | null {
  if (action === "skip") return null;
  if (action === "merge") return "append";
  if (action === "replace") return "update";
  return "create";
}

export function collectApplyPackFromStructured(
  structured: StructuredAnalysis,
  agent: AgentKind,
): ApplyPackItem[] {
  const items: ApplyPackItem[] = [];

  const pushArtifacts = (artifacts: GeneratedArtifact[]) => {
    for (const a of artifacts) {
      items.push({
        path: defaultArtifactPath(a, agent),
        content: a.rendered ?? a.content,
        action: "create",
        selected: a.confidence !== "low",
        confidence: a.confidence,
        label: `${a.kind}: ${a.name}`,
      });
    }
  };

  switch (structured.kind) {
    case "prevention-rules":
      pushArtifacts(structured.rules);
      break;
    case "artifacts":
      pushArtifacts(structured.items);
      break;
    case "memory-files":
      for (const f of structured.files) {
        items.push({
          path: f.path,
          content: f.content,
          action: f.action === "create" ? undefined : f.action,
          selected: true,
          label: `memory: ${f.path}`,
        });
      }
      break;
    case "memory-diff":
      for (const item of structured.items) {
        if (item.action === "skip") continue;
        items.push({
          path: item.path,
          content: item.diffPreview,
          action: item.action === "append" ? "append" : item.action === "update" ? "update" : "create",
          selected: true,
          label: `diff: ${item.path}`,
        });
      }
      break;
    case "rule-dedup":
      for (const item of structured.items) {
        const action = mapRuleAction(item.action);
        if (!action) continue;
        items.push({
          path: item.proposedPath,
          content: item.content,
          action,
          selected: item.action !== "skip",
          label: `rule: ${item.name}`,
        });
      }
      break;
    case "compaction-recovery":
      for (const item of structured.recoveryItems) {
        if (!item.suggestedMemoryPath || !item.suggestedContent) continue;
        items.push({
          path: item.suggestedMemoryPath,
          content: item.suggestedContent,
          action: "append",
          selected: item.priority === "critical" || item.priority === "high",
          confidence: item.priority === "critical" ? "high" : item.priority === "high" ? "medium" : "low",
          label: `recovery: ${item.action.slice(0, 48)}`,
        });
      }
      break;
    default:
      break;
  }

  return items;
}

export function collectApplyPackFromAnalysis(result: AnalyzeResult, agent: AgentKind): ApplyPackItem[] {
  if (!result.structured) return [];
  return collectApplyPackFromStructured(result.structured, agent);
}

export function filterAutoApplyItems(items: ApplyPackItem[]): ApplyPackItem[] {
  return items.filter(
    (i) => i.selected !== false && (i.confidence === "high" || i.confidence === "medium" || !i.confidence),
  );
}

export const AUTO_APPLY_ANALYSIS_TYPES = new Set<AnalyzeType>([
  "memory-file-drafts",
  "loop-diagnosis",
  "tool-hardening",
  "artifact-blueprint",
  "memory-diff",
  "rule-dedup",
  "compaction-recovery",
]);
