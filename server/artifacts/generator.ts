import type { GeneratedArtifact, SessionTranscript, LlmProviderKind, AgentKind } from "../types.ts";
import { detectSessionPatterns } from "../insights/pattern-detector.ts";
import { buildArtifactPrompt } from "../llm/prompts.ts";
import { getProvider, resolveModel } from "../llm/router.ts";
import {
  renderArtifactBodyForAgent,
} from "./agent-registry.ts";
import { enrichPatternWithArtifact } from "./templates.ts";

export function renderSkillMarkdown(artifact: GeneratedArtifact): string {
  const slug = artifact.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `---
name: ${slug}
description: ${artifact.description}
---

# ${artifact.name}

${artifact.content}
`;
}

export function renderRuleMdc(artifact: GeneratedArtifact, globs?: string): string {
  const alwaysApply = !globs;
  return `---
description: ${artifact.description}
alwaysApply: ${alwaysApply}
${globs ? `globs: ${globs}` : ""}
---

${artifact.content}
`;
}

export function renderHookMarkdown(artifact: GeneratedArtifact): string {
  return `# Hook: ${artifact.name}

**Trigger:** ${artifact.trigger}

${artifact.description}

\`\`\`
${artifact.content}
\`\`\`
`;
}

export function renderSubAgentMarkdown(artifact: GeneratedArtifact): string {
  return `# Sub-agent: ${artifact.name}

**Trigger:** ${artifact.trigger}

${artifact.description}

${artifact.content}
`;
}

export function renderArtifactBody(artifact: GeneratedArtifact, agent: AgentKind = "cursor"): string {
  return renderArtifactBodyForAgent(agent, artifact);
}

function heuristicArtifacts(transcript: SessionTranscript, agent: AgentKind): GeneratedArtifact[] {
  const patterns = detectSessionPatterns(transcript);
  return patterns
    .filter((p) => p.count >= 2)
    .slice(0, 5)
    .map((p) => {
      const enriched = enrichPatternWithArtifact(p, agent);
      const base = enriched.suggestedArtifact;
      return {
        kind: base?.kind ?? ("rule" as const),
        name: base?.name ?? p.label.replace(/\s+/g, "-").slice(0, 40),
        description: p.description,
        trigger: base?.trigger ?? `When ${p.kind} pattern detected`,
        content: base?.content ?? p.recommendation,
        rendered: "",
        sourceTurns: [],
        confidence: p.count >= 4 ? ("high" as const) : ("medium" as const),
      };
    })
    .map((a) => ({
      ...a,
      rendered: renderArtifactBodyForAgent(agent, a),
    }));
}

export async function generateArtifacts(
  transcript: SessionTranscript,
  opts: {
    useLlm?: boolean;
    provider?: LlmProviderKind;
    model?: string;
    locale?: "ar" | "en";
    agent?: AgentKind;
  } = {},
): Promise<GeneratedArtifact[]> {
  const agent = opts.agent ?? transcript.agent;
  const heuristic = heuristicArtifacts(transcript, agent);
  if (!opts.useLlm) return heuristic;

  try {
    const patterns = detectSessionPatterns(transcript)
      .map((p) => `${p.label}: ${p.count}x — ${p.recommendation}`)
      .join("\n");
    const { system, user } = buildArtifactPrompt(
      { userMessages: transcript.userMessages.aggregatedText, patterns },
      opts.locale ?? "en",
      agent,
    );
    const provider = opts.provider ?? "anthropic";
    const model = resolveModel(provider, opts.model);
    const llm = getProvider(provider);
    const response = await llm.complete({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      maxTokens: 4096,
    });

    const jsonMatch = response.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return heuristic;
    const parsed = JSON.parse(jsonMatch[0]) as GeneratedArtifact[];
    return parsed.map((a) => ({
      ...a,
      rendered: renderArtifactBodyForAgent(agent, a),
    }));
  } catch {
    return heuristic;
  }
}
