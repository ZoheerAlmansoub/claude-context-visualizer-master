import type { LLMProvider, LlmRequest, LlmResponse } from "./provider.ts";
import { llmFetch } from "./http.ts";

export type OpenAiCompatConfig = {
  apiKey: string;
  baseUrl: string;
  extraHeaders?: Record<string, string>;
};

export class OpenAiCompatibleProvider implements LLMProvider {
  constructor(
    public id: string,
    private resolveConfig: () => OpenAiCompatConfig,
    private missingKeyError: string,
  ) {}

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const { apiKey, baseUrl, extraHeaders } = this.resolveConfig();
    if (!apiKey) throw new Error(this.missingKeyError);

    const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
    const res = await llmFetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        ...extraHeaders,
      },
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens ?? 4096,
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: 0.2,
        stream: false,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      if (res.status === 504) {
        throw new Error(
          `API gateway timeout (504) — the model did not finish in time. Try a faster model or shorter context. ${err}`.trim(),
        );
      }
      throw new Error(`API error ${res.status}: ${err}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
    };
    const usage = data.usage;
    let tokensUsed = usage?.total_tokens;
    if (tokensUsed == null && usage) {
      const sum = (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
      tokensUsed = sum > 0 ? sum : undefined;
    }
    return {
      text: data.choices?.[0]?.message?.content ?? "",
      tokensUsed,
    };
  }
}
