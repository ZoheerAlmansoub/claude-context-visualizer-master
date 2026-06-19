import type { AnalyzeType, RecurringPattern, UserMessageStats } from "../types.ts";

export type AnalysisTranscriptContext = {
  userMessages: string;
  conversation: string;
  toolSummary: string;
  tokenStats: string;
  loopEvidence: string;
  patterns: RecurringPattern[];
  compactionBoundaryIndex: number | null;
  userMessageStats: UserMessageStats;
  warnings: string[];
};

const STRUCTURED_TYPES: AnalyzeType[] = [
  "token-audit",
  "loop-diagnosis",
  "tool-hardening",
  "artifact-blueprint",
  "memory-file-drafts",
  "agent-orchestration",
];

export function isStructuredAnalysisType(type: AnalyzeType): boolean {
  return STRUCTURED_TYPES.includes(type);
}

function sessionMetaBlock(ctx: AnalysisTranscriptContext): string {
  const lines = [
    "## Session metadata",
    `- User messages: ${ctx.userMessageStats.visibleCount} visible / ${ctx.userMessageStats.totalCount} total`,
    `- Compaction boundary: ${ctx.compactionBoundaryIndex != null ? `turn index ${ctx.compactionBoundaryIndex}` : "none"}`,
  ];
  if (ctx.warnings.length) {
    lines.push(`- Warnings: ${ctx.warnings.join("; ")}`);
  }
  if (ctx.patterns.length) {
    lines.push("", "## Detected patterns (heuristic)", "");
    for (const p of ctx.patterns) {
      lines.push(
        `- **${p.label}** (${p.count}x): ${p.description}. Recommendation: ${p.recommendation}${
          p.estimatedTokenWaste ? ` [~${p.estimatedTokenWaste} tok waste]` : ""
        }`,
      );
    }
  }
  return lines.join("\n");
}

function structuredSystemPrompt(type: AnalyzeType, lang: string): string {
  if (type === "memory-file-drafts") {
    return `You are an expert at drafting persistent PROJECT MEMORY files for AI coding agents.
Respond ONLY with valid JSON (no markdown fences). Use ${lang} for all string values.

This task is ONLY for memory/context documentation — NOT Cursor rules (.mdc), skills (SKILL.md), hooks, or tool-hints.
If the session needs enforceable rules or skills, do NOT put them here; memory files hold durable facts, preferences, and project context.

Critical rules:
- Ground every file in session evidence: cite turns, user requests, and decisions from the context below.
- Do NOT invent project facts not supported by the transcript.
- Write file bodies as project memory (overview, stack, conventions, domain knowledge) — not trigger-based rules.
- Prefer canonical repo memory paths over many new files.`;
  }

  if (type === "artifact-blueprint") {
    return `You are an expert at designing Cursor agent artifacts (skills, rules, hooks, sub-agents).
Respond ONLY with valid JSON (no markdown fences). Use ${lang} for all string values.

Critical rules:
- Ground every artifact in session evidence: cite turn numbers, tool names, and patterns from the context below.
- Do NOT invent problems not supported by the transcript or detected patterns.
- Prefer high-confidence items that prevent repeated mistakes or encode user preferences.
- Do NOT output AGENTS.md, CLAUDE.md, or design.md here — those belong in memory-file-drafts analysis.`;
  }

  return `You are an expert AI agent session analyst specializing in context optimization, loop prevention, and agent artifact design.
Respond ONLY with valid JSON (no markdown fences). Use ${lang} for all string values.

Critical rules:
- Ground every finding in session evidence: cite turn numbers, tool names, and patterns from the context below.
- Do NOT invent problems not supported by the transcript or detected patterns.
- Prioritize items that prevent repeated mistakes and reduce token waste.
- When heuristic patterns are listed, address each relevant one explicitly.
- Prefer high-confidence recommendations backed by multiple occurrences.`;
}

