import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { CACHE_DIR } from "./paths.ts";
import type {
  AnalysisIndexEntry,
  AnalyzeResult,
  AnalyzeType,
  LlmProviderKind,
  RecurringPattern,
  SessionTranscript,
} from "./types.ts";
import { buildAnalysisPrompt } from "./llm/prompts.ts";
import { buildHeuristicFallbackResult, parseAnalysisResponse } from "./llm/parse-analysis-response.ts";
import {
  buildAnalysisTranscriptContext,
  contextLimitsFor,
  formatAnalysisLlmError,
  isGatewaySensitiveProvider,
  isHeavySession,
  isRetryableGatewayError,
  supportsHeuristicFallback,
} from "./analysis-budget.ts";
import { getProvider, resolveModel } from "./llm/router.ts";
import { getLlmConfig } from "./config.ts";
import type { LLMProvider } from "./llm/provider.ts";

function analysisCacheDir(agent: string, sessionId: string): string {
  return join(CACHE_DIR, "analysis", agent, sessionId);
}

function comboKey(type: AnalyzeType, provider: LlmProviderKind, model: string, locale: string): string {
  return createHash("sha256").update(`${type}:${provider}:${model}:${locale}`).digest("hex").slice(0, 12);
}

function runAnalysisId(combo: string, createdAt: string, force: boolean): string {
  if (force) {
    return createHash("sha256").update(`${combo}:${createdAt}`).digest("hex").slice(0, 16);
  }
  return combo;
}

async function readAllAnalyses(dir: string): Promise<AnalyzeResult[]> {
  try {
    const files = await readdir(dir);
    const results: AnalyzeResult[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        results.push(JSON.parse(await readFile(join(dir, file), "utf8")) as AnalyzeResult);
      } catch {}
    }
    return results;
  } catch {
    return [];
  }
}

function latestForCombo(
  items: AnalyzeResult[],
  type: AnalyzeType,
  provider: LlmProviderKind,
  model: string,
  locale: "ar" | "en",
): AnalyzeResult | null {
  return (
    items
      .filter(
        (a) =>
          a.type === type &&
          a.provider === provider &&
          a.model === model &&
          (a.locale ?? "en") === locale,
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
      )[0] ?? null
  );
}

async function callAnalysisLlm(
  llm: LLMProvider,
  model: string,
  type: AnalyzeType,
  transcript: SessionTranscript,
  locale: "ar" | "en",
  opts: { compact: boolean; ultraCompact: boolean; gatewaySensitive: boolean },
) {
  const limits = contextLimitsFor(type, {
    compact: opts.compact,
    ultraCompact: opts.ultraCompact,
    gatewaySensitive: opts.gatewaySensitive,
  });
  const ctx = buildAnalysisTranscriptContext(transcript, type, limits);
  const { system, user } = buildAnalysisPrompt(type, ctx, locale);

  const response = await llm.complete({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    maxTokens: limits.maxTokens,
  });

  return {
    response,
    patterns: ctx.patterns,
  };
}

type AnalysisAttemptTier = { compact: boolean; ultraCompact: boolean };

function analysisAttemptTiers(
  transcript: SessionTranscript,
  gatewaySensitive: boolean,
): AnalysisAttemptTier[] {
  const heavy = gatewaySensitive && isHeavySession(transcript);
  if (heavy) {
    return [
      { compact: true, ultraCompact: false },
      { compact: true, ultraCompact: true },
    ];
  }
  return [
    { compact: false, ultraCompact: false },
    { compact: true, ultraCompact: false },
    { compact: true, ultraCompact: true },
  ];
}

async function runAnalysisLlmWithRetries(
  llm: LLMProvider,
  model: string,
  type: AnalyzeType,
  transcript: SessionTranscript,
  locale: "ar" | "en",
  gatewaySensitive: boolean,
): Promise<
  | { mode: "llm"; patterns: RecurringPattern[]; responseText: string; tokensUsed?: number }
  | { mode: "heuristic"; patterns: RecurringPattern[]; parsed: ReturnType<typeof buildHeuristicFallbackResult> }
