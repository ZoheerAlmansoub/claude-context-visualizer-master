import type { AgentKind, ArtifactKind } from "./analyze-types.ts";

export type ArtifactPathInput = {
  kind: ArtifactKind;
  name: string;
};

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "artifact";
}

/** Agent-aware default relative path for a generated artifact. */
export function defaultArtifactRelativePath(agent: AgentKind, artifact: ArtifactPathInput): string {
  const s = slugify(artifact.name);
  switch (artifact.kind) {
    case "skill":
      if (agent === "cursor") return `~/.cursor/skills/${s}/SKILL.md`;
      if (agent === "claude") return `.claude/skills/${s}/SKILL.md`;
      if (agent === "pi") return `.pi/skills/${s}/SKILL.md`;
      if (agent === "antigravity") return `.agents/skills/${s}/SKILL.md`;
      return `.opencode/skills/${s}/SKILL.md`;
    case "rule":
      if (agent === "cursor") return `.cursor/rules/${s}.mdc`;
      if (agent === "claude") return `.claude/rules/${s}.md`;
      if (agent === "pi") return `.pi/rules/${s}.md`;
      if (agent === "antigravity") return `.agents/rules/${s}.md`;
      return `.opencode/rules/${s}.md`;
    case "hook":
      if (agent === "cursor") return `.cursor/hooks/${s}.md`;
      if (agent === "claude") return `.claude/hooks/${s}.md`;
      if (agent === "antigravity") return `.agent/workflows/${s}.md`;
      return `docs/hooks/${s}.md`;
    case "subagent":
      if (agent === "cursor") return `.cursor/agents/${s}.md`;
      if (agent === "antigravity") return `.agents/skills/${s}/SKILL.md`;
      return `docs/agents/${s}.md`;
    case "tool-hint":
      if (agent === "cursor") return `.cursor/rules/tool-hints/${s}.mdc`;
      if (agent === "claude") return `.claude/rules/tool-hints/${s}.md`;
      if (agent === "pi") return `.pi/rules/tool-hints/${s}.md`;
      if (agent === "antigravity") return `.agents/rules/tool-hints/${s}.md`;
      return `.opencode/rules/tool-hints/${s}.md`;
    default:
      return `docs/agent-hints/${s}.md`;
  }
}

export function artifactApplyPath(agent: AgentKind, artifact: ArtifactPathInput): string {
  return defaultArtifactRelativePath(agent, artifact);
}

export function resolveArtifactApplyPath(agent: AgentKind, artifact: ArtifactPathInput): string {
  return artifactApplyPath(agent, artifact);
}

export function agentArtifactPathHints(agent: AgentKind): string {
  switch (agent) {
    case "cursor":
      return "Cursor: .cursor/rules/*.mdc, ~/.cursor/skills/*/SKILL.md, .cursor/hooks/*.md, .cursor/agents/*.md";
    case "claude":
      return "Claude Code: CLAUDE.md, .claude/rules/*.md, .claude/skills/*/SKILL.md, .claude/hooks/*.md";
    case "pi":
      return "Pi: AGENTS.md, .pi/skills/*/SKILL.md, .pi/rules/*.md, docs/hooks/*.md";
    case "opencode":
      return "OpenCode: AGENTS.md, .opencode/rules/*.md, .opencode/skills/*/SKILL.md, docs/hooks/*.md";
    case "antigravity":
      return "Antigravity: GEMINI.md, AGENTS.md, .agents/rules/*.md, ~/.gemini/GEMINI.md, ~/.gemini/antigravity/skills/*/SKILL.md";
    default:
      return "Universal: AGENTS.md, design.md, docs/context/*.md";
  }
}

export function primaryMemoryPath(agent: AgentKind): string {
  return agent === "claude" ? "CLAUDE.md" : "AGENTS.md";
}
