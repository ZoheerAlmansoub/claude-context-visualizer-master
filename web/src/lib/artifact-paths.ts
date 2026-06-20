import type { AgentKind, GeneratedArtifact, RuleDedupItem } from "../api";

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

function isGenericMemoryPath(path: string): boolean {
  const norm = path.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
  if (GENERIC_MEMORY_PATHS.has(norm)) return true;
  if (GENERIC_MEMORY_PATHS.has(basenamePath(norm))) return true;
  return false;
}

export function artifactApplyPath(agent: AgentKind, artifact: GeneratedArtifact): string {
  const slug = slugify(artifact.name);
  switch (artifact.kind) {
    case "skill":
      if (agent === "claude") return `.claude/skills/${slug}/SKILL.md`;
      if (agent === "pi") return `.pi/skills/${slug}/SKILL.md`;
      if (agent === "opencode") return `.opencode/skills/${slug}/SKILL.md`;
      return `~/.cursor/skills/${slug}/SKILL.md`;
    case "rule":
      if (agent === "claude") return `.claude/rules/${slug}.md`;
      if (agent === "pi") return `.pi/rules/${slug}.md`;
      if (agent === "opencode") return `.opencode/rules/${slug}.md`;
      return `.cursor/rules/${slug}.mdc`;
    case "hook":
      if (agent === "claude") return `.claude/hooks/${slug}.md`;
      return `.cursor/hooks/${slug}.md`;
    case "subagent":
      if (agent === "cursor") return `.cursor/agents/${slug}.md`;
      return `docs/agents/${slug}.md`;
    case "tool-hint":
      if (agent === "cursor") return `.cursor/rules/tool-hints/${slug}.mdc`;
      if (agent === "claude") return `.claude/rules/tool-hints/${slug}.md`;
      if (agent === "pi") return `.pi/rules/tool-hints/${slug}.md`;
      return `.opencode/rules/tool-hints/${slug}.md`;
    default:
      return `docs/agent-hints/${slug}.md`;
  }
}

export function ruleDedupApplyPath(
  agent: AgentKind,
  item: Pick<RuleDedupItem, "name" | "proposedPath" | "content">,
): string {
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

export function memoryApplyPath(agent: AgentKind, path: string, _purpose?: string): string {
  const trimmed = path.trim().replace(/\\/g, "/");
  if (trimmed) return trimmed;
  if (agent === "claude") return "CLAUDE.md";
  return "AGENTS.md";
}

export function recoveryApplyPath(_agent: AgentKind, suggestedPath: string, label: string): string {
  const trimmed = suggestedPath.trim().replace(/\\/g, "/");
  const slug = slugify(label.slice(0, 48));
  if (!trimmed || isGenericMemoryPath(trimmed) || trimmed.includes(" or ")) {
    return `docs/context/recovery-${slug}.md`;
  }
  return trimmed;
}

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

export function resolveArtifactApplyPath(agent: AgentKind, artifact: GeneratedArtifact): string {
  return artifactApplyPath(agent, artifact);
}
