import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { CACHE_DIR } from "./paths.ts";
import type { AnalyzeResult, AnalyzeType, LlmProviderKind, SessionTranscript } from "./types.ts";
import { buildAnalysisPrompt } from "./llm/prompts.ts";
import { getProvider, resolveModel } from "./llm/router.ts";
import { getLlmConfig } from "./config.ts";

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "\n\n… [truncated for LLM context limit]";
}

function analysisCacheDir(agent: string, sessionId: string): string {
  return join(CACHE_DIR, "analysis", agent, sessionId);
}

function cacheKey(type: AnalyzeType, provider: LlmProviderKind, model: string, locale: string): string {
  return createHash("sha256").update(`${type}:${provider}:${model}:${locale}`).digest("hex").slice(0, 16);
}

export async function runAnalysis(
  transcript: SessionTranscript,
  opts: {
    type: AnalyzeType;
    provider?: LlmProviderKind;
    model?: string;
    locale?: "ar" | "en";
  },
): Promise<AnalyzeResult> {
  const provider = opts.provider ?? getLlmConfig().defaultProvider;
  const model = resolveModel(provider, opts.model);
  const locale = opts.locale ?? "en";
  const key = cacheKey(opts.type, provider, model, locale);
  const dir = analysisCacheDir(transcript.agent, transcript.sessionId);
  const cachePath = join(dir, `${key}.json`);

  try {
    const cached = JSON.parse(await readFile(cachePath, "utf8")) as AnalyzeResult;
    return { ...cached, cached: true };
  } catch {}

  const toolSummary = transcript.toolEvents
    .slice(0, 100)
    .map(
      (t) =>
        `Turn ${t.turn}: ${t.toolName}${t.isError ? " (ERROR)" : ""} — ${t.resultText.slice(0, 200)}`,
    )
    .join("\n");

  const conversationText = transcript.conversation
    .map((m) => `[${m.role} turn ${m.turn}] ${m.text.slice(0, 2000)}`)
    .join("\n\n");

  const { system, user } = buildAnalysisPrompt(
    opts.type,
    {
      userMessages: truncate(transcript.userMessages.aggregatedText, 24_000),
      conversation: truncate(conversationText, 24_000),
      toolSummary: truncate(toolSummary, 8_000),
    },
    locale,
  );

  const llm = getProvider(provider);
  const response = await llm.complete({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    maxTokens: 2048,
  });

  const result: AnalyzeResult = {
    analysisId: key,
    type: opts.type,
    markdown: response.text,
    tokensUsed: response.tokensUsed,
    cached: false,
    provider,
    model,
  };

  await mkdir(dir, { recursive: true });
  await writeFile(cachePath, JSON.stringify(result, null, 2), "utf8");
  return result;
}
