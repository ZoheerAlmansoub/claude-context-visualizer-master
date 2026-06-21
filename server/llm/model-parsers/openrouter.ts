import type { LlmModelInfo, Modality } from "../../../shared/llm-model-info.ts";
import {
  inferCapabilitiesFromSignals,
  inferIsFreeFromId,
  parsePricingPer1M,
} from "../../../shared/llm-model-info.ts";
import type { ModelParser, ModelParserCreds, OpenRouterModel } from "./types.ts";

function parseOpenRouterModel(m: OpenRouterModel, provider: "openrouter" | "groq" | "deepseek" | "nvidia"): LlmModelInfo | null {
  if (!m.id) return null;
  const id = m.id;
  const name = m.name || id;
  const modality = m.architecture?.modality ?? "";
  if (modality && !modality.includes("text") && !modality.includes("->")) {
    if (modality.includes("embed")) return null;
  }

  const inputModalities = (m.architecture?.input_modalities ?? ["text"]).map((x) => {
    const lower = x.toLowerCase();
    if (lower === "text" || lower === "image" || lower === "audio" || lower === "file") return lower as Modality;
    return "text" as Modality;
  });
  const outputModalities = (m.architecture?.output_modalities ?? ["text"]).map((x) => {
    const lower = x.toLowerCase();
    if (lower === "text" || lower === "image") return lower as Modality;
    return "text" as Modality;
  });

  const pricingRaw = parsePricingPer1M(m.pricing?.prompt, m.pricing?.completion);
  const isFree =
    (pricingRaw.hasPricing && pricingRaw.isFree) ||
    (!pricingRaw.hasPricing && provider === "openrouter" ? inferIsFreeFromId(provider, id) : false);
  const caps = inferCapabilitiesFromSignals({
    id,
    name,
    inputModalities,
    supportedParameters: m.supported_parameters,
    architectureModality: modality,
  });

  if (!caps.includes("chat") && caps.includes("embedding")) return null;

  return {
    id,
    name,
    description: m.description,
    provider,
    isFree,
    pricing: isFree ? undefined : { promptPer1M: pricingRaw.promptPer1M, completionPer1M: pricingRaw.completionPer1M },
    contextLength: m.context_length ?? m.top_provider?.context_length ?? undefined,
    maxOutputTokens: m.top_provider?.max_completion_tokens ?? undefined,
    inputModalities,
    outputModalities,
    capabilities: caps,
    expirationDate: m.expiration_date ?? undefined,
    deprecated: Boolean(m.expiration_date),
  };
}

export function parseOpenRouterList(json: unknown, provider: "openrouter"): LlmModelInfo[] {
  const data = (json as { data?: OpenRouterModel[] }).data ?? [];
  return data.map((m) => parseOpenRouterModel(m, provider)).filter(Boolean) as LlmModelInfo[];
}

export const openrouterParser: ModelParser = {
  provider: "openrouter",

  listEndpoint(creds) {
    if (!creds.apiKey) throw new Error("API key is required");
    const base = creds.baseUrl.replace(/\/$/, "");
    return {
      url: `${base}/models`,
      headers: {
        authorization: `Bearer ${creds.apiKey}`,
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "Claude Context Visualizer",
      },
    };
  },

  parseListResponse(json, provider) {
    return parseOpenRouterList(json, provider as "openrouter");
  },
};

export function parseOpenAiCompatList(
  json: unknown,
  provider: "groq" | "deepseek" | "nvidia",
): LlmModelInfo[] {
  const data = (json as { data?: OpenRouterModel[] }).data ?? [];
  const results: LlmModelInfo[] = [];

  for (const raw of data) {
    if (!raw.id) continue;
    const parsed = parseOpenRouterModel(
      {
        id: raw.id,
        name: (raw as { id: string }).id,
        context_length: (raw as { context_length?: number }).context_length,
        pricing: (raw as { pricing?: OpenRouterModel["pricing"] }).pricing,
      },
      provider,
    );
    if (parsed) {
      if (provider === "nvidia") {
        parsed.name = raw.id;
        if (!parsed.capabilities.includes("vision") && /vision|vl|multimodal|nemotron-vl/i.test(raw.id)) {
          parsed.capabilities = [...parsed.capabilities, "vision"];
          if (!parsed.inputModalities.includes("image")) parsed.inputModalities.push("image");
        }
      }
      results.push(parsed);
    }
  }

  return results.filter((m) => m.capabilities.includes("chat") || provider === "nvidia");
}

export function createOpenAiCompatParser(provider: "groq" | "deepseek" | "nvidia"): ModelParser {
  return {
    provider,
    listEndpoint(creds) {
      if (!creds.apiKey) throw new Error("API key is required");
      const base = (provider === "nvidia" ? creds.apiUrl : creds.baseUrl).replace(/\/$/, "");
      const headers: Record<string, string> = { authorization: `Bearer ${creds.apiKey}` };
      return { url: `${base}/models`, headers };
    },
    parseListResponse(json) {
      return parseOpenAiCompatList(json, provider);
    },
  };
}

export const groqParser = createOpenAiCompatParser("groq");
export const deepseekParser = createOpenAiCompatParser("deepseek");
export const nvidiaParser = createOpenAiCompatParser("nvidia");
