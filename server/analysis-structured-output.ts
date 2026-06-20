import type { AnalyzeType } from "./types.ts";
import {
  hasCompleteJsonObject,
  isTruncatedLlmOutput,
  partialParseWarning,
} from "./llm/json-recovery.ts";
import { isStructuredAnalysisType } from "./llm/prompts.ts";
import type { ParsedAnalysis } from "./llm/parse-analysis-response.ts";
import { isStructuredEmpty } from "./llm/parse-analysis-response.ts";
import type { LlmResponse } from "./llm/provider.ts";
import { isHeavySession, type AnalysisContextLimits } from "./analysis-budget.ts";
import type { SessionTranscript } from "./types.ts";

export { hasCompleteJsonObject, isTruncatedLlmOutput };

export const STRUCTURED_OUTPUT_TOKEN_CAP = 16_384;

export type StructuredLlmAttempt = {
  compact: boolean;
  ultraCompact: boolean;
  /** Multiplier applied to contextLimitsFor().maxTokens for this attempt. */
  maxTokensScale: number;
};

/** Prefer raising output token budget before accepting truncated JSON — never shrink maxTokens first. */
export function structuredAnalysisAttempts(
  transcript: SessionTranscript,
  gatewaySensitive: boolean,
): StructuredLlmAttempt[] {
  const heavy = gatewaySensitive && isHeavySession(transcript);
  if (heavy) {
    return [
      { compact: true, ultraCompact: false, maxTokensScale: 1 },
      { compact: true, ultraCompact: false, maxTokensScale: 2 },
      { compact: true, ultraCompact: true, maxTokensScale: 2.5 },
    ];
  }
  return [
    { compact: false, ultraCompact: false, maxTokensScale: 1 },
    { compact: false, ultraCompact: false, maxTokensScale: 2 },
    { compact: true, ultraCompact: false, maxTokensScale: 2 },
    { compact: true, ultraCompact: true, maxTokensScale: 2.5 },
  ];
}

export function scaledMaxTokens(limits: AnalysisContextLimits, scale: number): number {
  return Math.min(STRUCTURED_OUTPUT_TOKEN_CAP, Math.max(limits.maxTokens, Math.round(limits.maxTokens * scale)));
}

export function isSalvagedPartialParse(parsed: ParsedAnalysis, locale: "ar" | "en"): boolean {
  if (!parsed.parseWarning) return false;
  return (
    parsed.parseWarning === partialParseWarning(locale) ||
    /Partial results were extracted|تم استخراج جزء من النتائج/i.test(parsed.parseWarning)
  );
}

export function isAcceptableStructuredAnalysis(
  type: AnalyzeType,
  raw: string,
  parsed: ParsedAnalysis,
  response: LlmResponse,
  maxTokens: number,
  locale: "ar" | "en",
): boolean {
  if (!isStructuredAnalysisType(type)) return true;
  if (isTruncatedLlmOutput(raw, {
    finishReason: response.finishReason,
    maxTokens,
    completionTokens: response.completionTokens,
  })) {
    return false;
  }
  if (!hasCompleteJsonObject(raw)) return false;
  if (!parsed.structured || isStructuredEmpty(parsed.structured)) return false;
  if (isSalvagedPartialParse(parsed, locale)) return false;
  return true;
}

export function formatTruncatedStructuredAnalysisError(
  type: AnalyzeType,
  locale: "ar" | "en",
): string {
  if (locale === "ar") {
    return (
      `تحليل "${type}" فشل: استجابة النموذج JSON غير مكتملة (غالباً بسبب max_tokens truncation / حد الإخراج). ` +
      `جرّب مزوداً/نموذجاً أسرع، أو وضع Standard بدلاً من Full، أو قلّل حجم الجلسات في project pipeline.`
    );
  }
  return (
    `Analysis "${type}" failed: model returned incomplete JSON (usually max_tokens truncation). ` +
    `Try a faster provider/model, a lighter governance mode, or fewer sessions in the project pipeline.`
  );
}
