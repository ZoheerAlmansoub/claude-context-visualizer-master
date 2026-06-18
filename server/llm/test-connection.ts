import type { LlmProviderKind } from "../types.ts";
import { credentialsForTest, type LlmTestOverrides } from "../llm-config-store.ts";

export type LlmTestResult = {
  ok: boolean;
  provider: LlmProviderKind;
  model: string;
  latencyMs: number;
  message: string;
  preview?: string;
  error?: string;
};

const TEST_PROMPT = "Reply with exactly: OK";
const TEST_TIMEOUT_MS = 45_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function testLlmConnection(
  provider: LlmProviderKind,
  overrides: LlmTestOverrides = {},
): Promise<LlmTestResult> {
  const creds = credentialsForTest(provider, overrides);
  const started = Date.now();

  try {
    if (provider === "anthropic") {
      if (!creds.apiKey) throw new Error("API key is required");
      const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": creds.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: creds.model,
          max_tokens: 16,
          messages: [{ role: "user", content: TEST_PROMPT }],
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { content?: Array<{ text?: string }> };
      const preview = data.content?.[0]?.text?.trim() ?? "";
      return okResult(provider, creds.model, started, preview);
    }

    if (provider === "openai") {
      if (!creds.apiKey) throw new Error("API key is required");
      const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${creds.apiKey}`,
        },
        body: JSON.stringify({
          model: creds.model,
          max_tokens: 16,
          messages: [{ role: "user", content: TEST_PROMPT }],
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const preview = data.choices?.[0]?.message?.content?.trim() ?? "";
      return okResult(provider, creds.model, started, preview);
    }

    if (provider === "nvidia") {
      if (!creds.apiKey) throw new Error("API key is required");
      const res = await fetchWithTimeout(`${creds.apiUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${creds.apiKey}`,
        },
        body: JSON.stringify({
          model: creds.model,
          max_tokens: 16,
          messages: [{ role: "user", content: TEST_PROMPT }],
          stream: false,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const preview = data.choices?.[0]?.message?.content?.trim() ?? "";
      return okResult(provider, creds.model, started, preview);
    }

    if (provider === "ollama") {
      const res = await fetchWithTimeout(`${creds.baseUrl}/api/tags`, { method: "GET" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { models?: Array<{ name?: string }> };
      const names = (data.models ?? []).map((m) => m.name).filter(Boolean) as string[];
      const hasModel = names.some((n) => n === creds.model || n.startsWith(`${creds.model}:`));
      return {
        ok: true,
        provider,
        model: creds.model,
        latencyMs: Date.now() - started,
        message: hasModel
          ? `Connected to Ollama. Model "${creds.model}" is available.`
          : `Connected to Ollama (${names.length} models). "${creds.model}" not found — update model name.`,
        preview: names.slice(0, 5).join(", "),
      };
    }

    throw new Error(`Unknown provider: ${provider}`);
  } catch (e: unknown) {
    let msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("abort") || msg.includes("AbortError")) {
      msg = `Timed out after ${TEST_TIMEOUT_MS / 1000}s — try a faster model or check network.`;
    }
    return {
      ok: false,
      provider,
      model: creds.model,
      latencyMs: Date.now() - started,
      message: "Connection failed",
      error: msg.slice(0, 500),
    };
  }
}

function okResult(
  provider: LlmProviderKind,
  model: string,
  started: number,
  preview: string,
): LlmTestResult {
  return {
    ok: true,
    provider,
    model,
    latencyMs: Date.now() - started,
    message: "Connection successful",
    preview: preview.slice(0, 120),
  };
}
