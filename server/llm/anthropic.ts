import type { LLMProvider, LlmRequest, LlmResponse } from "./provider.ts";
import { getLlmConfig } from "../config.ts";
import { llmFetch } from "./http.ts";

export class AnthropicProvider implements LLMProvider {
  id = "anthropic";

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const key = getLlmConfig().anthropicApiKey;
    if (!key) throw new Error("ANTHROPIC_API_KEY not configured");

    const system = req.messages.find((m) => m.role === "system")?.content ?? "";
    const messages = req.messages.filter((m) => m.role !== "system");

    const res = await llmFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens ?? 4096,
        system: system || undefined,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${err}`);
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = data.content?.map((c) => c.text ?? "").join("") ?? "";
    const tokensUsed =
      (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
    return { text, tokensUsed };
  }
}
