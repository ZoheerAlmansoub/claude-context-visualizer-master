import type {
  AnalysisSource,
  ArtifactKind,
  GeneratedArtifact,
  MemoryFileDraft,
  RecurringPattern,
  StructuredAnalysis,
  SubAgentSpec,
  TokenWasteItem,
} from "../types.ts";
import { renderArtifactBody } from "../artifacts/generator.ts";

function stripCodeFences(raw: string): string {
  return raw
    .replace(/^```(?:json|markdown)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function repairInvalidJsonEscapes(json: string): string {
  return json.replace(/\\([^"\\/bfnrtu0-9])/g, "$1");
}

function extractBalancedJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i]!;
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth++;
    if (c === "}") {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const trimmed = stripCodeFences(raw.trim());
  const candidate = extractBalancedJsonObject(trimmed) ?? trimmed;
  const attempts = [candidate, repairInvalidJsonEscapes(candidate)];
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as Record<string, unknown>;
    } catch {}
  }
  throw new Error("Could not parse analysis JSON");
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

function normalizeArtifact(raw: Record<string, unknown>): GeneratedArtifact {
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
  artifact.rendered = renderArtifactBody(artifact);
  return artifact;
}

export function renderArtifact(artifact: GeneratedArtifact): string {
  return renderArtifactBody(artifact);
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
  }

  return lines.join("\n");
}

function patternToRule(p: RecurringPattern): GeneratedArtifact {
  const artifact: GeneratedArtifact = {
    kind: "rule",
    name: p.label.replace(/\s+/g, "-").slice(0, 40),
    description: p.description,
    trigger: `When ${p.kind.replace(/_/g, " ")} is detected`,
    content: p.recommendation,
    sourceTurns: [],
    confidence: p.count >= 4 ? "high" : p.count >= 2 ? "medium" : "low",
  };
  artifact.rendered = renderArtifactBody(artifact);
  return artifact;
}

function patternToToolHint(p: RecurringPattern): GeneratedArtifact {
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
  artifact.rendered = renderArtifactBody(artifact);
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
): StructuredAnalysis | undefined {
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
      .map(patternToRule);
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
      .map(patternToToolHint);
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

function isStructuredEmpty(structured: StructuredAnalysis | undefined): boolean {
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
    default:
      return true;
  }
}

export function buildHeuristicFallbackResult(
  type: string,
  patterns: RecurringPattern[],
  locale: "ar" | "en",
): ParsedAnalysis | null {
  if (!patterns.length) return null;
  if (type !== "token-audit" && type !== "loop-diagnosis" && type !== "tool-hardening") {
    return null;
  }
  const parsed = parseAnalysisResponse(type, "", locale, patterns);
  if (!parsed.structured || isStructuredEmpty(parsed.structured)) return null;
  return { ...parsed, analysisSource: "heuristic" };
}

export type ParsedAnalysis = {
  structured?: StructuredAnalysis;
  markdown: string;
  analysisSource?: AnalysisSource;
  parseWarning?: string;
};

export function parseAnalysisResponse(
  type: string,
  raw: string,
  locale: "ar" | "en",
  patterns: RecurringPattern[] = [],
): ParsedAnalysis {
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
              .map((r) => normalizeArtifact(r as Record<string, unknown>))
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
              .map((r) => normalizeArtifact(r as Record<string, unknown>))
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
              .map((r) => normalizeArtifact(r as Record<string, unknown>))
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
      default:
        return { markdown: raw.trim() };
    }
  } catch {
    structured = supplementFromPatterns(type, undefined, patterns, locale);
    if (structured && !isStructuredEmpty(structured)) {
      return {
        structured,
        markdown: formatStructuredAnalysisMarkdown(structured, locale),
        analysisSource: "heuristic",
      };
    }
    parseWarning =
      locale === "ar"
        ? "تعذّر تحليل استجابة النموذج ولم تُكتشف أنماط كافية. أعد التحليل أو جرّب مزوداً آخر."
        : "Could not parse the model response and no session patterns were found. Re-run analysis or try another provider.";
    return { markdown: raw.trim(), parseWarning };
  }

  const llmStructured = structured;
  structured = supplementFromPatterns(type, structured, patterns, locale);

  if (isStructuredEmpty(structured)) {
    parseWarning =
      locale === "ar"
        ? "التحليل لم يُنتج عناصر قابلة للاستخدام. أعد التشغيل بـ force أو راجع الجلسة."
        : "Analysis produced no actionable items. Re-run with New analysis or review session data.";
  }

  if (structured) {
    return {
      structured,
      markdown: formatStructuredAnalysisMarkdown(structured, locale),
      analysisSource: resolveAnalysisSource(llmStructured, structured, patterns),
      parseWarning,
    };
  }

  return { markdown: raw.trim(), parseWarning };
}
