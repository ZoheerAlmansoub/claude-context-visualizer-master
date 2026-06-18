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

export function buildPromptImprovementPrompt(
  originalText: string,
  context: { turn: number; priorUserMessages: string[] },
  locale: "ar" | "en" = "en",
): { system: string; user: string } {
  const lang = locale === "ar" ? "Arabic" : "English";
  const prior =
    context.priorUserMessages.length > 0
      ? context.priorUserMessages.map((m, i) => `${i + 1}. ${m.slice(0, 1500)}`).join("\n")
      : "(none)";

  const system = `You are an expert prompt engineer for AI coding agents (Claude Code, Cursor, Pi, etc.).
The user wrote a prompt that produced suboptimal agent behavior. Rewrite it into a production-grade agent prompt.

Respond ONLY with valid JSON (no markdown fences):
{
  "improvedPrompt": "the full rewritten prompt the user should paste to the agent",
  "rationale": "2-4 sentences explaining what was wrong and why the rewrite works better",
  "issues": ["specific problem 1", "specific problem 2"],
  "tips": ["actionable tip for future prompts", "another tip"]
}

Rules for improvedPrompt:
- Be specific: scope, files, constraints, acceptance criteria, tech stack when relevant
- One clear objective per prompt; split multi-asks into numbered steps
- State what NOT to do if the original caused loops or scope creep
- Prefer imperative, testable language ("implement X with Y", "verify Z before continuing")
- Keep the user's language (${lang}) and intent; do not invent requirements they didn't imply
- Length: concise but complete (typically 100-400 words for complex tasks)`;

  const user = `Turn ${context.turn} user message to improve:

---
${originalText.slice(0, 12_000)}
---

Earlier user messages in this session (for context only):
${prior}

Improve this prompt so the agent would deliver better results on the first attempt.`;
  return { system, user };
}

export function formatPromptImprovementMarkdown(data: {
  improvedPrompt: string;
  rationale: string;
  issues: string[];
  tips: string[];
  originalText: string;
  turn: number;
  locale: "ar" | "en";
}): string {
  const isAr = data.locale === "ar";
  const h = (en: string, ar: string) => (isAr ? ar : en);
  const lines = [
    `## ${h("Improved prompt", "المطالبة المحسّنة")} (Turn ${data.turn})`,
    "",
    data.improvedPrompt,
    "",
    `## ${h("Why this works better", "لماذا هذا أفضل")}`,
    "",
    data.rationale,
  ];
  if (data.issues.length) {
    lines.push("", `## ${h("Issues in original", "مشاكل في النسخة الأصلية")}`, "");
    for (const issue of data.issues) lines.push(`- ${issue}`);
  }
  if (data.tips.length) {
    lines.push("", `## ${h("Tips for next time", "نصائح للمرات القادمة")}`, "");
    for (const tip of data.tips) lines.push(`- ${tip}`);
  }
  lines.push("", `---`, "", `### ${h("Original", "الأصلية")}`, "", data.originalText.slice(0, 4000));
  return lines.join("\n");
}
