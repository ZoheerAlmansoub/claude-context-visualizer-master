import type {
  AnalysisSource,
  AgentKind,
  ArtifactKind,
  CompactionRecoveryItem,
  FluencyDimension,
  GeneratedArtifact,
  GrowthArea,
  McpToolFinding,
  MemoryDiffItem,
  MemoryFileDraft,
  ProjectTheme,
  ProjectDecision,
  MemoryGap,
  RecurringPattern,
  RootCauseItem,
  RuleDedupItem,
  StructuredAnalysis,
  SubAgentSpec,
  TokenWasteItem,
  ToolEvent,
} from "../types.ts";
import { renderArtifactBodyForAgent } from "../artifacts/agent-registry.ts";
import type { ProjectContextSnapshot } from "../project-context.ts";
import {
  parseJsonObjectRobust,
  partialParseWarning,
  salvageAnalysisObject,
  stripCodeFences,
} from "./json-recovery.ts";

function parseJsonObject(raw: string): Record<string, unknown> {
  return parseJsonObjectRobust(raw);
}

function asConfidence(v: unknown): "high" | "medium" | "low" {
  const s = String(v ?? "medium").toLowerCase();
  if (s === "high" || s === "low") return s;
  return "medium";
}

function asImpact(v: unknown): "low" | "medium" | "high" {
  const s = String(v ?? "medium").toLowerCase();
  if (s === "high" || s === "low") return s;
  return "medium";
}

function asArtifactKind(v: unknown): ArtifactKind {
  const s = String(v ?? "rule").toLowerCase();
  if (s === "skill" || s === "rule" || s === "tool-hint" || s === "hook" || s === "subagent") {
    return s;
  }
  return "rule";
}

function normalizeArtifact(
  raw: Record<string, unknown>,
  agent: AgentKind = "cursor",
): GeneratedArtifact {
  const kind = asArtifactKind(raw.kind);
  const artifact: GeneratedArtifact = {
    kind,
    name: String(raw.name ?? "unnamed").trim(),
    description: String(raw.description ?? "").trim(),
    trigger: String(raw.trigger ?? "").trim(),
    content: String(raw.content ?? "").trim(),
    sourceTurns: Array.isArray(raw.sourceTurns)
      ? raw.sourceTurns.map((n) => Number(n)).filter((n) => !Number.isNaN(n))
      : [],
    confidence: asConfidence(raw.confidence),
  };
  artifact.rendered = renderArtifactBodyForAgent(agent, artifact);
  return artifact;
}

export function renderArtifact(artifact: GeneratedArtifact, agent: AgentKind = "cursor"): string {
  return renderArtifactBodyForAgent(agent, artifact);
}

function normalizeWasteItem(raw: Record<string, unknown>): TokenWasteItem {
  return {
    source: String(raw.source ?? "other"),
    description: String(raw.description ?? "").trim(),
    estimatedImpact: asImpact(raw.estimatedImpact),
    recommendation: String(raw.recommendation ?? "").trim(),
    turns: Array.isArray(raw.turns)
      ? raw.turns.map((n) => Number(n)).filter((n) => !Number.isNaN(n))
      : undefined,
  };
}

function normalizeMemoryFile(raw: Record<string, unknown>): MemoryFileDraft {
  const action = String(raw.action ?? "create").toLowerCase();
  return {
    path: String(raw.path ?? "AGENTS.md").trim(),
    purpose: String(raw.purpose ?? "").trim(),
    action: action === "update" || action === "append" ? action : "create",
    rationale: String(raw.rationale ?? "").trim(),
    content: String(raw.content ?? "").trim(),
  };
}

/** Cursor rules/skills belong in artifact-blueprint — not memory-file-drafts */
export function isDisallowedMemoryPath(path: string): boolean {
  const p = path.replace(/\\/g, "/").trim();
  return (
    /\.cursor\/rules\//i.test(p) ||
    /\.mdc$/i.test(p) ||
    /\/SKILL\.md$/i.test(p) ||
    /(^|\/)SKILL\.md$/i.test(p)
  );
}

function filterMemoryFiles(
  files: MemoryFileDraft[],
  locale: "ar" | "en",
): { files: MemoryFileDraft[]; excluded: number } {
  const kept = files.filter((f) => f.content && !isDisallowedMemoryPath(f.path));
  return { files: kept, excluded: files.length - kept.length };
}

function memoryFilesExcludedWarning(excluded: number, locale: "ar" | "en"): string {
  return locale === "ar"
    ? `تم استبعاد ${excluded} ملفاً (قواعد .mdc أو skills) — هذا التحليل لملفات الذاكرة فقط. استخدم Artifact blueprint للقواعد.`
    : `Excluded ${excluded} item(s) (rules .mdc or skills) — this analysis is for memory files only. Use Artifact blueprint for rules.`;
}

function normalizeSubAgent(raw: Record<string, unknown>): SubAgentSpec {
  return {
    name: String(raw.name ?? "sub-agent").trim(),
    role: String(raw.role ?? "").trim(),
    whenToUse: String(raw.whenToUse ?? "").trim(),
    contextBudget: String(raw.contextBudget ?? "").trim(),
    handoffPoints: String(raw.handoffPoints ?? "").trim(),
    tools: Array.isArray(raw.tools) ? raw.tools.map(String).filter(Boolean) : [],
    confidence: asConfidence(raw.confidence),
  };
}

function normalizeGrowthArea(raw: Record<string, unknown>): GrowthArea {
  return {
    area: String(raw.area ?? "").trim(),
    whyItMatters: String(raw.whyItMatters ?? "").trim(),
    concreteActions: Array.isArray(raw.concreteActions) ? raw.concreteActions.map(String) : [],
    suggestedRule: raw.suggestedRule ? String(raw.suggestedRule) : undefined,
    suggestedSkill: raw.suggestedSkill ? String(raw.suggestedSkill) : undefined,
    practiceExercise: raw.practiceExercise ? String(raw.practiceExercise) : undefined,
  };
}

function normalizeMemoryDiffItem(raw: Record<string, unknown>): MemoryDiffItem {
  const action = String(raw.action ?? "create").toLowerCase();
  return {
    path: String(raw.path ?? "AGENTS.md").trim(),
    action:
      action === "update" || action === "append" || action === "skip" ? action : "create",
    existingSummary: String(raw.existingSummary ?? "").trim(),
    proposedSummary: String(raw.proposedSummary ?? "").trim(),
    diffPreview: String(raw.diffPreview ?? raw.content ?? "").trim(),
    rationale: String(raw.rationale ?? "").trim(),
  };
}

