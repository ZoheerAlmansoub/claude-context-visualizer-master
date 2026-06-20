import type {
  AgentKind,
  AnalyzeResult,
  GeneratedArtifact,
  MemoryFileDraft,
  RuleDedupItem,
  StructuredAnalysis,
  SubAgentSpec,
} from "../api";
import {
  artifactApplyPath,
  disambiguateApplyPaths,
  memoryApplyPath,
  recoveryApplyPath,
  resolveArtifactApplyPath,
  ruleDedupApplyPath,
} from "./artifact-paths";

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

function mapRuleAction(action: RuleDedupItem["action"]): ApplyPackItem["action"] | null {
  if (action === "skip") return null;
  if (action === "merge") return "append";
  if (action === "replace") return "update";
  return "create";
}

function subAgentSpecToArtifact(spec: SubAgentSpec): GeneratedArtifact {
  const toolsBlock = spec.tools.length
    ? `## Tools\n${spec.tools.map((t) => `- ${t}`).join("\n")}`
    : "";
  const content = [
    `## Role\n${spec.role}`,
    `## When to use\n${spec.whenToUse}`,
    `## Context budget\n${spec.contextBudget}`,
    `## Handoff points\n${spec.handoffPoints}`,
    toolsBlock,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    kind: "subagent",
    name: spec.name,
    description: spec.role,
    trigger: spec.whenToUse,
    content,
    sourceTurns: [],
    confidence: spec.confidence,
  };
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
      path: resolveArtifactApplyPath(agent, a),
      content: a.rendered ?? a.content,
      action: "create",
      selected: a.confidence !== "low",
      confidence: a.confidence,
      label: `${a.kind}: ${a.name}`,
    });
  });
}

function pushMemoryItems(items: ApplyPackItem[], files: MemoryFileDraft[], prefix: string, agent: AgentKind) {
  files.forEach((f, i) => {
    items.push({
      id: `${prefix}-mem-${i}`,
      path: memoryApplyPath(agent, f.path, f.purpose),
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
      pushMemoryItems(items, structured.files, prefix, agent);
      break;
    case "memory-diff":
      structured.items.forEach((item, i) => {
        if (item.action === "skip") return;
        items.push({
          id: `${prefix}-diff-${i}`,
          path: memoryApplyPath(agent, item.path),
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
          path: ruleDedupApplyPath(agent, item),
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
          path: recoveryApplyPath(agent, item.suggestedMemoryPath, item.action),
          content: item.suggestedContent,
          action: "append",
          selected: item.priority === "critical" || item.priority === "high",
          confidence: item.priority === "critical" ? "high" : item.priority === "high" ? "medium" : "low",
          label: `recovery: ${item.action.slice(0, 48)}`,
          diffPreview: item.suggestedContent.slice(0, 400),
        });
      });
      break;
    case "orchestration":
      structured.agents.forEach((spec, i) => {
        const artifact = subAgentSpecToArtifact(spec);
        items.push({
          id: `${prefix}-subagent-${i}`,
          path: resolveArtifactApplyPath(agent, artifact),
          content: artifact.content,
          action: "create",
          selected: spec.confidence !== "low",
          confidence: spec.confidence,
          label: `subagent: ${spec.name}`,
          diffPreview: artifact.content.slice(0, 400),
        });
      });
      break;
    default:
      break;
  }

  return disambiguateApplyPaths(items).map((item, i) => ({
    ...item,
    id: item.id || `${prefix}-${i}`,
  }));
}

export function collectFromAnalysisResult(result: AnalyzeResult, agent: AgentKind): ApplyPackItem[] {
  if (!result.structured) return [];
  return collectApplyPackItems(result.structured, agent, result.analysisId);
}

export function artifactPathForAgent(agent: AgentKind, artifact: GeneratedArtifact): string {
  return artifactApplyPath(agent, artifact);
}
