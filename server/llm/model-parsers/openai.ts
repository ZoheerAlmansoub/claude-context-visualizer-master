import type { LlmModelInfo, Modality } from "../../../shared/llm-model-info.ts";
import { inferCapabilitiesFromSignals, isNonChatModelId } from "../../../shared/llm-model-info.ts";
import type { ModelParser, ModelParserCreds, OpenAiListModel } from "./types.ts";

export const openaiParser: ModelParser = {
  provider: "openai",

  listEndpoint(creds) {
    if (!creds.apiKey) throw new Error("API key is required");
    return {
      url: "https://api.openai.com/v1/models",
      headers: { authorization: `Bearer ${creds.apiKey}` },
    };
  },

  parseListResponse(json, provider) {
    const data = (json as { data?: OpenAiListModel[] }).data ?? [];
    return data
      .filter((m) => m.id && !isNonChatModelId(m.id))
      .map((m) => {
        const id = m.id!;
        const name = id;
        const caps = inferCapabilitiesFromSignals({ id, name });
        return {
          id,
          name,
          provider,
          isFree: false,
          ownedBy: m.owned_by,
          inputModalities: ["text"] as Modality[],
          outputModalities: ["text"] as Modality[],
          capabilities: caps,
        } satisfies LlmModelInfo;
      });
  },
};
