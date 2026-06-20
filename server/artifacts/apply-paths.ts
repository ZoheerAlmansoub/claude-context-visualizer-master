import type { AgentKind, ArtifactKind, GeneratedArtifact, RuleDedupItem } from "../types.ts";
import { defaultArtifactTarget } from "./agent-registry.ts";

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "artifact";
}

const GENERIC_MEMORY_PATHS = new Set([
  "agents.md",
  "claude.md",
  ".cursor/agents.md",
  "design.md",
]);

function basenamePath(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? path.toLowerCase();
}

export function looksLikeCursorRule(content: string): boolean {
  return (
    /alwaysApply:\s*(true|false)/i.test(content) ||
    /^---\s*\r?\n(?:.*\r?\n)*?---/m.test(content) ||
    /^#\s*Rule:/m.test(content)
  );
}

export function looksLikeSkill(content: string): boolean {
  return /^---\s*\r?\nname:/m.test(content);
}

function isGenericMemoryPath(path: string): boolean {
  const norm = path.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
  if (GENERIC_MEMORY_PATHS.has(norm)) return true;
  if (GENERIC_MEMORY_PATHS.has(basenamePath(norm))) return true;
  return false;
}

/** Agent-aware default path for a generated artifact (rules, skills, hooks, …). */
export function artifactApplyPath(agent: AgentKind, artifact: GeneratedArtifact): string {
  const target = defaultArtifactTarget(agent, artifact);
  return target.relativePath.replace(/\\/g, "/");
}

/** Resolve rule-dedup row path; fix LLM/heuristic paths that wrongly target memory files. */
export function ruleDedupApplyPath(
  agent: AgentKind,
  item: Pick<RuleDedupItem, "name" | "proposedPath" | "content">,
): string {
  const slug = slugify(item.name);
  const proposed = item.proposedPath?.trim().replace(/\\/g, "/");
  const fallback = artifactApplyPath(agent, {
    kind: "rule",
    name: item.name,
    description: "",
    trigger: "",
    content: item.content,
    sourceTurns: [],
    confidence: "medium",
  });

  if (!proposed) return fallback;
  if (isGenericMemoryPath(proposed) && looksLikeCursorRule(item.content)) return fallback;
  if (proposed.endsWith("/rule.mdc") || proposed.endsWith("/rule.md")) return fallback;
  if (/^agents\.md$/i.test(basenamePath(proposed)) && looksLikeCursorRule(item.content)) return fallback;

  return proposed;
}

/** Memory file paths must stay as proposed unless empty. */
export function memoryApplyPath(agent: AgentKind, path: string, purpose?: string): string {
  const trimmed = path.trim().replace(/\\/g, "/");
  if (trimmed) return trimmed;
  if (agent === "claude") return "CLAUDE.md";
  return "AGENTS.md";
}

/** Compaction recovery should not pile everything into AGENTS.md. */
export function recoveryApplyPath(agent: AgentKind, suggestedPath: string, label: string): string {
  const trimmed = suggestedPath.trim().replace(/\\/g, "/");
  const slug = slugify(label.slice(0, 48));
  if (!trimmed || isGenericMemoryPath(trimmed) || trimmed.includes(" or ")) {
    return `docs/context/recovery-${slug}.md`;
  }
  return trimmed;
}

export function toolHintApplyPath(agent: AgentKind, artifact: GeneratedArtifact): string {
  const slug = slugify(artifact.name);
  switch (agent) {
    case "cursor":
      return `.cursor/rules/tool-hints/${slug}.mdc`;
    case "claude":
      return `.claude/rules/tool-hints/${slug}.md`;
    case "pi":
      return `.pi/rules/tool-hints/${slug}.md`;
    case "opencode":
      return `.opencode/rules/tool-hints/${slug}.md`;
    default:
      return `docs/agent-hints/${slug}.md`;
  }
}

export function resolveArtifactApplyPath(agent: AgentKind, artifact: GeneratedArtifact): string {
  if (artifact.kind === "tool-hint") return toolHintApplyPath(agent, artifact);
  return artifactApplyPath(agent, artifact);
}

/** Prevent duplicate paths in one apply pack (suffix before extension). */
export function disambiguateApplyPaths<T extends { path: string }>(items: T[]): T[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = item.path.replace(/\\/g, "/");
    const count = seen.get(base.toLowerCase()) ?? 0;
    seen.set(base.toLowerCase(), count + 1);
    if (count === 0) return item;

    const dot = base.lastIndexOf(".");
    if (dot > base.lastIndexOf("/")) {
      return { ...item, path: `${base.slice(0, dot)}-${count + 1}${base.slice(dot)}` };
    }
    return { ...item, path: `${base}-${count + 1}` };
  });
}

export function agentPathHints(agent: AgentKind): string {
  switch (agent) {
    case "cursor":
      return "Rules → .cursor/rules/<name>.mdc · Skills → ~/.cursor/skills/<name>/SKILL.md · Memory → AGENTS.md, design.md";
    case "claude":
      return "Rules → .claude/rules/<name>.md · Memory → CLAUDE.md, AGENTS.md";
    case "pi":
      return "Rules → .pi/rules/<name>.md · Skills → .pi/skills/<name>/SKILL.md · Memory → AGENTS.md";
    case "opencode":
      return "Rules → .opencode/rules/<name>.md · Skills → .opencode/skills/<name>/SKILL.md";
    default:
      return "";
  }
}

export type { ArtifactKind };
