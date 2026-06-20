import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentKind, GeneratedArtifact } from "../types.ts";
import {
  defaultArtifactRelativePath,
  agentArtifactPathHints as sharedAgentArtifactPathHints,
  primaryMemoryPath as sharedPrimaryMemoryPath,
} from "../../shared/artifact-paths.ts";
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

export function defaultArtifactTarget(
  agent: AgentKind,
  artifact: GeneratedArtifact,
): ArtifactTarget {
  const relativePath = defaultArtifactRelativePath(agent, artifact);
  const scope: ArtifactTarget["scope"] =
    agent === "cursor" && artifact.kind === "skill" && relativePath.startsWith("~/")
      ? "user"
      : "project";
  return { relativePath, scope };
}

export function resolveArtifactAbsolutePath(
  agent: AgentKind,
  target: ArtifactTarget,
  projectRoot: string,
): string {
  const rel = target.relativePath.replace(/\\/g, "/");
  if (target.scope === "user" && rel.startsWith("~/")) {
    return join(homedir(), rel.slice(2));
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
  return sharedPrimaryMemoryPath(agent);
}

export function agentArtifactPathHints(agent: AgentKind): string {
  return sharedAgentArtifactPathHints(agent);
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