function normalizeRuleDedupItem(raw: Record<string, unknown>, agent: AgentKind = "cursor"): RuleDedupItem {
  const action = String(raw.action ?? "create").toLowerCase();
  const name = String(raw.name ?? "rule").trim();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "rule";
  const defaultPath =
    agent === "cursor"
      ? `.cursor/rules/${slug}.mdc`
      : agent === "claude"
        ? `.claude/rules/${slug}.md`
        : agent === "pi"
          ? `.pi/rules/${slug}.md`
          : `.opencode/rules/${slug}.md`;
  return {
    name,
    proposedPath: String(raw.proposedPath ?? defaultPath).trim(),
    existingPath: raw.existingPath ? String(raw.existingPath) : undefined,
    action:
      action === "merge" || action === "replace" || action === "skip" ? action : "create",
    rationale: String(raw.rationale ?? "").trim(),
    content: String(raw.content ?? "").trim(),
  };
}

function h(en: string, ar: string, locale: "ar" | "en"): string {
  return locale === "ar" ? ar : en;
}

export function formatStructuredAnalysisMarkdown(
  structured: StructuredAnalysis,
  locale: "ar" | "en",
): string {
  const lines: string[] = [];

  switch (structured.kind) {
    case "token-audit": {
      lines.push(`## ${h("Summary", "الملخص", locale)}`, "", structured.summary, "");
      if (structured.wasteItems.length) {
        lines.push(`## ${h("Token waste items", "مصارف التوكنز", locale)}`, "");
        lines.push(
          `| ${h("Source", "المصدر", locale)} | ${h("Impact", "التأثير", locale)} | ${h("Description", "الوصف", locale)} | ${h("Recommendation", "التوصية", locale)} |`,
          "|---|---|---|---|",
        );
        for (const w of structured.wasteItems) {
          lines.push(
            `| ${w.source} | ${w.estimatedImpact} | ${w.description} | ${w.recommendation} |`,
          );
        }
      }
      break;
    }
    case "prevention-rules":
    case "artifacts": {
      const items = structured.kind === "prevention-rules" ? structured.rules : structured.items;
      lines.push(`## ${h("Summary", "الملخص", locale)}`, "", structured.summary, "");
      for (const a of items) {
        lines.push(
          "",
          `### ${a.name} (${a.kind}, ${a.confidence})`,
          "",
          `**${h("Trigger", "المُشغّل", locale)}:** ${a.trigger}`,
          "",
          a.description,
          "",
          "```",
          a.rendered ?? a.content,
          "```",
        );
      }
      break;
    }
    case "memory-files": {
      lines.push(`## ${h("Summary", "الملخص", locale)}`, "", structured.summary, "");
      for (const f of structured.files) {
        lines.push(
          "",
          `### ${f.path} (${f.action})`,
          "",
          `**${h("Purpose", "الغرض", locale)}:** ${f.purpose}`,
          "",
          f.rationale,
          "",
          "```markdown",
          f.content,
          "```",
        );
      }
      break;
    }
    case "orchestration": {
      lines.push(
        `## ${h("Summary", "الملخص", locale)}`,
        "",
        structured.summary,
        "",
        `## ${h("When to use swarm", "متى تستخدم swarm", locale)}`,
        "",
        structured.whenSwarm,
        "",
      );
      for (const a of structured.agents) {
        lines.push(
          `### ${a.name} (${a.confidence})`,
          "",
          `- **${h("Role", "الدور", locale)}:** ${a.role}`,
          `- **${h("When", "متى", locale)}:** ${a.whenToUse}`,
          `- **${h("Context", "السياق", locale)}:** ${a.contextBudget}`,
          `- **${h("Handoff", "التسليم", locale)}:** ${a.handoffPoints}`,
          `- **${h("Tools", "الأدوات", locale)}:** ${a.tools.join(", ") || "—"}`,
          "",
        );
      }
      break;
    }
    case "project-health": {
      lines.push(
        `## ${h("Summary", "الملخص", locale)}`,
        "",
        structured.summary,
        "",
        `**${h("Health score", "درجة الصحة", locale)}:** ${structured.healthScore}/100`,
        "",
      );
      if (structured.openRisks.length) {
        lines.push(`## ${h("Open risks", "مخاطر مفتوحة", locale)}`, "");
        for (const r of structured.openRisks) lines.push(`- ${r}`);
      }
      if (structured.rootCauses.length) {
        lines.push("", `## ${h("Root causes", "أسباب جذرية", locale)}`, "");
        for (const rc of structured.rootCauses) {
          lines.push(
            `### ${rc.title} (${rc.impact}, priority ${rc.fixPriority})`,
            "",
            rc.description,
            "",
            `**${h("Recommendation", "التوصية", locale)}:** ${rc.recommendation}`,
            "",
          );
        }
      }
      break;
    }
    case "user-fluency":
    case "user-growth": {
      lines.push(
        `## ${h("Summary", "الملخص", locale)}`,
        "",
        structured.summary,
        "",
        `**${h("Overall score", "الدرجة الإجمالية", locale)}:** ${structured.overallScore}/100`,
        "",
      );
      if (structured.kind === "user-growth" && structured.weeklyPlan.length) {
        lines.push(`## ${h("Weekly plan", "الخطة الأسبوعية", locale)}`, "");
        for (const d of structured.weeklyPlan) {
          lines.push(`- **${d.day}** — ${d.focus}: ${d.task}`);
        }
      }
      if (structured.kind === "user-fluency" && structured.strengths.length) {
        lines.push("", `## ${h("Strengths", "نقاط القوة", locale)}`, "");
        for (const s of structured.strengths) lines.push(`- ${s}`);
      }
      if (structured.growthAreas.length) {
        lines.push("", `## ${h("Growth areas", "مجالات النمو", locale)}`, "");
        for (const g of structured.growthAreas) {
          lines.push(`### ${g.area}`, "", g.whyItMatters, "");
          for (const a of g.concreteActions) lines.push(`- ${a}`);
          if (g.suggestedRule) {
            lines.push("", `**${h("Suggested rule", "قاعدة مقترحة", locale)}:** ${g.suggestedRule}`);
          }
          if (g.suggestedSkill) {
            lines.push(`**${h("Suggested skill", "مهارة مقترحة", locale)}:** ${g.suggestedSkill}`);
          }
          if (g.practiceExercise) {
            lines.push("", `**${h("Practice", "تمرين", locale)}:** ${g.practiceExercise}`);
          }
          lines.push("");
        }
      }
      break;
    }
    case "memory-diff": {
      lines.push(`## ${h("Summary", "الملخص", locale)}`, "", structured.summary, "");
      for (const item of structured.items) {
        lines.push(
          "",
          `### ${item.path} (${item.action})`,
          "",
          item.rationale,
          "",
          "```diff",
          item.diffPreview,
          "```",
        );
      }
      break;
    }
    case "rule-dedup": {
      lines.push(`## ${h("Summary", "الملخص", locale)}`, "", structured.summary, "");
      for (const item of structured.items) {
        lines.push(
          "",
          `### ${item.name} → ${item.proposedPath} (${item.action})`,
          "",
          item.rationale,
        );
      }
      break;
    }
    case "compaction-recovery": {
      lines.push(`## ${h("Summary", "الملخص", locale)}`, "", structured.summary, "");
      if (structured.boundaryTurn != null) {
        lines.push("", `**${h("Boundary turn", "نقطة compaction", locale)}:** ${structured.boundaryTurn}`);
      }
      for (const item of structured.recoveryItems) {
        lines.push("", `### [${item.priority}] ${item.action}`, "", item.rationale);
      }
      break;
    }
    case "mcp-tool-audit": {
      lines.push(`## ${h("Summary", "الملخص", locale)}`, "", structured.summary, "");
      for (const f of structured.findings) {
        lines.push(
          "",
          `### ${f.toolName} (${f.severity})`,
          "",
          `${f.pattern} — ${f.recommendation}`,
          "",
          `Calls: ${f.callCount}, Errors: ${f.errorCount}`,
        );
      }
      break;
    }
    case "project-synthesis": {
      lines.push(`## ${h("Summary", "الملخص", locale)}`, "", structured.summary, "");
      if (structured.themes.length) {
        lines.push("", `## ${h("Themes", "المواضيع", locale)}`, "");
        for (const t of structured.themes) {
          lines.push(`- **${t.title}** (${t.status}): ${t.summary}`);
        }
      }
      if (structured.decisions.length) {
        lines.push("", `## ${h("Decisions", "القرارات", locale)}`, "");
        for (const d of structured.decisions) lines.push(`- ${d.decision}: ${d.rationale}`);
      }
      if (structured.memoryGaps.length) {
        lines.push("", `## ${h("Memory gaps", "فجوات الذاكرة", locale)}`, "");
        for (const g of structured.memoryGaps) lines.push(`- ${g.path}: ${g.gap} → ${g.suggestedAction}`);
      }
      if (structured.driftWarnings.length) {
        lines.push("", `## ${h("Drift warnings", "تحذيرات الانحراف", locale)}`, "");
        for (const w of structured.driftWarnings) lines.push(`- ${w}`);
      }
      break;
    }
  }

  return lines.join("\n");
}

