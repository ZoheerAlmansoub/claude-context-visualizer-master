import type { LLMProvider, LlmRequest, LlmResponse } from "./provider.ts";
import { getLlmConfig } from "../config.ts";
import { llmFetch } from "./http.ts";

export class OpenAIProvider implements LLMProvider {
  id = "openai";

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const key = getLlmConfig().openaiApiKey;
    if (!key) throw new Error("OPENAI_API_KEY not configured");

    const res = await llmFetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens ?? 4096,
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${err}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    };
    return {
      text: data.choices?.[0]?.message?.content ?? "",
      tokensUsed: data.usage?.total_tokens,
    };
  }
}
