import type { LLMProvider, LlmRequest, LlmResponse } from "./provider.ts";
import { getLlmConfig } from "../config.ts";

export class OllamaProvider implements LLMProvider {
  id = "ollama";

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const base = getLlmConfig().ollamaBaseUrl.replace(/\/$/, "");
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: req.model,
        stream: false,
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama error ${res.status}: ${err}`);
    }

    const data = (await res.json()) as {
      message?: { content?: string };
      eval_count?: number;
    };
    return {
      text: data.message?.content ?? "",
      tokensUsed: data.eval_count,
    };
  }
}