export type ParseAnalysisOptions = {
  agent?: AgentKind;
  projectContext?: ProjectContextSnapshot;
  toolEvents?: ToolEvent[];
  compactionBoundaryIndex?: number | null;
};

function buildHeuristicProjectHealth(
  patterns: RecurringPattern[],
  locale: "ar" | "en",
): StructuredAnalysis {
  const rootCauses: RootCauseItem[] = patterns.slice(0, 8).map((p, i) => ({
    id: p.id,
    category: p.kind.includes("tool") ? "tooling" : p.kind.includes("user") ? "prompting" : "workflow",
    title: p.label,
    impact: p.count >= 5 ? "critical" : p.count >= 3 ? "high" : "medium",
    description: p.description,
    sessionIds: p.sessionIds,
    estimatedTokenWaste: p.estimatedTokenWaste,
    fixPriority: i + 1,
    recommendation: p.recommendation,
  }));
  const waste = patterns.reduce((s, p) => s + (p.estimatedTokenWaste ?? 0), 0);
  const healthScore = Math.max(10, 100 - rootCauses.length * 8 - Math.min(40, Math.floor(waste / 5000)));
  return {
    kind: "project-health",
    summary:
      locale === "ar"
        ? `تحليل heuristic: ${rootCauses.length} سبب جذري عبر الجلسات.`
        : `Heuristic analysis: ${rootCauses.length} cross-session root cause(s).`,
    healthScore,
    rootCauses,
    openRisks: patterns.filter((p) => p.count >= 3).map((p) => p.label),
  };
}

function buildHeuristicMemoryDiff(
  projectContext: ProjectContextSnapshot | undefined,
  locale: "ar" | "en",
): StructuredAnalysis | undefined {
  if (!projectContext?.files.length) return undefined;
  const items: MemoryDiffItem[] = projectContext.files
    .filter((f) => /\.md$/i.test(f.relativePath) && !f.relativePath.includes("/rules/"))
    .slice(0, 4)
    .map((f) => ({
      path: f.relativePath,
      action: "skip" as const,
      existingSummary: f.content.slice(0, 200).replace(/\s+/g, " "),
      proposedSummary: locale === "ar" ? "لا تغييرات مقترحة (heuristic)" : "No proposed changes (heuristic)",
      diffPreview: f.content.slice(0, 500),
      rationale:
        locale === "ar"
          ? "ملف موجود على القرص — راجع session analysis لتحديثات مقترحة."
          : "File exists on disk — run memory-file-drafts for proposed updates.",
    }));
  if (!items.length) return undefined;
  return {
    kind: "memory-diff",
    summary:
      locale === "ar"
        ? "ملخص diff heuristic لملفات الذاكرة الموجودة."
        : "Heuristic diff summary for existing memory files.",
    items,
  };
}

