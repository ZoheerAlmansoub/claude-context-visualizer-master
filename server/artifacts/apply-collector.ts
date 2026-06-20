import type { AnalyzeResult, GeneratedArtifact, RuleDedupItem, StructuredAnalysis, SessionTranscript, SubAgentSpec } from "../types.ts";
import type { AgentKind } from "../types.ts";
import { AUTO_APPLY_ANALYSIS_TYPE_SET } from "../../shared/governance-config.ts";
import type { ProjectContextSnapshot } from "../project-context.ts";
import {
  minContentLength,
  passesAutoApplyGrounding,
  scoreArtifactGrounding,
  scoreMemoryDraftGrounding,
  type GroundingLevel,
} from "../validation/grounding.ts";
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
  groundingScore?: number;
  groundingLevel?: GroundingLevel;
  groundingReasons?: string[];
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
      const body = a.rendered ?? a.content;
      if (body.trim().length < minContentLength()) continue;
      items.push({
        path: resolveArtifactApplyPath(agent, a),
        content: body,
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
        if (f.content.trim().length < minContentLength()) continue;
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

export function collectApplyPackFromAnalysis(
  result: AnalyzeResult,
  agent: AgentKind,
  _ctx?: { transcript?: SessionTranscript; projectContext?: ProjectContextSnapshot },
): ApplyPackItem[] {
  if (!result.structured) return [];
  return collectApplyPackFromStructured(result.structured, agent);
}

export function filterAutoApplyItems(items: ApplyPackItem[]): ApplyPackItem[] {
  return items.filter(
    (i) =>
      i.selected !== false &&
      i.content.trim().length >= minContentLength() &&
      (i.confidence === "high" || i.confidence === "medium" || !i.confidence),
  );
}

export function enrichAndFilterAutoApplyItems(
  items: ApplyPackItem[],
  ctx: { transcript?: SessionTranscript; projectContext?: ProjectContextSnapshot },
): ApplyPackItem[] {
  const enriched = items.map((item) => {
    if (item.label?.startsWith("memory:")) {
      const path = item.path;
      const grounding = scoreMemoryDraftGrounding(
        {
          path,
          purpose: item.label.replace(/^memory:\s*/, ""),
          action: item.action ?? "create",
          rationale: item.label,
          content: item.content,
        },
        ctx.transcript,
        ctx.projectContext,
      );
      return {
        ...item,
        groundingScore: grounding.score,
        groundingLevel: grounding.level,
        groundingReasons: grounding.reasons,
      };
    }

    const kindMatch = item.label?.match(/^(?:\w+: )?(\w+): /);
    const artifact: GeneratedArtifact = {
      kind: (kindMatch?.[1] as GeneratedArtifact["kind"]) ?? "rule",
      name: item.label?.split(": ").pop() ?? "artifact",
      description: "",
      trigger: "",
      content: item.content,
      sourceTurns: [],
      confidence: item.confidence ?? "medium",
    };
    const grounding = scoreArtifactGrounding(artifact, ctx.transcript, ctx.projectContext);
    return {
      ...item,
      groundingScore: grounding.score,
      groundingLevel: grounding.level,
      groundingReasons: grounding.reasons,
    };
  });

  return filterAutoApplyItems(enriched).filter(
    (i) => !i.groundingLevel || passesAutoApplyGrounding(i.groundingLevel),
  );
}

export const AUTO_APPLY_ANALYSIS_TYPES = AUTO_APPLY_ANALYSIS_TYPE_SET;

export { artifactApplyPath, ruleDedupApplyPath, resolveArtifactApplyPath };
