import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { CACHE_DIR } from "./paths.ts";
import type {
  AnalysisIndexEntry,
  AnalyzeResult,
  AnalyzeType,
  LlmProviderKind,
  SessionTranscript,
} from "./types.ts";
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
    locale,
    createdAt: new Date().toISOString(),
  };

  await mkdir(dir, { recursive: true });
  await writeFile(cachePath, JSON.stringify(result, null, 2), "utf8");
  return result;
}

export async function listSessionAnalyses(
  agent: string,
  sessionId: string,
): Promise<AnalysisIndexEntry[]> {
  const dir = analysisCacheDir(agent, sessionId);
  try {
    const files = await readdir(dir);
    const entries: AnalysisIndexEntry[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const data = JSON.parse(await readFile(join(dir, file), "utf8")) as AnalyzeResult;
        entries.push({
          analysisId: data.analysisId,
          type: data.type,
          provider: data.provider,
          model: data.model,
          locale: data.locale ?? "en",
          createdAt: data.createdAt ?? new Date(0).toISOString(),
          preview: data.markdown.slice(0, 160).replace(/\s+/g, " ").trim(),
          cached: true,
        });
      } catch {}
    }
    return entries.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  } catch {
    return [];
  }
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
  const key = cacheKey(opts.type, opts.provider, opts.model, opts.locale);
  return getSessionAnalysis(agent, sessionId, key);
}
