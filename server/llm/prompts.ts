import type { AnalyzeType, RecurringPattern, UserMessageStats, AgentKind } from "../types.ts";
import { agentArtifactPathHints } from "../artifacts/agent-registry.ts";

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
  projectContext?: string;
  agentKind?: AgentKind;
  crossSessionPatterns?: string;
};

const STRUCTURED_TYPES: AnalyzeType[] = [
  "token-audit",
  "loop-diagnosis",
  "tool-hardening",
  "artifact-blueprint",
  "memory-file-drafts",
  "agent-orchestration",
  "project-health-report",
  "user-ai-fluency",
  "user-growth-plan",
  "memory-diff",
  "rule-dedup",
  "compaction-recovery",
  "mcp-tool-audit",
  "project-synthesis",
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
  if (type === "artifact-blueprint") {
    const agent = transcript.agentKind ?? "cursor";
    return `You are an expert at designing agent artifacts (skills, rules, hooks, sub-agents) for ${agent}.
Respond ONLY with valid JSON (no markdown fences). Use ${lang} for all string values.

Allowed paths for ${agent}:
${agentArtifactPathHints(agent)}

Critical rules:
- Ground every artifact in session evidence: cite turn numbers, tool names, and patterns from the context below.
- Do NOT invent problems not supported by the transcript or detected patterns.
- Prefer high-confidence items that prevent repeated mistakes or encode user preferences.
- Do NOT output AGENTS.md, CLAUDE.md, or design.md here — those belong in memory-file-drafts analysis.
- When existing project files are listed below, avoid duplicating them — propose merge/update instead.`;
  }

  if (type === "memory-file-drafts") {
    return `You are an expert at drafting persistent PROJECT MEMORY files for AI coding agents.
Respond ONLY with valid JSON (no markdown fences). Use ${lang} for all string values.

This task is ONLY for memory/context documentation — NOT agent rules (.mdc), skills (SKILL.md), hooks, or tool-hints.
When existing project memory files are provided below, prefer action "update" or "append" with content that merges new session knowledge.
Do NOT repeat content already present on disk unless refining it.

Critical rules:
- Ground every file in session evidence: cite turns, user requests, and decisions from the context below.
- Do NOT invent project facts not supported by the transcript or existing files.
- Write file bodies as project memory (overview, stack, conventions, domain knowledge) — not trigger-based rules.
- Prefer canonical repo memory paths over many new files.`;
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
    transcript.projectContext,
    transcript.crossSessionPatterns,
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

    "project-health-report": `Analyze cross-session project health. Respond with JSON:
{
  "summary": "executive overview",
  "healthScore": 0,
  "rootCauses": [
    {
      "id": "slug",
      "category": "tooling|prompting|architecture|workflow|context",
      "title": "short title",
      "impact": "critical|high|medium|low",
      "description": "root cause not symptom",
      "sessionIds": [],
      "estimatedTokenWaste": 0,
      "fixPriority": 1,
      "recommendation": "concrete fix"
    }
  ],
  "openRisks": ["risk1"]
}
Use cross-session patterns and recurring failures. healthScore 0-100.`,

    "user-ai-fluency": `Assess the USER's skill at directing AI coding agents (not the agent's performance). Respond with JSON:
{
  "summary": "overview",
  "overallScore": 0,
  "dimensions": [
    {
      "id": "prompt-clarity|context-discipline|delegation|verification|iteration-control|memory-hygiene|tool-awareness",
      "label": "human label",
      "score": 1,
      "evidence": "why",
      "examples": [{ "turn": 1, "quote": "short quote" }]
    }
  ],
  "strengths": ["strength"],
  "growthAreas": [
    {
      "area": "area name",
      "whyItMatters": "impact",
      "concreteActions": ["action"],
      "suggestedRule": "optional",
      "suggestedSkill": "optional",
      "practiceExercise": "optional"
    }
  ]
}
Score each dimension 1-5. overallScore 0-100. Be constructive, cite user message evidence.`,

    "user-growth-plan": `Create a cross-session growth plan for the user's AI collaboration skills. Respond with JSON:
{
  "summary": "plan overview",
  "overallScore": 0,
  "weeklyPlan": [{ "day": "Mon", "focus": "topic", "task": "practice task" }],
  "growthAreas": [
    {
      "area": "area",
      "whyItMatters": "why",
      "concreteActions": ["action"],
      "suggestedRule": "optional",
      "suggestedSkill": "optional",
      "practiceExercise": "optional"
    }
  ]
}`,

    "memory-diff": `Compare proposed memory updates with existing project files on disk. Respond with JSON:
{
  "summary": "overview",
  "items": [
    {
      "path": "AGENTS.md",
      "action": "create|update|append|skip",
      "existingSummary": "what exists",
      "proposedSummary": "what to add/change",
      "diffPreview": "markdown diff or merged preview",
      "rationale": "session evidence"
    }
  ]
}
Use existing project context section. Prefer append/update over replace when possible.`,

    "rule-dedup": `Propose agent rules/skills avoiding duplication of existing project rules. Respond with JSON:
{
  "summary": "overview",
  "items": [
    {
      "name": "rule-name",
      "proposedPath": ".cursor/rules/name.mdc",
      "existingPath": "optional existing path",
      "action": "create|merge|replace|skip",
      "rationale": "why",
      "content": "full rule body if create/merge/replace"
    }
  ]
}`,

    "compaction-recovery": `Analyze context lost to compaction and propose recovery actions. Respond with JSON:
{
  "summary": "what was likely lost and overall recovery strategy",
  "boundaryTurn": 0,
  "recoveryItems": [
    {
      "priority": "critical|high|medium",
      "action": "concrete recovery step",
      "rationale": "why this matters post-compaction",
      "suggestedMemoryPath": "AGENTS.md or docs/context/session-summary.md",
      "suggestedContent": "optional markdown to persist lost context"
    }
  ]
}
Use compaction boundary metadata and pre/post token stats. Focus on re-injecting decisions, open tasks, and constraints.`,

    "mcp-tool-audit": `Audit MCP and external tool usage in this session. Respond with JSON:
{
  "summary": "overview of MCP/tool health",
  "findings": [
    {
      "toolName": "CallMcpTool or server/tool name",
      "callCount": 0,
      "errorCount": 0,
      "severity": "critical|high|medium|low",
      "pattern": "failure or waste pattern observed",
      "recommendation": "hardening or workflow fix",
      "turns": [1, 2]
    }
  ]
}
Prioritize tools with errors, redundant calls, or schema misuse. Include non-MCP tools only if they dominate failures.`,

    "project-synthesis": `Synthesize this project across multiple sessions. Respond with JSON:
{
  "summary": "executive synthesis of project direction and agent collaboration quality",
  "themes": [
    {
      "id": "slug",
      "title": "theme name",
      "sessions": ["session-id-hints"],
      "summary": "what happened across sessions",
      "status": "active|resolved|blocked"
    }
  ],
  "decisions": [
    {
      "decision": "key decision made",
      "rationale": "why",
      "sessionIds": []
    }
  ],
  "memoryGaps": [
    {
      "path": "AGENTS.md",
      "gap": "what is missing on disk",
      "suggestedAction": "concrete update"
    }
  ],
  "driftWarnings": ["scope creep or inconsistent direction"]
}
Use cross-session patterns, project context on disk, and transcript evidence. Focus on durable knowledge, not session noise.`,
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
