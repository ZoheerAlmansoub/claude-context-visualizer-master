import type { LLMProvider, LlmRequest, LlmResponse } from "./provider.ts";
import { getLlmConfig } from "../config.ts";
import { llmFetch } from "./http.ts";

export class NvidiaProvider implements LLMProvider {
  id = "nvidia";

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const cfg = getLlmConfig();
    const key = cfg.nvidiaApiKey;
    if (!key) throw new Error("NVIDIA_API_KEY not configured");

    const base = cfg.nvidiaApiUrl.replace(/\/$/, "");
    const res = await llmFetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
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
          `NVIDIA API gateway timeout (504) — the model did not finish within ~5 minutes. ` +
            `Use a faster model, enable compact analysis, or shorten the session. ${err}`.trim(),
        );
      }
      throw new Error(`NVIDIA API error ${res.status}: ${err}`);
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
