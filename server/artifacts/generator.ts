import type { GeneratedArtifact, SessionTranscript, LlmProviderKind } from "../types.ts";
import { detectSessionPatterns } from "../insights/pattern-detector.ts";
import { buildArtifactPrompt } from "../llm/prompts.ts";
import { getProvider, resolveModel } from "../llm/router.ts";

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

export function renderArtifactBody(artifact: GeneratedArtifact): string {
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

function heuristicArtifacts(transcript: SessionTranscript): GeneratedArtifact[] {
  const patterns = detectSessionPatterns(transcript);
  return patterns
    .filter((p) => p.count >= 2)
    .slice(0, 5)
    .map((p) => ({
      kind: p.suggestedArtifact?.kind ?? ("rule" as const),
      name: p.label.replace(/\s+/g, "-").slice(0, 40),
      description: p.description,
      trigger: `When ${p.kind} pattern detected`,
      content: p.recommendation,
      rendered: "",
      sourceTurns: [],
      confidence: p.count >= 4 ? ("high" as const) : ("medium" as const),
    }))
    .map((a) => ({
      ...a,
      rendered: renderArtifactBody(a),
    }));
}

export async function generateArtifacts(
  transcript: SessionTranscript,
  opts: {
    useLlm?: boolean;
    provider?: LlmProviderKind;
    model?: string;
    locale?: "ar" | "en";
  } = {},
): Promise<GeneratedArtifact[]> {
  const heuristic = heuristicArtifacts(transcript);
  if (!opts.useLlm) return heuristic;

  try {
    const patterns = detectSessionPatterns(transcript)
      .map((p) => `${p.label}: ${p.count}x — ${p.recommendation}`)
      .join("\n");
    const { system, user } = buildArtifactPrompt(
      { userMessages: transcript.userMessages.aggregatedText, patterns },
      opts.locale ?? "en",
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
      rendered: renderArtifactBody(a),
    }));
  } catch {
    return heuristic;
  }
}