function buildHeuristicRuleDedup(
  patterns: RecurringPattern[],
  projectContext: ProjectContextSnapshot | undefined,
  agent: AgentKind,
  locale: "ar" | "en",
): StructuredAnalysis | undefined {
  const existingRules = projectContext?.files.filter((f) => /rules.*\.(mdc|md)$/i.test(f.relativePath)) ?? [];
  const items: RuleDedupItem[] = patterns.slice(0, 5).map((p) => {
    const slug = p.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30);
    const proposedPath =
      agent === "cursor"
        ? `.cursor/rules/${slug}.mdc`
        : agent === "claude"
          ? `.claude/rules/${slug}.md`
          : agent === "pi"
            ? `.pi/rules/${slug}.md`
            : `.opencode/rules/${slug}.md`;
    const match = existingRules.find((r) => r.relativePath.includes(slug));
    return {
      name: slug,
      proposedPath,
      existingPath: match?.relativePath,
      action: match ? "skip" : "create",
      rationale: p.recommendation,
      content: p.recommendation,
    };
  });
  if (!items.length) return undefined;
  return {
    kind: "rule-dedup",
    summary:
      locale === "ar"
        ? "اقتراحات dedup heuristic مقارنة بالقواعد الموجودة."
        : "Heuristic rule dedup suggestions vs existing project rules.",
    items,
  };
}

function buildHeuristicCompactionRecovery(
  patterns: RecurringPattern[],
  locale: "ar" | "en",
  boundaryTurn?: number | null,
): StructuredAnalysis | undefined {
  const hasCompaction =
    boundaryTurn != null || patterns.some((p) => p.kind === "compaction_pressure");
  if (!hasCompaction) return undefined;

  const recoveryItems: CompactionRecoveryItem[] = [
    {
      priority: "critical",
      action:
        locale === "ar"
          ? "أعد حقن القرارات والمهام المفتوحة في AGENTS.md أو docs/context/"
          : "Re-inject decisions and open tasks into AGENTS.md or docs/context/",
      rationale:
        locale === "ar"
          ? "Compaction أزال سياق ما قبل الحد — لا يُعاد تلقائياً"
          : "Compaction removed pre-boundary context — it is not restored automatically",
      suggestedMemoryPath: "docs/context/compaction-recovery.md",
    },
    {
      priority: "high",
      action:
        locale === "ar"
          ? "قسّم المهام الكبيرة قبل ضغط السياق"
          : "Split large tasks before context pressure triggers compaction",
      rationale:
        locale === "ar"
          ? "يقلل فقدان السياق في الجلسات الطويلة"
          : "Reduces context loss in long sessions",
    },
  ];

  for (const p of patterns.filter((x) => x.kind === "compaction_pressure")) {
    recoveryItems.push({
      priority: "medium",
      action: p.recommendation,
      rationale: p.description,
    });
  }

  return {
    kind: "compaction-recovery",
    summary:
      locale === "ar"
        ? "خطة استرداد heuristic بعد compaction."
        : "Heuristic compaction recovery plan.",
    boundaryTurn: boundaryTurn ?? undefined,
    recoveryItems,
  };
}

function buildHeuristicMemoryDrafts(
  patterns: RecurringPattern[],
  projectContext: ProjectContextSnapshot | undefined,
  agent: AgentKind,
  locale: "ar" | "en",
): StructuredAnalysis | undefined {
  if (!patterns.length) return undefined;
  const memoryPath = agent === "claude" ? "CLAUDE.md" : "AGENTS.md";
  const existing = projectContext?.files.find(
    (f) => f.relativePath.replace(/\\/g, "/").toLowerCase() === memoryPath.toLowerCase(),
  );
  const lines = patterns.slice(0, 6).map(
    (p) => `- **${p.label}** (×${p.count}): ${p.recommendation}`,
  );
  const content = [
    "# Project memory",
    "",
    "## Cross-session patterns",
    "",
    ...lines,
    "",
    "## Notes",
    "",
    locale === "ar"
      ? "مسودة heuristic — راجع ودمج مع الملف الحالي قبل الحفظ."
      : "Heuristic draft — review and merge with existing file before saving.",
  ].join("\n");

  return {
    kind: "memory-files",
    summary:
      locale === "ar"
        ? "مسودة ذاكرة heuristic من أنماط الجلسة."
        : "Heuristic memory draft from session patterns.",
    files: [
      {
        path: memoryPath,
        purpose: "Cross-session learnings and recurring fixes",
        action: existing ? "append" : "create",
        rationale: patterns
          .slice(0, 3)
          .map((p) => p.label)
          .join("; "),
        content,
      },
    ],
  };
}

function buildHeuristicMcpToolAudit(
  toolEvents: ToolEvent[] | undefined,
  locale: "ar" | "en",
): StructuredAnalysis | undefined {
  if (!toolEvents?.length) return undefined;

  const isMcpLike = (t: ToolEvent) =>
    /mcp|CallMcpTool|FetchMcpResource|browser_cdp|browser_/i.test(t.toolName) ||
    /mcp/i.test(t.toolInput);

  const relevant = toolEvents.filter((t) => isMcpLike(t) || t.isError);
  if (!relevant.length) return undefined;

  const byTool = new Map<string, ToolEvent[]>();
  for (const t of relevant) {
    const key = t.toolName || "unknown";
    const list = byTool.get(key) ?? [];
    list.push(t);
    byTool.set(key, list);
  }

  const findings: McpToolFinding[] = [...byTool.entries()]
    .map(([toolName, events]) => {
      const errorCount = events.filter((e) => e.isError).length;
      const severity: McpToolFinding["severity"] =
        errorCount >= 3 ? "critical" : errorCount >= 2 ? "high" : errorCount >= 1 ? "medium" : "low";
      return {
        toolName,
        callCount: events.length,
        errorCount,
        severity,
        pattern:
          errorCount > 0
            ? locale === "ar"
              ? `${errorCount} خطأ في ${events.length} استدعاء`
              : `${errorCount} error(s) across ${events.length} call(s)`
            : locale === "ar"
              ? "استدعاءات متكررة بدون أخطاء"
              : "Repeated calls without errors",
        recommendation:
          errorCount > 0
            ? locale === "ar"
              ? "تحقق من schema الأداة قبل الاستدعاء؛ أضف pre-check rule"
              : "Verify tool schema before calling; add a pre-check rule"
            : locale === "ar"
              ? "دمج الاستدعاءات المتكررة أو cache النتائج"
              : "Batch repeated calls or cache results",
        turns: [...new Set(events.map((e) => e.turn))].slice(0, 8),
      };
    })
    .sort((a, b) => b.errorCount - a.errorCount || b.callCount - a.callCount)
    .slice(0, 12);

  if (!findings.length) return undefined;

  return {
    kind: "mcp-tool-audit",
    summary:
      locale === "ar"
        ? `تدقيق heuristic: ${findings.length} أداة/نمط.`
        : `Heuristic audit: ${findings.length} tool pattern(s).`,
    findings,
  };
}

