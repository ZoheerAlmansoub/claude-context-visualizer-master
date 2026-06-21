import type { LlmModelInfo, Modality } from "../../../shared/llm-model-info.ts";
import { inferCapabilitiesFromSignals } from "../../../shared/llm-model-info.ts";
import type { AnthropicListModel, ModelParser, ModelParserCreds } from "./types.ts";

function toModalities(values?: string[]): Modality[] {
  const out: Modality[] = [];
  for (const v of values ?? []) {
    const lower = v.toLowerCase();
    if (lower === "text" || lower === "image" || lower === "audio" || lower === "file") {
      out.push(lower);
    }
  }
  if (out.length === 0) out.push("text");
  return out;
}

export const anthropicParser: ModelParser = {
  provider: "anthropic",

  listEndpoint(creds) {
    if (!creds.apiKey) throw new Error("API key is required");
    return {
      url: "https://api.anthropic.com/v1/models",
      headers: {
        "x-api-key": creds.apiKey,
        "anthropic-version": "2023-06-01",
      },
    };
  },

  parseListResponse(json, provider) {
    const data = (json as { data?: AnthropicListModel[] }).data ?? [];
    return data
      .filter((m) => m.id && m.type !== "embedding")
      .map((m) => {
        const id = m.id!;
        const name = m.display_name || id;
        const caps = inferCapabilitiesFromSignals({ id, name });
        return {
          id,
          name,
          provider,
          isFree: false,
          inputModalities: ["text"] as Modality[],
          outputModalities: ["text"] as Modality[],
          capabilities: caps,
        } satisfies LlmModelInfo;
      });
  },
};
