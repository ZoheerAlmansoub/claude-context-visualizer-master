export type ParsedImprovement = {
  improvedPrompt: string;
  rationale: string;
  tips: string[];
  issues: string[];
};

function stripCodeFences(raw: string): string {
  return raw
    .replace(/^```(?:json|markdown)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/** Fix invalid JSON escapes often produced by LLMs (e.g. \\-, \\.) */
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

function decodeJsonStringLiteral(literalWithQuotes: string): string | null {
  try {
    return JSON.parse(repairInvalidJsonEscapes(literalWithQuotes)) as string;
  } catch {
    return null;
  }
}

function extractQuotedField(json: string, field: string): string | null {
  const marker = `"${field}"`;
  const keyIdx = json.indexOf(marker);
  if (keyIdx === -1) return null;
  let i = keyIdx + marker.length;
  while (i < json.length && /[\s:]/.test(json[i]!)) i++;
  if (json[i] !== '"') return null;
  const start = i;
  i++;
  let inEscape = false;
  while (i < json.length) {
    const c = json[i]!;
    if (inEscape) {
      inEscape = false;
      i++;
      continue;
    }
    if (c === "\\") {
      inEscape = true;
      i++;
      continue;
    }
    if (c === '"') break;
    i++;
  }
  return decodeJsonStringLiteral(json.slice(start, i + 1));
}

function extractStringArrayField(json: string, field: string): string[] {
  const marker = `"${field}"`;
  const keyIdx = json.indexOf(marker);
  if (keyIdx === -1) return [];
  const open = json.indexOf("[", keyIdx);
  if (open === -1) return [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let close = -1;
  for (let i = open; i < json.length; i++) {
    const c = json[i]!;
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
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1) return [];
  const slice = json.slice(open, close + 1);
  try {
    const arr = JSON.parse(repairInvalidJsonEscapes(slice)) as unknown[];
    return arr.map(String).filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeParsed(parsed: Record<string, unknown>): ParsedImprovement {
  let improvedPrompt = String(
    parsed.improvedPrompt ?? parsed.improved_prompt ?? parsed.prompt ?? "",
  ).trim();
  if (improvedPrompt.startsWith("{") && improvedPrompt.includes('"improvedPrompt"')) {
    try {
      const inner = parseImprovementResponse(improvedPrompt);
      return inner;
    } catch {}
  }
  return {
    improvedPrompt,
    rationale: String(parsed.rationale ?? parsed.explanation ?? "").trim(),
    tips: Array.isArray(parsed.tips)
      ? parsed.tips.map(String).filter(Boolean)
      : Array.isArray(parsed.learningTips)
        ? parsed.learningTips.map(String).filter(Boolean)
        : [],
    issues: Array.isArray(parsed.issues)
      ? parsed.issues.map(String).filter(Boolean)
      : Array.isArray(parsed.problems)
        ? parsed.problems.map(String).filter(Boolean)
        : [],
  };
}

function fallbackExtract(raw: string): ParsedImprovement {
  const json = extractBalancedJsonObject(raw) ?? raw;
  return {
    improvedPrompt: extractQuotedField(json, "improvedPrompt") ?? "",
    rationale: extractQuotedField(json, "rationale") ?? "",
    issues: extractStringArrayField(json, "issues"),
    tips: extractStringArrayField(json, "tips"),
  };
}

export function looksLikeImprovementJson(text: string): boolean {
  const t = text.trim();
  return t.startsWith("{") && t.includes('"improvedPrompt"');
}

export function parseImprovementResponse(raw: string): ParsedImprovement {
  const trimmed = stripCodeFences(raw.trim());
  const candidate = extractBalancedJsonObject(trimmed) ?? trimmed;
  const attempts = [candidate, repairInvalidJsonEscapes(candidate)];

  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt) as Record<string, unknown>;
      const normalized = normalizeParsed(parsed);
      if (normalized.improvedPrompt) return normalized;
    } catch {}
  }

  const extracted = fallbackExtract(candidate);
  if (extracted.improvedPrompt) return extracted;

  throw new Error("Could not parse improvement response");
}

export function coerceImprovementFields(input: {
  improvedPrompt: string;
  rationale: string;
  tips: string[];
  issues: string[];
}): ParsedImprovement {
  const blob = input.improvedPrompt.trim();
  if (looksLikeImprovementJson(blob)) {
    try {
      const parsed = parseImprovementResponse(blob);
      return {
        improvedPrompt: parsed.improvedPrompt,
        rationale: parsed.rationale || input.rationale,
        issues: parsed.issues.length ? parsed.issues : input.issues,
        tips: parsed.tips.length ? parsed.tips : input.tips,
      };
    } catch {}
  }
  return input;
}

export const FALLBACK_RATIONALE = {
  en: "Auto-improved — review text above.",
  ar: "تحسين تلقائي — راجع النص أعلاه.",
} as const;

export function isFallbackRationale(text: string): boolean {
  const t = text.trim();
  return (
    t === FALLBACK_RATIONALE.en ||
    t === FALLBACK_RATIONALE.ar ||
    t.includes("راجع النص أعلاه")
  );
}
