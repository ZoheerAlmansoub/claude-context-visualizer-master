import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentKind, ArtifactKind, GeneratedArtifact } from "../types.ts";
import {
  renderHookMarkdown,
  renderRuleMdc,
  renderSkillMarkdown,
  renderSubAgentMarkdown,
} from "./generator.ts";

export type ArtifactTarget = {
  relativePath: string;
  scope: "project" | "user";
};

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function defaultArtifactTarget(
  agent: AgentKind,
  artifact: GeneratedArtifact,
): ArtifactTarget {
  const s = slug(artifact.name);
  switch (artifact.kind) {
    case "skill":
      if (agent === "cursor") return { relativePath: join(".cursor", "skills", s, "SKILL.md"), scope: "user" };
      if (agent === "claude") return { relativePath: join(".claude", "skills", s, "SKILL.md"), scope: "project" };
      if (agent === "pi") return { relativePath: join(".pi", "skills", s, "SKILL.md"), scope: "project" };
      return { relativePath: join(".opencode", "skills", s, "SKILL.md"), scope: "project" };
    case "rule":
      if (agent === "cursor") return { relativePath: join(".cursor", "rules", `${s}.mdc`), scope: "project" };
      if (agent === "claude") return { relativePath: join(".claude", "rules", `${s}.md`), scope: "project" };
      if (agent === "pi") return { relativePath: join("AGENTS.md"), scope: "project" };
      return { relativePath: join(".opencode", "rules", `${s}.md`), scope: "project" };
    case "hook":
      if (agent === "cursor") return { relativePath: join(".cursor", "hooks", `${s}.md`), scope: "project" };
      if (agent === "claude") return { relativePath: join(".claude", "hooks", `${s}.md`), scope: "project" };
      return { relativePath: join("docs", "hooks", `${s}.md`), scope: "project" };
    case "subagent":
      if (agent === "cursor") return { relativePath: join(".cursor", "agents", `${s}.md`), scope: "project" };
      return { relativePath: join("docs", "agents", `${s}.md`), scope: "project" };
    default:
      return { relativePath: join("docs", "agent-hints", `${s}.md`), scope: "project" };
  }
}

export function resolveArtifactAbsolutePath(
  agent: AgentKind,
  target: ArtifactTarget,
  projectRoot: string,
): string {
  if (target.scope === "user" && agent === "cursor") {
    return join(homedir(), ".cursor", "skills", slug(target.relativePath.split("/").slice(-2)[0] ?? "skill"), "SKILL.md");
  }
  return join(projectRoot, target.relativePath);
}

export function renderArtifactBodyForAgent(agent: AgentKind, artifact: GeneratedArtifact): string {
  if (agent === "cursor") {
    switch (artifact.kind) {
      case "skill":
        return renderSkillMarkdown(artifact);
      case "rule":
        return renderRuleMdc(artifact);
      case "hook":
        return renderHookMarkdown(artifact);
      case "subagent":
        return renderSubAgentMarkdown(artifact);
      default:
        return `## Tool hint: ${artifact.name}\n\n${artifact.content}`;
    }
  }

  if (artifact.kind === "skill") {
    return renderSkillMarkdown(artifact);
  }
  if (artifact.kind === "rule") {
    return `# Rule: ${artifact.name}\n\n**Trigger:** ${artifact.trigger}\n\n${artifact.description}\n\n${artifact.content}`;
  }
  if (artifact.kind === "hook") {
    return renderHookMarkdown(artifact);
  }
  if (artifact.kind === "subagent") {
    return renderSubAgentMarkdown(artifact);
  }
  return `## Tool hint: ${artifact.name}\n\n${artifact.content}`;
}

export function primaryMemoryPath(agent: AgentKind): string {
  if (agent === "claude") return "CLAUDE.md";
  return "AGENTS.md";
}

export function agentArtifactPathHints(agent: AgentKind): string {
  const lines: string[] = [];
  switch (agent) {
    case "cursor":
      lines.push(
        "Cursor: .cursor/rules/*.mdc, ~/.cursor/skills/*/SKILL.md, .cursor/hooks/*.md, .cursor/agents/*.md",
      );
      break;
    case "claude":
      lines.push("Claude Code: CLAUDE.md, .claude/rules/*.md, .claude/skills/*/SKILL.md");
      break;
    case "pi":
      lines.push("Pi: AGENTS.md, .pi/skills/*/SKILL.md");
      break;
    case "opencode":
      lines.push("OpenCode: AGENTS.md, .opencode/rules/*.md, .opencode/skills/*/SKILL.md");
      break;
  }
  lines.push("Universal: AGENTS.md, design.md, docs/context/*.md");
  return lines.join("\n");
}

export function normalizeArtifactForAgent(
  agent: AgentKind,
  artifact: GeneratedArtifact,
): GeneratedArtifact {
  return {
    ...artifact,
    rendered: renderArtifactBodyForAgent(agent, artifact),
  };
}