function buildHeuristicProjectSynthesis(
  patterns: RecurringPattern[],
  locale: "ar" | "en",
): StructuredAnalysis | undefined {
  if (!patterns.length) return undefined;
  const themes: ProjectTheme[] = patterns.slice(0, 8).map((p) => ({
    id: p.id,
    title: p.label,
    sessions: p.sessionIds,
    summary: p.description,
    status: p.count >= 5 ? "blocked" : p.count >= 3 ? "active" : "resolved",
  }));
  const driftWarnings = patterns
    .filter((p) => p.kind === "duplicate_user_intent" || p.kind === "retry_loop")
    .map((p) => `${p.label}: ${p.recommendation}`);
  return {
    kind: "project-synthesis",
    summary:
      locale === "ar"
        ? `توليف heuristic عبر ${patterns.length} نمط cross-session.`
        : `Heuristic synthesis across ${patterns.length} cross-session pattern(s).`,
    themes,
    decisions: [],
    memoryGaps: [],
    driftWarnings,
  };
}

function patternToRule(p: RecurringPattern, agent: AgentKind = "cursor"): GeneratedArtifact {
  const artifact: GeneratedArtifact = {
    kind: "rule",
    name: p.label.replace(/\s+/g, "-").slice(0, 40),
    description: p.description,
    trigger: `When ${p.kind.replace(/_/g, " ")} is detected`,
    content: p.recommendation,
    sourceTurns: [],
    confidence: p.count >= 4 ? "high" : p.count >= 2 ? "medium" : "low",
  };
  artifact.rendered = renderArtifactBodyForAgent(agent, artifact);
  return artifact;
}

function patternToToolHint(p: RecurringPattern, agent: AgentKind = "cursor"): GeneratedArtifact {
  const toolName = p.id.includes(":") ? p.id.split(":")[1] ?? p.label : p.label;
  const artifact: GeneratedArtifact = {
    kind: "tool-hint",
    name: `${toolName}-hardening`,
    description: p.description,
    trigger: `Before using ${toolName}`,
    content: p.recommendation,
    sourceTurns: [],
    confidence: p.count >= 3 ? "high" : "medium",
  };
  artifact.rendered = renderArtifactBodyForAgent(agent, artifact);
  return artifact;
}

function patternToWasteItem(p: RecurringPattern): TokenWasteItem {
  const impact: TokenWasteItem["estimatedImpact"] =
    (p.estimatedTokenWaste ?? 0) > 2000
      ? "high"
      : (p.estimatedTokenWaste ?? 0) > 500
        ? "medium"
        : "low";
  return {
    source: p.kind.replace(/_/g, " "),
    description: p.description,
    estimatedImpact: impact,
    recommendation: p.recommendation,
  };
}

