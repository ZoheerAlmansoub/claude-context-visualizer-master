import type { AnalyzeResult, AnalyzeType, GeneratedArtifact, RuleDedupItem, StructuredAnalysis, SubAgentSpec } from "../types.ts";
import type { AgentKind } from "../types.ts";
import {
  artifactApplyPath,
  disambiguateApplyPaths,
  memoryApplyPath,
  recoveryApplyPath,
  resolveArtifactApplyPath,
  ruleDedupApplyPath,
} from "./apply-paths.ts";

export type ApplyPackItem = {
  path: string;
  content: string;
  action?: "create" | "update" | "append";
  selected?: boolean;
  confidence?: "high" | "medium" | "low";
  label?: string;
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

export function collectApplyPackFromStructured(
  structured: StructuredAnalysis,
  agent: AgentKind,
): ApplyPackItem[] {
  const items: ApplyPackItem[] = [];

  const pushArtifacts = (artifacts: GeneratedArtifact[], prefix: string) => {
    for (const a of artifacts) {
      items.push({
        path: resolveArtifactApplyPath(agent, a),
        content: a.rendered ?? a.content,
        action: "create",
        selected: a.confidence !== "low",
        confidence: a.confidence,
        label: `${prefix}${a.kind}: ${a.name}`,
      });
    }
  };

  switch (structured.kind) {
    case "prevention-rules":
      pushArtifacts(structured.rules, "");
      break;
    case "artifacts":
      pushArtifacts(structured.items, "");
      break;
    case "memory-files":
      for (const f of structured.files) {
        items.push({
          path: memoryApplyPath(agent, f.path, f.purpose),
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
          path: memoryApplyPath(agent, item.path),
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
          path: ruleDedupApplyPath(agent, item),
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
          path: recoveryApplyPath(agent, item.suggestedMemoryPath, item.action),
          content: item.suggestedContent,
          action: "append",
          selected: item.priority === "critical" || item.priority === "high",
          confidence: item.priority === "critical" ? "high" : item.priority === "high" ? "medium" : "low",
          label: `recovery: ${item.action.slice(0, 48)}`,
        });
      }
      break;
    case "orchestration":
      for (const spec of structured.agents) {
        const artifact = subAgentSpecToArtifact(spec);
        items.push({
          path: resolveArtifactApplyPath(agent, artifact),
          content: artifact.content,
          action: "create",
          selected: spec.confidence !== "low",
          confidence: spec.confidence,
          label: `subagent: ${spec.name}`,
        });
      }
      break;
    default:
      break;
  }

  return disambiguateApplyPaths(items);
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
  "agent-orchestration",
  "memory-diff",
  "rule-dedup",
  "compaction-recovery",
]);

export { artifactApplyPath, ruleDedupApplyPath, resolveArtifactApplyPath };
