import type { AnalyzeType } from "../types.ts";

export function buildAnalysisPrompt(
  type: AnalyzeType,
  transcript: {
    userMessages: string;
    conversation: string;
    toolSummary: string;
  },
  locale: "ar" | "en" = "en",
): { system: string; user: string } {
  const lang = locale === "ar" ? "Arabic" : "English";
  const system = `You are an expert AI agent session analyst. Respond in ${lang} using clear markdown. Be concise and actionable.`;

  const context = [
    "## User messages",
    transcript.userMessages,
    "## Conversation (user + assistant)",
    transcript.conversation.slice(0, 80_000),
    "## Tool events summary",
    transcript.toolSummary,
  ].join("\n\n");

  const prompts: Record<AnalyzeType, string> = {
    summarize: `Summarize this agent session:
- User goals and constraints
- Key decisions made
- Final outcome / status
- Top 3 actionable takeaways`,

    "intent-map": `Build an intent map for this session:
- List each distinct user intent (numbered)
- First principles behind each intent
- Dependencies between intents
- Unresolved intents`,

    "experience-extract": `Extract experiential knowledge from USER messages only:
- Recurring preferences (how the user likes work done)
- Domain expertise signals
- Anti-patterns (what frustrated the user)
- Suggested persistent rules for future agents`,

    "session-review": `Review this agent session critically:
- What the agent did well
- Failures, loops, wasted tool calls
- Token/context waste sources
- Concrete recommendations to improve future sessions`,
  };

  return {
    system,
    user: `${prompts[type]}\n\n---\n\n${context}`,
  };
}

export function buildArtifactPrompt(
  transcript: { userMessages: string; patterns: string },
  locale: "ar" | "en" = "en",
): { system: string; user: string } {
  const lang = locale === "ar" ? "Arabic" : "English";
  return {
    system: `You generate Cursor agent skills and rules from session analysis. Respond ONLY with valid JSON array. Each item: { "kind": "skill"|"rule"|"tool-hint", "name": string, "description": string, "trigger": string, "content": string, "sourceTurns": number[], "confidence": "high"|"medium"|"low" }. Use ${lang} for description/trigger/content.`,
    user: `Based on these user messages and detected patterns, suggest skills, rules, and tool hints:\n\n${transcript.userMessages.slice(0, 60_000)}\n\nPatterns:\n${transcript.patterns}`,
  };
}
