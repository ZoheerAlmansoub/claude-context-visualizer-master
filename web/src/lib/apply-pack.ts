import type {
  AgentKind,
  AnalyzeResult,
  GeneratedArtifact,
  MemoryFileDraft,
  RuleDedupItem,
  StructuredAnalysis,
} from "../api";

export type ApplyPackItem = {
  id: string;
  path: string;
  content: string;
  action?: "create" | "update" | "append";
  selected: boolean;
  confidence?: "high" | "medium" | "low";
  label: string;
  diffPreview?: string;
};

function defaultArtifactPath(artifact: GeneratedArtifact, agent: AgentKind = "cursor"): string {
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
      return "";
  }
}

function mapRuleAction(action: RuleDedupItem["action"]): ApplyPackItem["action"] | null {
  if (action === "skip") return null;
  if (action === "merge") return "append";
  if (action === "replace") return "update";
  return "create";
}

function pushArtifactItems(
  items: ApplyPackItem[],
  artifacts: GeneratedArtifact[],
  agent: AgentKind,
  prefix: string,
) {
  artifacts.forEach((a, i) => {
    items.push({
      id: `${prefix}-art-${i}`,
      path: defaultArtifactPath(a, agent),
      content: a.rendered ?? a.content,
      action: "create",
      selected: a.confidence !== "low",
      confidence: a.confidence,
      label: `${a.kind}: ${a.name}`,
    });
  });
}

function pushMemoryItems(items: ApplyPackItem[], files: MemoryFileDraft[], prefix: string) {
  files.forEach((f, i) => {
    items.push({
      id: `${prefix}-mem-${i}`,
      path: f.path,
      content: f.content,
      action: f.action === "create" ? undefined : f.action,
      selected: true,
      label: `memory: ${f.path}`,
      diffPreview: f.content.slice(0, 400),
    });
  });
}

export function collectApplyPackItems(
  structured: StructuredAnalysis,
  agent: AgentKind,
  prefix = "pack",
): ApplyPackItem[] {
  const items: ApplyPackItem[] = [];

  switch (structured.kind) {
    case "prevention-rules":
      pushArtifactItems(items, structured.rules, agent, prefix);
      break;
    case "artifacts":
      pushArtifactItems(items, structured.items, agent, prefix);
      break;
    case "memory-files":
      pushMemoryItems(items, structured.files, prefix);
      break;
    case "memory-diff":
      structured.items.forEach((item, i) => {
        if (item.action === "skip") return;
        items.push({
          id: `${prefix}-diff-${i}`,
          path: item.path,
          content: item.diffPreview,
          action: item.action === "append" ? "append" : item.action === "update" ? "update" : "create",
          selected: true,
          label: `diff: ${item.path}`,
          diffPreview: item.diffPreview,
        });
      });
      break;
    case "rule-dedup":
      structured.items.forEach((item, i) => {
        const action = mapRuleAction(item.action);
        if (!action) return;
        items.push({
          id: `${prefix}-rule-${i}`,
          path: item.proposedPath,
          content: item.content,
          action,
          selected: item.action !== "skip",
          label: `rule: ${item.name}`,
          diffPreview: item.content.slice(0, 400),
        });
      });
      break;
    case "compaction-recovery":
      structured.recoveryItems.forEach((item, i) => {
        if (!item.suggestedMemoryPath || !item.suggestedContent) return;
        items.push({
          id: `${prefix}-recovery-${i}`,
          path: item.suggestedMemoryPath,
          content: item.suggestedContent,
          action: "append",
          selected: item.priority === "critical" || item.priority === "high",
          confidence: item.priority === "critical" ? "high" : item.priority === "high" ? "medium" : "low",
          label: `recovery: ${item.action.slice(0, 48)}`,
          diffPreview: item.suggestedContent.slice(0, 400),
        });
      });
      break;
    default:
      break;
  }

  return items;
}

export function collectFromAnalysisResult(result: AnalyzeResult, agent: AgentKind): ApplyPackItem[] {
  if (!result.structured) return [];
  return collectApplyPackItems(result.structured, agent, result.analysisId);
}

export function artifactPathForAgent(agent: AgentKind, artifact: GeneratedArtifact): string {
  return defaultArtifactPath(artifact, agent);
}