> {
  const tiers = analysisAttemptTiers(transcript, gatewaySensitive);
  let lastErr: unknown;

  for (const tier of tiers) {
    try {
      const result = await callAnalysisLlm(llm, model, type, transcript, locale, {
        ...tier,
        gatewaySensitive,
      });
      return {
        mode: "llm",
        patterns: result.patterns,
        responseText: result.response.text,
        tokensUsed: result.response.tokensUsed,
      };
    } catch (err) {
      lastErr = err;
      if (!isRetryableGatewayError(err)) {
        throw new Error(formatAnalysisLlmError(err, locale));
      }
    }
  }

  if (supportsHeuristicFallback(type)) {
    const limits = contextLimitsFor(type, {
      compact: true,
      ultraCompact: true,
      gatewaySensitive,
    });
    const ctx = buildAnalysisTranscriptContext(transcript, type, limits);
    const parsed = buildHeuristicFallbackResult(type, ctx.patterns, locale);
    if (parsed) {
      return { mode: "heuristic", patterns: ctx.patterns, parsed };
    }
  }

  throw new Error(formatAnalysisLlmError(lastErr, locale));
}

export async function runAnalysis(
  transcript: SessionTranscript,
  opts: {
    type: AnalyzeType;
    provider?: LlmProviderKind;
    model?: string;
    locale?: "ar" | "en";
    force?: boolean;
  },
): Promise<AnalyzeResult> {
  const provider = opts.provider ?? getLlmConfig().defaultProvider;
  const model = resolveModel(provider, opts.model);
  const locale = opts.locale ?? "en";
  const force = opts.force ?? false;
  const dir = analysisCacheDir(transcript.agent, transcript.sessionId);
  const combo = comboKey(opts.type, provider, model, locale);

  if (!force) {
    const existing = latestForCombo(await readAllAnalyses(dir), opts.type, provider, model, locale);
    if (existing) return { ...existing, cached: true };
  }

  const llm = getProvider(provider);
  const gatewaySensitive = isGatewaySensitiveProvider(provider);

  const llmResult = await runAnalysisLlmWithRetries(
    llm,
    model,
    opts.type,
    transcript,
    locale,
    gatewaySensitive,
  );

  let patterns: RecurringPattern[] = llmResult.patterns;
  let responseText = "";
  let tokensUsed: number | undefined;
  let parsed: ReturnType<typeof parseAnalysisResponse>;
  let llmUnavailable: "timeout" | undefined;

  if (llmResult.mode === "heuristic") {
    parsed = llmResult.parsed!;
    responseText = parsed.markdown;
    llmUnavailable = "timeout";
  } else {
    responseText = llmResult.responseText;
    tokensUsed = llmResult.tokensUsed;
    parsed = parseAnalysisResponse(opts.type, responseText, locale, patterns);
  }

  const createdAt = new Date().toISOString();
  const analysisId = runAnalysisId(combo, createdAt, force);
  const result: AnalyzeResult = {
    analysisId,
    type: opts.type,
    markdown: parsed.markdown || responseText.trim(),
    structured: parsed.structured,
    analysisSource: parsed.analysisSource,
    llmUnavailable,
    parseWarning: parsed.parseWarning,
    tokensUsed,
    cached: false,
    provider,
    model,
    locale,
    createdAt,
  };

  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${analysisId}.json`), JSON.stringify(result, null, 2), "utf8");
  return result;
}

export async function listSessionAnalyses(
  agent: string,
  sessionId: string,
): Promise<AnalysisIndexEntry[]> {
  const items = await readAllAnalyses(analysisCacheDir(agent, sessionId));
  return items
    .map((data) => ({
      analysisId: data.analysisId,
      type: data.type,
      provider: data.provider,
      model: data.model,
      locale: data.locale ?? "en",
      createdAt: data.createdAt ?? new Date(0).toISOString(),
      preview: data.markdown.slice(0, 160).replace(/\s+/g, " ").trim(),
      tokensUsed: data.tokensUsed,
      cached: true as const,
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getSessionAnalysis(
  agent: string,
  sessionId: string,
  analysisId: string,
): Promise<AnalyzeResult | null> {
  try {
    const data = JSON.parse(
      await readFile(join(analysisCacheDir(agent, sessionId), `${analysisId}.json`), "utf8"),
    ) as AnalyzeResult;
    return { ...data, cached: true };
  } catch {
    return null;
  }
}

export async function findSessionAnalysis(
  agent: string,
  sessionId: string,
  opts: { type: AnalyzeType; provider: LlmProviderKind; model: string; locale: "ar" | "en" },
): Promise<AnalyzeResult | null> {
  const latest = latestForCombo(
    await readAllAnalyses(analysisCacheDir(agent, sessionId)),
    opts.type,
    opts.provider,
    opts.model,
    opts.locale,
  );
  return latest;
}