export function buildAnalysisPrompt(
  type: AnalyzeType,
  transcript: AnalysisTranscriptContext,
  locale: "ar" | "en" = "en",
): { system: string; user: string } {
  const lang = locale === "ar" ? "Arabic" : "English";
  const structured = isStructuredAnalysisType(type);

  const system = structured ? structuredSystemPrompt(type, lang) : `You are an expert AI agent session analyst. Respond in ${lang} using clear markdown. Be concise and actionable. Ground claims in session evidence.`;

  const context = [
    sessionMetaBlock(transcript),
    transcript.tokenStats,
    transcript.loopEvidence,
    "## User messages",
    transcript.userMessages,
    "## Conversation (user + assistant)",
    transcript.conversation,
    "## Tool events summary",
    transcript.toolSummary,
  ]
    .filter(Boolean)
    .join("\n\n");

  const markdownPrompts: Partial<Record<AnalyzeType, string>> = {
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

    "agentic-lessons": `Write an educational agentic engineering report from this session:
- 3–5 principles extracted (orchestration, state, failure recovery)
- Anti-patterns observed and a better pattern for each
- What to practice next for building agent systems and automation
- Recommended reading or practices (no invented citations)`,
  };

  const jsonPrompts: Partial<Record<AnalyzeType, string>> = {
    "token-audit": `Audit token/context waste in this session. Respond with JSON:
{
  "summary": "2-4 sentence overview",
  "wasteItems": [
    {
      "source": "reads|tool_results|thinking|attachments|retries|other",
      "description": "what wasted context",
      "estimatedImpact": "low|medium|high",
      "recommendation": "specific fix",
      "turns": [1, 2]
    }
  ]
}
Include top waste sources, duplications (same file/grep), and savings tactics (semantic search, batch reads, summarize-before-inject).
Use token statistics and heuristic patterns as quantitative anchors. Include at least 3 wasteItems when evidence exists.`,

    "loop-diagnosis": `Diagnose retry/loop patterns in tool usage. Respond with JSON:
{
  "summary": "overview of loops found",
  "preventionRules": [
    {
      "kind": "rule",
      "name": "short-name",
      "description": "what this prevents",
      "trigger": "when to apply",
      "content": "full rule text for .mdc file",
      "sourceTurns": [1],
      "confidence": "high|medium|low"
    }
  ]
}
For each loop: trigger → attempts → failure mode → root cause → stop condition.
Include at least one preventionRule per detected loop/error pattern. Rules must be copy-paste ready for .cursor/rules/*.mdc.`,

    "tool-hardening": `Harden tools against repeated failures. Respond with JSON:
{
  "summary": "overview",
  "toolHints": [
    {
      "kind": "tool-hint",
      "name": "ToolName-hardening",
      "description": "failure signature and fix",
      "trigger": "before calling this tool",
      "content": "pre-checks, safe retry policy, common error fixes",
      "sourceTurns": [],
      "confidence": "high|medium|low"
    }
  ]
}
One entry per tool with repeated errors. Include rules entries where a persistent .mdc rule is better.
Address every tool with 2+ errors in the session.`,

    "artifact-blueprint": `Propose Cursor agent artifacts from this session. Respond with JSON:
{
  "summary": "overview",
  "artifacts": [
    {
      "kind": "skill|rule|tool-hint|hook|subagent",
      "name": "name",
      "description": "purpose",
      "trigger": "when to use",
      "content": "full artifact body",
      "sourceTurns": [],
      "confidence": "high|medium|low"
    }
  ]
}
Prioritize high-confidence items that prevent repeated mistakes or encode user preferences.
Limit to 8 artifacts max; quality over quantity.`,

    "memory-file-drafts": `Draft persistent MEMORY / CONTEXT files so future agents inherit this session's knowledge. Respond with JSON:
{
  "summary": "what durable context should persist beyond this session",
  "files": [
    {
      "path": "AGENTS.md",
      "purpose": "why this memory file exists",
      "action": "create|update|append",
      "rationale": "session evidence (turns, user requests, decisions)",
      "content": "complete markdown file body ready to save"
    }
  ]
}

ALLOWED paths (memory/context only):
- AGENTS.md or .cursor/AGENTS.md — repo-wide agent instructions & project overview
- CLAUDE.md or claude.md — Cursor/Claude session context & coding conventions
- design.md or docs/design.md — architecture & design decisions
- docs/context/*.md — domain glossary, modules, business rules learned in session

FORBIDDEN in this analysis (use artifact-blueprint or loop-diagnosis instead):
- .cursor/rules/*.mdc (Cursor rules)
- **/SKILL.md (agent skills)
- hook configs, tool-hint files, sub-agent specs

Each content field must be complete markdown project memory — overview, stack, key paths, user preferences, decisions, open questions.
NOT enforceable rules with triggers. Limit to 4 files; prefer updating canonical files over inventing new paths.`,

    "agent-orchestration": `Design multi-agent orchestration for similar future work. Respond with JSON:
{
  "summary": "when single agent vs multi-agent",
  "whenSwarm": "conditions for swarm/parallel sub-agents",
  "agents": [
    {
      "name": "agent-name",
      "role": "specialist role",
      "whenToUse": "delegation trigger",
      "contextBudget": "what context this agent needs",
      "handoffPoints": "what to pass back",
      "tools": ["tool1", "tool2"],
      "confidence": "high|medium|low"
    }
  ]
}`,
  };

  const instruction = structured ? jsonPrompts[type]! : markdownPrompts[type]!;

  return {
    system,
    user: `${instruction}\n\n---\n\n${context}`,
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
