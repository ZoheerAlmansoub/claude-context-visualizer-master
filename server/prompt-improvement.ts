import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { CACHE_DIR } from "./paths.ts";
import type {
  AgentKind,
  LlmProviderKind,
  PromptImprovementResult,
  SessionTranscript,
} from "./types.ts";
import { buildPromptImprovementPrompt, formatPromptImprovementMarkdown } from "./llm/prompts.ts";
import {
  coerceImprovementFields,
  parseImprovementResponse,
  type ParsedImprovement,
} from "./llm/parse-improvement-response.ts";
import { getProvider, resolveModel } from "./llm/router.ts";
import { getLlmConfig } from "./config.ts";

function improvementsDir(agent: string, sessionId: string): string {
  return join(CACHE_DIR, "prompt-improvements", agent, sessionId);
}

function textHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

function improvementKey(
  turn: number,
  originalText: string,
  provider: LlmProviderKind,
  model: string,
  locale: string,
): string {
  return createHash("sha256")
    .update(`improve:${turn}:${textHash(originalText)}:${provider}:${model}:${locale}`)
    .digest("hex")
    .slice(0, 16);
}

function sanitizeImprovementResult(result: PromptImprovementResult): PromptImprovementResult {
  const coerced = coerceImprovementFields({
    improvedPrompt: result.improvedPrompt,
    rationale: result.rationale,
    tips: result.tips ?? [],
    issues: result.issues ?? [],
  });

  if (
    coerced.improvedPrompt === result.improvedPrompt &&
    coerced.rationale === result.rationale &&
    coerced.tips.length === (result.tips?.length ?? 0) &&
    coerced.issues.length === (result.issues?.length ?? 0)
  ) {
    return result;
  }

  return {
    ...result,
    ...coerced,
    markdown: formatPromptImprovementMarkdown({
      ...coerced,
      originalText: result.originalText,
      turn: result.turn,
      locale: result.locale,
    }),
  };
}

function findUserMessage(transcript: SessionTranscript, messageId: string) {
  return transcript.userMessages.messages.find((m) => m.id === messageId) ?? null;
}

function priorUserMessages(transcript: SessionTranscript, turn: number, limit = 3): string[] {
  return transcript.userMessages.messages
    .filter((m) => m.turn < turn)
    .slice(-limit)
    .map((m) => m.text);
}

export async function listPromptImprovements(
  agent: AgentKind,
  sessionId: string,
): Promise<PromptImprovementResult[]> {
  const dir = improvementsDir(agent, sessionId);
  try {
    const files = await readdir(dir);
    const results: PromptImprovementResult[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const data = JSON.parse(await readFile(join(dir, file), "utf8")) as PromptImprovementResult;
        results.push(sanitizeImprovementResult({ ...data, cached: true }));
      } catch {}
    }
    return results.sort((a, b) => a.turn - b.turn);
  } catch {
    return [];
  }
}

export async function improveUserPrompt(
  transcript: SessionTranscript,
  messageId: string,
  opts: {
    provider?: LlmProviderKind;
    model?: string;
    locale?: "ar" | "en";
    force?: boolean;
  } = {},
): Promise<PromptImprovementResult> {
  const message = findUserMessage(transcript, messageId);
  if (!message) throw new Error(`Message not found: ${messageId}`);

  const provider = opts.provider ?? getLlmConfig().defaultProvider;
  const model = resolveModel(provider, opts.model);
  const locale = opts.locale ?? "en";
  const key = improvementKey(message.turn, message.text, provider, model, locale);
  const dir = improvementsDir(transcript.agent, transcript.sessionId);
  const cachePath = join(dir, `${key}.json`);

  if (!opts.force) {
    try {
      const cached = JSON.parse(await readFile(cachePath, "utf8")) as PromptImprovementResult;
      return sanitizeImprovementResult({ ...cached, cached: true });
    } catch {}
  }

  const { system, user } = buildPromptImprovementPrompt(
    message.text,
    { turn: message.turn, priorUserMessages: priorUserMessages(transcript, message.turn) },
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

  let parsed: ParsedImprovement;
  try {
    parsed = parseImprovementResponse(response.text);
  } catch {
    throw new Error(
      locale === "ar"
        ? "تعذّر تحليل رد النموذج. جرّب Re-improve أو غيّر المزود."
        : "Could not parse model response. Try Re-improve or switch provider.",
    );
  }

  if (!parsed.improvedPrompt) {
    throw new Error("LLM returned empty improved prompt");
  }

  const createdAt = new Date().toISOString();
  const result: PromptImprovementResult = {
    improvementId: key,
    messageId: message.id,
    turn: message.turn,
    originalText: message.text,
    improvedPrompt: parsed.improvedPrompt,
    rationale: parsed.rationale,
    tips: parsed.tips,
    issues: parsed.issues,
    markdown: formatPromptImprovementMarkdown({
      ...parsed,
      originalText: message.text,
      turn: message.turn,
      locale,
    }),
    tokensUsed: response.tokensUsed,
    cached: false,
    provider,
    model,
    locale,
    createdAt,
  };

  await mkdir(dir, { recursive: true });
  await writeFile(cachePath, JSON.stringify(result, null, 2), "utf8");
  return sanitizeImprovementResult(result);
}

export async function getPromptImprovement(
  agent: AgentKind,
  sessionId: string,
  improvementId: string,
): Promise<PromptImprovementResult | null> {
  try {
    const data = JSON.parse(
      await readFile(join(improvementsDir(agent, sessionId), `${improvementId}.json`), "utf8"),
    ) as PromptImprovementResult;
    return sanitizeImprovementResult({ ...data, cached: true });
  } catch {
    return null;
  }
}
