/** Robust JSON extraction for LLM analysis responses (often invalid JSON). */

export function stripCodeFences(raw: string): string {
  return raw
    .replace(/^```(?:json|markdown)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export function extractBalancedJsonObject(raw: string): string | null {
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

/** True when the model output contains a fully closed, parseable JSON object. */
export function hasCompleteJsonObject(raw: string): boolean {
  const trimmed = stripCodeFences(raw.trim());
  const balanced = extractBalancedJsonObject(trimmed);
  if (balanced) {
    try {
      JSON.parse(balanced);
      return true;
    } catch {
      try {
        parseJsonObjectRobust(trimmed);
        return true;
      } catch {
        return false;
      }
    }
  }
  try {
    parseJsonObjectRobust(trimmed);
    return true;
  } catch {
    return false;
  }
}

export function isTruncatedLlmOutput(
  raw: string,
  meta: { finishReason?: string; maxTokens?: number; completionTokens?: number },
): boolean {
  const reason = (meta.finishReason ?? "").toLowerCase();
  if (reason === "length" || reason === "max_tokens" || reason === "max_tokens_reached") {
    return true;
  }
  if (!hasCompleteJsonObject(raw)) return true;
  return false;
}

/** Original strategy: drop invalid escape char (preserved for compatibility). */
export function repairInvalidJsonEscapesLegacy(json: string): string {
  return json.replace(/\\([^"\\/bfnrtu0-9])/g, "$1");
}

/** Prefer doubling backslashes so Windows paths like D:\\dev stay meaningful. */
export function repairInvalidJsonEscapes(json: string): string {
  return json.replace(/\\([^"\\/bfnrtu0-9])/g, "\\\\$1");
}

export function fixCommonLlmJsonIssues(json: string): string {
  return json
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, "$1");
}

/** Turn literal newlines/tabs inside JSON string values into escapes. */
export function repairUnescapedNewlinesInJsonStrings(json: string): string {
  let out = "";
  let inString = false;
  let escape = false;
  for (let i = 0; i < json.length; i++) {
    const c = json[i]!;
    if (!inString) {
      out += c;
      if (c === '"') {
        inString = true;
        escape = false;
      }
      continue;
    }
    if (escape) {
      out += c;
      escape = false;
      continue;
    }
    if (c === "\\") {
      out += c;
      escape = true;
      continue;
    }
    if (c === '"') {
      out += c;
      inString = false;
      continue;
    }
    if (c === "\n") {
      out += "\\n";
      continue;
    }
    if (c === "\r") continue;
    if (c === "\t") {
      out += "\\t";
      continue;
    }
    out += c;
  }
  return out;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function buildParseCandidates(raw: string): string[] {
  const trimmed = stripCodeFences(raw.trim());
  const base = extractBalancedJsonObject(trimmed) ?? trimmed;
  const legacy = repairInvalidJsonEscapesLegacy(base);
  const doubled = repairInvalidJsonEscapes(base);
  const newlineBase = repairUnescapedNewlinesInJsonStrings(base);
  return uniqueStrings([
    base,
    legacy,
    doubled,
    repairUnescapedNewlinesInJsonStrings(legacy),
    repairUnescapedNewlinesInJsonStrings(doubled),
    fixCommonLlmJsonIssues(newlineBase),
    fixCommonLlmJsonIssues(repairUnescapedNewlinesInJsonStrings(doubled)),
    fixCommonLlmJsonIssues(repairUnescapedNewlinesInJsonStrings(legacy)),
  ]);
}

export function parseJsonObjectRobust(raw: string): Record<string, unknown> {
  for (const attempt of buildParseCandidates(raw)) {
    try {
      return JSON.parse(attempt) as Record<string, unknown>;
    } catch {
      /* try next repair */
    }
  }
  throw new Error("Could not parse analysis JSON");
}

/** Read a JSON string field from a fragment even when surrounding JSON is broken. */
export function extractJsonStringField(fragment: string, field: string): string {
  const re = new RegExp(`"${field}"\\s*:\\s*"`, "i");
  const match = re.exec(fragment);
  if (!match || match.index === undefined) return "";
  let i = match.index + match[0].length;
  let result = "";
  while (i < fragment.length) {
    const c = fragment[i]!;
    if (c === "\\" && i + 1 < fragment.length) {
      const next = fragment[i + 1]!;
      if (next === "n") result += "\n";
      else if (next === "t") result += "\t";
      else if (next === "r") result += "\r";
      else if (next === '"') result += '"';
      else if (next === "\\") result += "\\";
      else result += next;
      i += 2;
      continue;
    }
    if (c === '"') break;
    result += c;
    i++;
  }
  return result.trim();
}

function extractBalancedJsonArrayEnd(source: string, arrStart: number): number {
  if (source[arrStart] !== "[") return -1;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = arrStart; i < source.length; i++) {
    const c = source[i]!;
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
    if (c === "[") depth++;
    if (c === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function parseObjectFragment(fragment: string): Record<string, unknown> | null {
  const chunk = extractBalancedJsonObject(fragment) ?? fragment;
  for (const attempt of uniqueStrings([
    chunk,
    repairInvalidJsonEscapesLegacy(chunk),
    repairInvalidJsonEscapes(chunk),
    repairUnescapedNewlinesInJsonStrings(repairInvalidJsonEscapesLegacy(chunk)),
    repairUnescapedNewlinesInJsonStrings(repairInvalidJsonEscapes(chunk)),
    fixCommonLlmJsonIssues(repairUnescapedNewlinesInJsonStrings(repairInvalidJsonEscapes(chunk))),
  ])) {
    try {
      return JSON.parse(attempt) as Record<string, unknown>;
    } catch {
      /* try next */
    }
  }
  return null;
}

function salvageObjectFields(snippet: string): Record<string, unknown> {
  const content = extractJsonStringField(snippet, "content");
  const path = extractJsonStringField(snippet, "path");
  if (!content && !path) return {};
  return {
    path: path || "AGENTS.md",
    purpose: extractJsonStringField(snippet, "purpose"),
    action: extractJsonStringField(snippet, "action") || "create",
    rationale: extractJsonStringField(snippet, "rationale"),
    content,
    description: extractJsonStringField(snippet, "description"),
    recommendation: extractJsonStringField(snippet, "recommendation"),
    name: extractJsonStringField(snippet, "name"),
  };
}

function salvageGrowthAreaFields(snippet: string): Record<string, unknown> {
  const area = extractJsonStringField(snippet, "area");
  if (!area) return {};
  const whyItMatters = extractJsonStringField(snippet, "whyItMatters");
  const concreteActions = extractJsonStringArray(snippet, "concreteActions");
  if (!whyItMatters && concreteActions.length === 0) return {};
  const suggestedRule = extractJsonStringField(snippet, "suggestedRule");
  const suggestedSkill = extractJsonStringField(snippet, "suggestedSkill");
  const practiceExercise = extractJsonStringField(snippet, "practiceExercise");
  return {
    area,
    whyItMatters,
    concreteActions,
    ...(suggestedRule ? { suggestedRule } : {}),
    ...(suggestedSkill ? { suggestedSkill } : {}),
    ...(practiceExercise ? { practiceExercise } : {}),
  };
}

function salvageWeeklyPlanFields(snippet: string): Record<string, unknown> {
  const day = extractJsonStringField(snippet, "day");
  if (!day) return {};
  return {
    day,
    focus: extractJsonStringField(snippet, "focus"),
    task: extractJsonStringField(snippet, "task"),
  };
}

function salvageArrayItem(arrayField: string, snippet: string): Record<string, unknown> {
  if (arrayField === "growthAreas") return salvageGrowthAreaFields(snippet);
  if (arrayField === "weeklyPlan") return salvageWeeklyPlanFields(snippet);
  return salvageObjectFields(snippet);
}

function extractObjectArray(raw: string, arrayField: string): Record<string, unknown>[] {
  const sources = uniqueStrings([
    raw,
    repairUnescapedNewlinesInJsonStrings(raw),
    repairUnescapedNewlinesInJsonStrings(repairInvalidJsonEscapesLegacy(raw)),
    repairUnescapedNewlinesInJsonStrings(repairInvalidJsonEscapes(raw)),
  ]);

  const items: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    const fieldRe = new RegExp(`"${arrayField}"\\s*:\\s*\\[`, "i");
    const match = fieldRe.exec(source);
    if (!match || match.index === undefined) continue;

    const arrStart = match.index + match[0].length - 1;
    const arrEnd = extractBalancedJsonArrayEnd(source, arrStart);
    const sliceEnd = arrEnd === -1 ? source.length : arrEnd;

    let searchFrom = arrStart + 1;
    while (searchFrom < sliceEnd) {
      const brace = source.indexOf("{", searchFrom);
      if (brace === -1 || brace >= sliceEnd) break;

      const objStr = extractBalancedJsonObject(source.slice(brace));
      if (objStr) {
        const parsed = parseObjectFragment(objStr);
        if (parsed && Object.keys(parsed).length > 0) {
          const key = JSON.stringify(parsed);
          if (!seen.has(key)) {
            seen.add(key);
            items.push(parsed);
          }
          searchFrom = brace + objStr.length;
          continue;
        }
      }

      const nextBrace = source.indexOf("{", brace + 1);
      const snippetEnd = nextBrace === -1 || nextBrace > sliceEnd ? sliceEnd : nextBrace;
      const snippet = source.slice(brace, snippetEnd);
      if (arrEnd === -1 && !snippet.trimEnd().endsWith("}")) {
        searchFrom = brace + 1;
        continue;
      }
      const fields = salvageArrayItem(arrayField, snippet);
      if (Object.keys(fields).length > 0) {
        const key = JSON.stringify(fields);
        if (!seen.has(key)) {
          seen.add(key);
          items.push(fields);
        }
      }
      searchFrom = brace + 1;
    }

    if (items.length > 0) break;
  }

  return items;
}

function extractJsonStringArray(raw: string, field: string): string[] {
  const re = new RegExp(`"${field}"\\s*:\\s*\\[`, "i");
  const match = re.exec(raw);
  if (!match || match.index === undefined) return [];
  const start = match.index + match[0].length;
  const end = raw.indexOf("]", start);
  if (end === -1) return [];
  const slice = raw.slice(start, end);
  const items: string[] = [];
  const strRe = /"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = strRe.exec(slice)) !== null) {
    items.push(
      m[1]!
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\")
        .trim(),
    );
  }
  return items.filter(Boolean);
}

const SALVAGE_ARRAY_FIELDS: Record<string, string[]> = {
  "token-audit": ["wasteItems"],
  "loop-diagnosis": ["preventionRules"],
  "tool-hardening": ["toolHints"],
  "artifact-blueprint": ["artifacts"],
  "memory-file-drafts": ["files"],
  "agent-orchestration": ["agents"],
  "project-health-report": ["rootCauses"],
  "user-ai-fluency": ["dimensions", "growthAreas"],
  "user-growth-plan": ["growthAreas", "weeklyPlan"],
  "memory-diff": ["items"],
  "rule-dedup": ["items"],
  "compaction-recovery": ["recoveryItems"],
  "mcp-tool-audit": ["findings"],
  "project-synthesis": ["themes", "decisions", "memoryGaps"],
};

/**
 * Last-resort extraction when JSON.parse fails entirely.
 * Pulls summary + array objects field-by-field from the raw model text.
 */
export function salvageAnalysisObject(type: string, raw: string): Record<string, unknown> | null {
  const trimmed = stripCodeFences(raw.trim());
  if (!trimmed.includes("{")) return null;

  const summary = extractJsonStringField(trimmed, "summary");
  const arrayFields = SALVAGE_ARRAY_FIELDS[type] ?? [];
  const result: Record<string, unknown> = {};

  if (summary) result.summary = summary;

  for (const field of arrayFields) {
    const items = extractObjectArray(trimmed, field);
    if (items.length) result[field] = items;
  }

  if (type === "project-health-report") {
    const scoreMatch = trimmed.match(/"healthScore"\s*:\s*(\d+)/);
    if (scoreMatch) result.healthScore = Number(scoreMatch[1]);
    const risks = extractJsonStringArray(trimmed, "openRisks");
    if (risks.length) result.openRisks = risks;
  }

  if (type === "user-growth-plan" || type === "user-ai-fluency") {
    const scoreMatch = trimmed.match(/"overallScore"\s*:\s*(\d+)/);
    if (scoreMatch) result.overallScore = Number(scoreMatch[1]);
  }

  if (type === "project-synthesis") {
    result.driftWarnings = extractJsonStringArray(trimmed, "driftWarnings");
  }

  const hasArrays = arrayFields.some((f) => Array.isArray(result[f]) && (result[f] as unknown[]).length > 0);
  if (!summary && !hasArrays && type !== "project-health-report") return null;
  if (type === "project-health-report" && !summary && !hasArrays && result.healthScore == null) return null;

  return result;
}

export function recoveredParseWarning(locale: "ar" | "en"): string {
  return locale === "ar"
    ? "تم إصلاح JSON تلقائياً واستخراج النتائج من استجابة النموذج. راجع العناصر المستردة."
    : "Model JSON was auto-repaired and results were recovered from the response. Review recovered items.";
}

export function partialParseWarning(locale: "ar" | "en"): string {
  return locale === "ar"
    ? "تم استخراج جزء من النتائج بعد فشل تحليل JSON الكامل. راجع الاستجابة الكاملة أدناه."
    : "Partial results were extracted after full JSON parse failed. Review the full model response below.";
}
