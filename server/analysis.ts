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
import { buildAnalysisPrompt, isStructuredAnalysisType } from "./llm/prompts.ts";
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
import {
  formatTruncatedStructuredAnalysisError,
  isAcceptableStructuredAnalysis,
  scaledMaxTokens,
  structuredAnalysisAttempts,
} from "./analysis-structured-output.ts";
import { getProvider, resolveModel } from "./llm/router.ts";
import { getLlmConfig } from "./config.ts";
import type { LLMProvider } from "./llm/provider.ts";
import { loadProjectContext, type ProjectContextSnapshot } from "./project-context.ts";
import { analysisSessionCacheDirName } from "./analysis-cache-path.ts";

function analysisCacheDir(agent: string, sessionId: string): string {
  return join(CACHE_DIR, "analysis", agent, analysisSessionCacheDirName(sessionId));
}

function comboKey(
  type: AnalyzeType,
  provider: LlmProviderKind,
  model: string,
  locale: string,
  transcriptKey: string,
  projectInventoryHash?: string,
): string {
  const base = `${type}:${provider}:${model}:${locale}:${transcriptKey}`;
  const withProject = projectInventoryHash ? `${base}:${projectInventoryHash}` : base;
  return createHash("sha256").update(withProject).digest("hex").slice(0, 12);
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
  opts: {
    compact: boolean;
    ultraCompact: boolean;
    gatewaySensitive: boolean;
    projectContext?: ProjectContextSnapshot;
    crossSessionPatterns?: string;
    maxTokens?: number;
  },
) {
  const limits = contextLimitsFor(type, {
    compact: opts.compact,
    ultraCompact: opts.ultraCompact,
    gatewaySensitive: opts.gatewaySensitive,
  });
  const ctx = buildAnalysisTranscriptContext(transcript, type, limits, {
    projectContext: opts.projectContext,
    crossSessionPatterns: opts.crossSessionPatterns,
  });
  const { system, user } = buildAnalysisPrompt(type, ctx, locale);

  const response = await llm.complete({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    maxTokens: opts.maxTokens ?? limits.maxTokens,
  });

  return {
    response,
    patterns: ctx.patterns,
    maxTokens: opts.maxTokens ?? limits.maxTokens,
  };
}

type AnalysisAttemptTier = { compact: boolean; ultraCompact: boolean; maxTokensScale: number };

function unstructuredAnalysisAttempts(
  transcript: SessionTranscript,
  gatewaySensitive: boolean,
): AnalysisAttemptTier[] {
  const heavy = gatewaySensitive && isHeavySession(transcript);
  if (heavy) {
    return [
      { compact: true, ultraCompact: false, maxTokensScale: 1 },
      { compact: true, ultraCompact: true, maxTokensScale: 1 },
    ];
  }
  return [
    { compact: false, ultraCompact: false, maxTokensScale: 1 },
    { compact: true, ultraCompact: false, maxTokensScale: 1 },
    { compact: true, ultraCompact: true, maxTokensScale: 1 },
  ];
}

async function runAnalysisLlmWithRetries(
  llm: LLMProvider,
  model: string,
  type: AnalyzeType,
  transcript: SessionTranscript,
  locale: "ar" | "en",
  gatewaySensitive: boolean,
  contextExtras: {
    projectContext?: ProjectContextSnapshot;
    crossSessionPatterns?: string;
  },
): Promise<
  | {
      mode: "llm";
      patterns: RecurringPattern[];
      responseText: string;
      tokensUsed?: number;
      parsed: ReturnType<typeof parseAnalysisResponse>;
    }
  | { mode: "heuristic"; patterns: RecurringPattern[]; parsed: ReturnType<typeof buildHeuristicFallbackResult> }
> {
  const structured = isStructuredAnalysisType(type);
  const attempts = structured
    ? structuredAnalysisAttempts(transcript, gatewaySensitive)
    : unstructuredAnalysisAttempts(transcript, gatewaySensitive);

  let lastErr: unknown;

  for (const tier of attempts) {
    const limits = contextLimitsFor(type, {
      compact: tier.compact,
      ultraCompact: tier.ultraCompact,
      gatewaySensitive,
    });
    const maxTokens = scaledMaxTokens(limits, tier.maxTokensScale);

    try {
      const result = await callAnalysisLlm(llm, model, type, transcript, locale, {
        ...tier,
        gatewaySensitive,
        ...contextExtras,
        maxTokens,
      });
      const responseText = result.response.text;
      const parseOpts = {
        agent: transcript.agent,
        projectContext: contextExtras.projectContext,
        toolEvents: transcript.toolEvents,
        compactionBoundaryIndex: transcript.compactionBoundaryIndex,
      };

      if (structured) {
        const parsed = parseAnalysisResponse(type, responseText, locale, result.patterns, parseOpts);
        if (
          !isAcceptableStructuredAnalysis(
            type,
            responseText,
            parsed,
            result.response,
            maxTokens,
            locale,
          )
        ) {
          if (tier !== attempts[attempts.length - 1]) continue;
          throw new Error(formatTruncatedStructuredAnalysisError(type, locale));
        }
        return {
          mode: "llm",
          patterns: result.patterns,
          responseText,
          tokensUsed: result.response.tokensUsed,
          parsed,
        };
      }

      const parsed = parseAnalysisResponse(type, responseText, locale, result.patterns, parseOpts);
      return {
        mode: "llm",
        patterns: result.patterns,
        responseText,
        tokensUsed: result.response.tokensUsed,
        parsed,
      };
    } catch (err) {
      lastErr = err;
      if (err instanceof Error && /incomplete JSON|JSON غير مكتملة|max_tokens truncation/i.test(err.message)) {
        throw err;
      }
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
    const ctx = buildAnalysisTranscriptContext(transcript, type, limits, contextExtras);
    const parsed = buildHeuristicFallbackResult(type, ctx.patterns, locale, {
      agent: transcript.agent,
      projectContext: contextExtras.projectContext,
      toolEvents: transcript.toolEvents,
      compactionBoundaryIndex: transcript.compactionBoundaryIndex,
    });
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
    transcriptMtimeMs?: number;
    projectSlug?: string;
    projectPath?: string;
    crossSessionPatterns?: string;
    projectContext?: ProjectContextSnapshot;
  },
): Promise<AnalyzeResult> {
  const provider = opts.provider ?? getLlmConfig().defaultProvider;
  const model = resolveModel(provider, opts.model);
  const locale = opts.locale ?? "en";
  const force = opts.force ?? false;

  let projectContext = opts.projectContext;
  if (!projectContext && opts.projectSlug) {
    projectContext = await loadProjectContext({
      agent: transcript.agent,
      projectSlug: opts.projectSlug,
      cwd: opts.projectPath,
    });
  }

  const transcriptKey = createHash("sha256")
    .update(`${transcript.filePath}:${opts.transcriptMtimeMs ?? 0}`)
    .digest("hex")
    .slice(0, 8);

  const dir = analysisCacheDir(transcript.agent, transcript.sessionId);
  const combo = comboKey(
    opts.type,
    provider,
    model,
    locale,
    transcriptKey,
    projectContext?.inventoryHash,
  );

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
    {
      projectContext,
      crossSessionPatterns: opts.crossSessionPatterns,
    },
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
    parsed = llmResult.parsed;
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
    rawLlmResponse:
      parsed.rawLlmResponse ??
      (llmResult.mode !== "heuristic" ? responseText.trim() : undefined),
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