function mergeUniqueArtifacts(existing: GeneratedArtifact[], incoming: GeneratedArtifact[]): GeneratedArtifact[] {
  const seen = new Set(existing.map((a) => `${a.kind}:${a.name}`));
  const merged = [...existing];
  for (const item of incoming) {
    const key = `${item.kind}:${item.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

function heuristicSummary(locale: "ar" | "en"): string {
  return locale === "ar"
    ? "تحليل مبني على الأنماط المكتشفة في الجلسة (أخطاء الأدوات، تكرار القراءات، ضغط الـ compaction، إلخ)."
    : "Analysis from detected session patterns (tool errors, repeated reads, compaction pressure, etc.).";
}

function structuredItemCount(structured: StructuredAnalysis): number {
  switch (structured.kind) {
    case "token-audit":
      return structured.wasteItems.length;
    case "prevention-rules":
      return structured.rules.length;
    case "artifacts":
      return structured.items.length;
    case "memory-files":
      return structured.files.length;
    case "orchestration":
      return structured.agents.length;
    case "project-health":
      return structured.rootCauses.length;
    case "user-fluency":
    case "user-growth":
      return structured.growthAreas.length;
    case "memory-diff":
      return structured.items.length;
    case "rule-dedup":
      return structured.items.length;
    case "compaction-recovery":
      return structured.recoveryItems.length;
    case "mcp-tool-audit":
      return structured.findings.length;
    case "project-synthesis":
      return structured.themes.length + structured.memoryGaps.length;
    default:
      return 0;
  }
}

function resolveAnalysisSource(
  before: StructuredAnalysis | undefined,
  after: StructuredAnalysis | undefined,
  patterns: RecurringPattern[],
): AnalysisSource | undefined {
  if (!after || isStructuredEmpty(after)) return undefined;
  if (!patterns.length) return "llm";
  const beforeCount = before ? structuredItemCount(before) : 0;
  const afterCount = structuredItemCount(after);
  const llmHadSummary = !!before?.summary?.trim();
  const llmHadItems = beforeCount > 0;
  const supplemented = afterCount > beforeCount;
  if (supplemented && (llmHadItems || llmHadSummary)) return "hybrid";
  if (!llmHadItems && !llmHadSummary) return "heuristic";
  return "llm";
}

function supplementFromPatterns(
  type: string,
  structured: StructuredAnalysis | undefined,
  patterns: RecurringPattern[],
  locale: "ar" | "en",
  opts: ParseAnalysisOptions = {},
): StructuredAnalysis | undefined {
  if (!patterns.length && type !== "memory-diff" && type !== "rule-dedup") return structured;

  if (type === "project-health-report" && patterns.length) {
    if (structured?.kind === "project-health" && structured.rootCauses.length) return structured;
    return buildHeuristicProjectHealth(patterns, locale);
  }

  if (type === "project-synthesis" && patterns.length) {
    const heuristic = buildHeuristicProjectSynthesis(patterns, locale);
    if (heuristic && !structured) return heuristic;
    return structured ?? heuristic;
  }

  if (type === "memory-diff") {
    const heuristic = buildHeuristicMemoryDiff(opts.projectContext, locale);
    if (heuristic && !structured) return heuristic;
    return structured ?? heuristic;
  }

  if (type === "memory-file-drafts" && patterns.length) {
    const heuristic = buildHeuristicMemoryDrafts(
      patterns,
      opts.projectContext,
      opts.agent ?? "cursor",
      locale,
    );
    if (heuristic && !structured) return heuristic;
    if (structured?.kind === "memory-files" && !structured.files.length && heuristic) return heuristic;
    return structured ?? heuristic;
  }

  if (type === "rule-dedup") {
    const heuristic = buildHeuristicRuleDedup(
      patterns,
      opts.projectContext,
      opts.agent ?? "cursor",
      locale,
    );
    if (heuristic && !structured) return heuristic;
    return structured ?? heuristic;
  }

  if (type === "compaction-recovery") {
    const heuristic = buildHeuristicCompactionRecovery(
      patterns,
      locale,
      opts.compactionBoundaryIndex,
    );
    if (heuristic && !structured) return heuristic;
    return structured ?? heuristic;
  }

  if (type === "mcp-tool-audit") {
    const heuristic = buildHeuristicMcpToolAudit(opts.toolEvents, locale);
    if (heuristic && !structured) return heuristic;
    return structured ?? heuristic;
  }

  if (!patterns.length) return structured;

  if (type === "token-audit") {
    const heuristicWaste = patterns
      .filter((p) => p.estimatedTokenWaste || p.kind === "token_waste_read" || p.kind === "compaction_pressure")
      .map(patternToWasteItem);
    if (!heuristicWaste.length) return structured;
    const base =
      structured?.kind === "token-audit"
        ? structured
        : { kind: "token-audit" as const, summary: "", wasteItems: [] };
    const seen = new Set(base.wasteItems.map((w) => w.description));
    const wasteItems = [
      ...base.wasteItems,
      ...heuristicWaste.filter((w) => !seen.has(w.description)),
    ];
    return {
      kind: "token-audit",
      summary: base.summary || heuristicSummary(locale),
      wasteItems,
    };
  }

  if (type === "loop-diagnosis") {
    const heuristicRules = patterns
      .filter((p) =>
        ["retry_loop", "repeated_tool_error", "bash_failure_loop", "duplicate_user_intent"].includes(p.kind),
      )
      .map((p) => patternToRule(p, opts.agent ?? "cursor"));
    if (!heuristicRules.length && structured) return structured;
    const base =
      structured?.kind === "prevention-rules"
        ? structured
        : { kind: "prevention-rules" as const, summary: "", rules: [] };
    return {
      kind: "prevention-rules",
      summary: base.summary || heuristicSummary(locale),
      rules: mergeUniqueArtifacts(base.rules, heuristicRules),
    };
  }

  if (type === "tool-hardening") {
    const heuristicHints = patterns
      .filter((p) => p.kind === "repeated_tool_error" || p.kind === "bash_failure_loop")
      .map((p) => patternToToolHint(p, opts.agent ?? "cursor"));
    if (!heuristicHints.length && structured) return structured;
    const base =
      structured?.kind === "artifacts" ? structured : { kind: "artifacts" as const, summary: "", items: [] };
    return {
      kind: "artifacts",
      summary: base.summary || heuristicSummary(locale),
      items: mergeUniqueArtifacts(base.items, heuristicHints),
    };
  }

  return structured;
}

export function isStructuredEmpty(structured: StructuredAnalysis | undefined): boolean {
  if (!structured) return true;
  switch (structured.kind) {
    case "token-audit":
      return !structured.summary && structured.wasteItems.length === 0;
    case "prevention-rules":
      return !structured.summary && structured.rules.length === 0;
    case "artifacts":
      return !structured.summary && structured.items.length === 0;
    case "memory-files":
      return !structured.summary && structured.files.length === 0;
    case "orchestration":
      return !structured.summary && !structured.whenSwarm && structured.agents.length === 0;
    case "project-health":
      return !structured.summary && structured.rootCauses.length === 0;
    case "user-fluency":
    case "user-growth":
      return !structured.summary && structured.growthAreas.length === 0;
    case "memory-diff":
      return !structured.summary && structured.items.length === 0;
    case "rule-dedup":
      return !structured.summary && structured.items.length === 0;
    case "compaction-recovery":
      return !structured.summary && structured.recoveryItems.length === 0;
    case "mcp-tool-audit":
      return !structured.summary && structured.findings.length === 0;
    case "project-synthesis":
      return !structured.summary && structured.themes.length === 0 && structured.memoryGaps.length === 0;
    default:
      return true;
  }
}

export function buildHeuristicFallbackResult(
  type: string,
  patterns: RecurringPattern[],
  locale: "ar" | "en",
  opts: ParseAnalysisOptions = {},
): ParsedAnalysis | null {
  if (
    !patterns.length &&
    type !== "memory-diff" &&
    type !== "rule-dedup" &&
    type !== "compaction-recovery" &&
    type !== "mcp-tool-audit" &&
    type !== "project-synthesis"
  ) {
    return null;
  }
  const supported = [
    "token-audit",
    "loop-diagnosis",
    "tool-hardening",
    "artifact-blueprint",
    "memory-file-drafts",
    "project-health-report",
    "memory-diff",
    "rule-dedup",
    "compaction-recovery",
    "mcp-tool-audit",
    "project-synthesis",
  ];
  if (!supported.includes(type)) return null;
  const parsed = parseAnalysisResponse(type, "", locale, patterns, opts);
  if (!parsed.structured || isStructuredEmpty(parsed.structured)) return null;
  return { ...parsed, analysisSource: "heuristic" };
}

export type ParsedAnalysis = {
  structured?: StructuredAnalysis;
  markdown: string;
  analysisSource?: AnalysisSource;
  parseWarning?: string;
  rawLlmResponse?: string;
};

function tryRecoverFromSalvage(
  type: string,
  raw: string,
  locale: "ar" | "en",
  patterns: RecurringPattern[],
  opts: ParseAnalysisOptions,
): ParsedAnalysis | null {
  const salvaged = salvageAnalysisObject(type, raw);
  if (!salvaged) return null;
  try {
    const reparsed = parseAnalysisResponse(type, JSON.stringify(salvaged), locale, patterns, opts);
    if (!reparsed.structured || isStructuredEmpty(reparsed.structured)) return null;
    return {
      ...reparsed,
      rawLlmResponse: raw.trim(),
      analysisSource: reparsed.analysisSource ?? "llm",
      parseWarning: partialParseWarning(locale),
    };
  } catch {
    return null;
  }
}

function unstructuredFallback(
  type: string,
  raw: string,
  locale: "ar" | "en",
  patterns: RecurringPattern[],
  opts: ParseAnalysisOptions,
): ParsedAnalysis {
  const recovered = tryRecoverFromSalvage(type, raw, locale, patterns, opts);
  if (recovered) return recovered;

  const structured = supplementFromPatterns(type, undefined, patterns, locale, opts);
  if (structured && !isStructuredEmpty(structured)) {
    return {
      structured,
      markdown: formatStructuredAnalysisMarkdown(structured, locale),
      analysisSource: "heuristic",
      rawLlmResponse: raw.trim(),
    };
  }

  return {
    markdown: raw.trim(),
    rawLlmResponse: raw.trim(),
    parseWarning:
      locale === "ar"
        ? "تعذّر تحليل استجابة النموذج ولم تُكتشف أنماط كافية. الاستجابة الكاملة معروضة أدناه — أعد التحليل أو جرّب مزوداً آخر."
        : "Could not parse the model response and no session patterns were found. Full response shown below — re-run analysis or try another provider.",
  };
}

export function parseAnalysisResponse(
  type: string,
  raw: string,
  locale: "ar" | "en",
  patterns: RecurringPattern[] = [],
  opts: ParseAnalysisOptions = {},
): ParsedAnalysis {
  const agent = opts.agent ?? "cursor";
  if (
    type === "agentic-lessons" ||
    type === "summarize" ||
    type === "intent-map" ||
    type === "experience-extract" ||
    type === "session-review"
  ) {
    return { markdown: raw.trim() };
  }

  let parseWarning: string | undefined;
  let structured: StructuredAnalysis | undefined;

  try {
    const parsed = parseJsonObject(raw);

    switch (type) {
      case "token-audit": {
        const wasteItems = Array.isArray(parsed.wasteItems)
          ? parsed.wasteItems
              .map((w) => normalizeWasteItem(w as Record<string, unknown>))
              .filter((w) => w.description)
          : [];
        structured = {
          kind: "token-audit",
          summary: String(parsed.summary ?? "").trim(),
          wasteItems,
        };
        break;
      }
      case "loop-diagnosis": {
        const rules = Array.isArray(parsed.preventionRules)
          ? parsed.preventionRules
              .map((r) => normalizeArtifact(r as Record<string, unknown>, agent))
              .filter((r) => r.content)
          : [];
        structured = {
          kind: "prevention-rules",
          summary: String(parsed.summary ?? "").trim(),
          rules,
        };
        break;
      }
      case "tool-hardening": {
        const items = Array.isArray(parsed.toolHints)
          ? parsed.toolHints
              .map((r) => normalizeArtifact(r as Record<string, unknown>, agent))
              .filter((r) => r.content)
          : [];
        structured = {
          kind: "artifacts",
          summary: String(parsed.summary ?? "").trim(),
          items,
        };
        break;
      }
      case "artifact-blueprint": {
        const items = Array.isArray(parsed.artifacts)
          ? parsed.artifacts
              .map((r) => normalizeArtifact(r as Record<string, unknown>, agent))
              .filter((r) => r.content)
          : [];
        structured = {
          kind: "artifacts",
          summary: String(parsed.summary ?? "").trim(),
          items,
        };
        break;
      }
      case "memory-file-drafts": {
        const rawFiles = Array.isArray(parsed.files)
          ? parsed.files
              .map((f) => normalizeMemoryFile(f as Record<string, unknown>))
              .filter((f) => f.content)
          : [];
        const { files, excluded } = filterMemoryFiles(rawFiles, locale);
        if (excluded > 0) {
          parseWarning = memoryFilesExcludedWarning(excluded, locale);
        }
        structured = {
          kind: "memory-files",
          summary: String(parsed.summary ?? "").trim(),
          files,
        };
        break;
      }
      case "agent-orchestration": {
        const agents = Array.isArray(parsed.agents)
          ? parsed.agents
              .map((a) => normalizeSubAgent(a as Record<string, unknown>))
              .filter((a) => a.role)
          : [];
        structured = {
          kind: "orchestration",
          summary: String(parsed.summary ?? "").trim(),
          whenSwarm: String(parsed.whenSwarm ?? "").trim(),
          agents,
        };
        break;
      }
      case "project-health-report": {
        const rootCauses = Array.isArray(parsed.rootCauses)
          ? parsed.rootCauses.map((rc, i) => ({
              id: String((rc as Record<string, unknown>).id ?? `rc-${i}`),
              category: String((rc as Record<string, unknown>).category ?? "workflow"),
              title: String((rc as Record<string, unknown>).title ?? "").trim(),
              impact: asImpact((rc as Record<string, unknown>).impact) as RootCauseItem["impact"],
              description: String((rc as Record<string, unknown>).description ?? "").trim(),
              sessionIds: Array.isArray((rc as Record<string, unknown>).sessionIds)
                ? ((rc as Record<string, unknown>).sessionIds as unknown[]).map(String)
                : [],
              estimatedTokenWaste: Number((rc as Record<string, unknown>).estimatedTokenWaste) || undefined,
              fixPriority: Number((rc as Record<string, unknown>).fixPriority) || i + 1,
              recommendation: String((rc as Record<string, unknown>).recommendation ?? "").trim(),
            }))
          : [];
        structured = {
          kind: "project-health",
          summary: String(parsed.summary ?? "").trim(),
          healthScore: Math.min(100, Math.max(0, Number(parsed.healthScore) || 50)),
          rootCauses,
          openRisks: Array.isArray(parsed.openRisks) ? parsed.openRisks.map(String) : [],
        };
        break;
      }
      case "user-ai-fluency": {
        structured = {
          kind: "user-fluency",
          summary: String(parsed.summary ?? "").trim(),
          overallScore: Math.min(100, Math.max(0, Number(parsed.overallScore) || 50)),
          dimensions: Array.isArray(parsed.dimensions)
            ? (parsed.dimensions as Record<string, unknown>[]).map((d) => ({
                id: String(d.id ?? "dimension"),
                label: String(d.label ?? "").trim(),
                score: Math.min(5, Math.max(1, Number(d.score) || 3)),
                evidence: String(d.evidence ?? "").trim(),
                examples: Array.isArray(d.examples)
                  ? (d.examples as Record<string, unknown>[]).map((e) => ({
                      turn: Number(e.turn) || 0,
                      quote: String(e.quote ?? "").trim(),
                    }))
                  : [],
              }))
            : [],
          strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
          growthAreas: Array.isArray(parsed.growthAreas)
            ? (parsed.growthAreas as Record<string, unknown>[]).map(normalizeGrowthArea)
            : [],
        };
        break;
      }
      case "user-growth-plan": {
        structured = {
          kind: "user-growth",
          summary: String(parsed.summary ?? "").trim(),
          overallScore: Math.min(100, Math.max(0, Number(parsed.overallScore) || 50)),
          weeklyPlan: Array.isArray(parsed.weeklyPlan)
            ? (parsed.weeklyPlan as Record<string, unknown>[]).map((d) => ({
                day: String(d.day ?? ""),
                focus: String(d.focus ?? "").trim(),
                task: String(d.task ?? "").trim(),
              }))
            : [],
          growthAreas: Array.isArray(parsed.growthAreas)
            ? (parsed.growthAreas as Record<string, unknown>[]).map(normalizeGrowthArea)
            : [],
        };
        break;
      }
      case "memory-diff": {
        structured = {
          kind: "memory-diff",
          summary: String(parsed.summary ?? "").trim(),
          items: Array.isArray(parsed.items)
            ? (parsed.items as Record<string, unknown>[]).map(normalizeMemoryDiffItem)
            : [],
        };
        break;
      }
      case "rule-dedup": {
        structured = {
          kind: "rule-dedup",
          summary: String(parsed.summary ?? "").trim(),
          items: Array.isArray(parsed.items)
            ? (parsed.items as Record<string, unknown>[]).map((r) =>
                normalizeRuleDedupItem(r, agent),
              )
            : [],
        };
        break;
      }
      case "compaction-recovery": {
        structured = {
          kind: "compaction-recovery",
          summary: String(parsed.summary ?? "").trim(),
          boundaryTurn: parsed.boundaryTurn != null ? Number(parsed.boundaryTurn) : undefined,
          recoveryItems: Array.isArray(parsed.recoveryItems)
            ? (parsed.recoveryItems as Record<string, unknown>[]).map((r) => ({
                priority: (["critical", "high", "medium"].includes(String(r.priority))
                  ? String(r.priority)
                  : "medium") as CompactionRecoveryItem["priority"],
                action: String(r.action ?? "").trim(),
                rationale: String(r.rationale ?? "").trim(),
                suggestedMemoryPath: r.suggestedMemoryPath ? String(r.suggestedMemoryPath) : undefined,
                suggestedContent: r.suggestedContent ? String(r.suggestedContent) : undefined,
              }))
            : [],
        };
        break;
      }
      case "mcp-tool-audit": {
        const rawFindings = Array.isArray(parsed.findings)
          ? (parsed.findings as Record<string, unknown>[])
              .map((f) => ({
                toolName: String(f.toolName ?? "").trim(),
                callCount: Number(f.callCount) || 0,
                errorCount: Number(f.errorCount) || 0,
                severity: (["critical", "high", "medium", "low"].includes(String(f.severity))
                  ? String(f.severity)
                  : "medium") as McpToolFinding["severity"],
                pattern: String(f.pattern ?? "").trim(),
                recommendation: String(f.recommendation ?? "").trim(),
                turns: Array.isArray(f.turns)
                  ? f.turns.map((n) => Number(n)).filter((n) => !Number.isNaN(n) && n > 0)
                  : [],
              }))
              .filter(
                (f) =>
                  f.toolName.length > 0 &&
                  f.toolName !== "unknown" &&
                  f.turns.length > 0 &&
                  f.pattern.length > 0,
              )
          : [];
        structured = {
          kind: "mcp-tool-audit",
          summary: String(parsed.summary ?? "").trim(),
          findings: rawFindings,
        };
        break;
      }
      case "project-synthesis": {
        structured = {
          kind: "project-synthesis",
          summary: String(parsed.summary ?? "").trim(),
          themes: Array.isArray(parsed.themes)
            ? (parsed.themes as Record<string, unknown>[]).map((t) => ({
                id: String(t.id ?? ""),
                title: String(t.title ?? "").trim(),
                sessions: Array.isArray(t.sessions) ? t.sessions.map(String) : [],
                summary: String(t.summary ?? "").trim(),
                status: (["active", "resolved", "blocked"].includes(String(t.status))
                  ? String(t.status)
                  : "active") as ProjectTheme["status"],
              }))
            : [],
          decisions: Array.isArray(parsed.decisions)
            ? (parsed.decisions as Record<string, unknown>[]).map((d) => ({
                decision: String(d.decision ?? "").trim(),
                rationale: String(d.rationale ?? "").trim(),
                sessionIds: Array.isArray(d.sessionIds) ? d.sessionIds.map(String) : [],
              }))
            : [],
          memoryGaps: Array.isArray(parsed.memoryGaps)
            ? (parsed.memoryGaps as Record<string, unknown>[]).map((g) => ({
                path: String(g.path ?? "").trim(),
                gap: String(g.gap ?? "").trim(),
                suggestedAction: String(g.suggestedAction ?? "").trim(),
              }))
            : [],
          driftWarnings: Array.isArray(parsed.driftWarnings) ? parsed.driftWarnings.map(String) : [],
        };
        break;
      }
      default:
        return { markdown: raw.trim() };
    }
  } catch {
    return unstructuredFallback(type, raw, locale, patterns, opts);
  }

  const llmStructured = structured;
  structured = supplementFromPatterns(type, structured, patterns, locale, opts);

  if (isStructuredEmpty(structured)) {
    const recovered = tryRecoverFromSalvage(type, raw, locale, patterns, opts);
    if (recovered?.structured && !isStructuredEmpty(recovered.structured)) {
      return recovered;
    }
    parseWarning =
      locale === "ar"
        ? "التحليل لم يُنتج عناصر قابلة للاستخدام. أعد التشغيل بـ force أو راجع الجلسة. الاستجابة الكاملة معروضة أدناه."
        : "Analysis produced no actionable items. Re-run with New analysis or review session data. Full response shown below.";
  }

  if (structured) {
    return {
      structured,
      markdown: formatStructuredAnalysisMarkdown(structured, locale),
      analysisSource: resolveAnalysisSource(llmStructured, structured, patterns),
      parseWarning,
      rawLlmResponse: raw.trim(),
    };
  }

  return { ...unstructuredFallback(type, raw, locale, patterns, opts), parseWarning };
}
