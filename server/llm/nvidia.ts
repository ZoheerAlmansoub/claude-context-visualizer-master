import type { LLMProvider, LlmRequest, LlmResponse } from "./provider.ts";
import { getLlmConfig } from "../config.ts";
import { llmFetch } from "./http.ts";
import { llmResponseFromOpenAiCompletion } from "./completion-response.ts";

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

    const data = (await res.json()) as Parameters<typeof llmResponseFromOpenAiCompletion>[0];
    return llmResponseFromOpenAiCompletion(data);
  }
}
