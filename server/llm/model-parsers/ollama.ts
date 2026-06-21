import type { LlmModelInfo, Modality } from "../../../shared/llm-model-info.ts";
import { inferCapabilitiesFromSignals } from "../../../shared/llm-model-info.ts";
import type { ModelParser, ModelParserCreds, OllamaTagModel } from "./types.ts";

const FETCH_TIMEOUT_MS = 30_000;

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

function extractOllamaContext(modelInfo: Record<string, unknown>): number | undefined {
  for (const [key, value] of Object.entries(modelInfo)) {
    if (key.endsWith(".context_length") && typeof value === "number") return value;
  }
  return undefined;
}

export const ollamaParser: ModelParser = {
  provider: "ollama",

  listEndpoint(creds) {
    const base = creds.baseUrl.replace(/\/$/, "");
    return { url: `${base}/api/tags`, headers: {} };
  },

  parseListResponse(json, provider) {
    const models = (json as { models?: OllamaTagModel[] }).models ?? [];
    return models
      .filter((m) => m.name)
      .map((m) => {
        const id = m.name!;
        const family = m.details?.family ?? id.split(":")[0];
        const caps = inferCapabilitiesFromSignals({ id, name: id, architectureModality: family });
        if (family.includes("embed") || id.includes("embed")) {
          return {
            id,
            name: id,
            provider,
            isFree: true,
            inputModalities: ["text"] as Modality[],
            outputModalities: ["text"] as Modality[],
            capabilities: ["embedding"] as LlmModelInfo["capabilities"],
            parameterSize: m.details?.parameter_size,
            quantization: m.details?.quantization_level,
            diskSizeBytes: m.size,
            enriched: false,
          } satisfies LlmModelInfo;
        }
        return {
          id,
          name: id,
          provider,
          isFree: true,
          inputModalities: ["text"] as Modality[],
          outputModalities: ["text"] as Modality[],
          capabilities: caps.includes("chat") ? caps : ["chat", ...caps],
          parameterSize: m.details?.parameter_size,
          quantization: m.details?.quantization_level,
          diskSizeBytes: m.size,
          enriched: false,
        } satisfies LlmModelInfo;
      });
  },

  async enrichModel(creds, modelId) {
    const base = creds.baseUrl.replace(/\/$/, "");
    const json = (await fetchJson(`${base}/api/show`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: modelId }),
    })) as {
      model_info?: Record<string, unknown>;
      capabilities?: string[];
    };

    const contextLength = json.model_info ? extractOllamaContext(json.model_info) : undefined;
    const caps: LlmModelInfo["capabilities"] = ["chat"];
    for (const c of json.capabilities ?? []) {
      if (c === "vision") caps.push("vision");
      if (c === "tools") caps.push("tools");
      if (c === "thinking") caps.push("reasoning");
    }

    return {
      id: modelId,
      contextLength,
      capabilities: caps,
      enriched: true,
    };
  },
};

export async function enrichOllamaModelsParallel(
  creds: ModelParserCreds,
  modelIds: string[],
  concurrency = 5,
): Promise<Map<string, Partial<LlmModelInfo>>> {
  const results = new Map<string, Partial<LlmModelInfo>>();
  const queue = [...modelIds];
  const workers = Array.from({ length: Math.min(concurrency, queue.length || 1) }, async () => {
    while (queue.length > 0) {
      const id = queue.shift();
      if (!id) break;
      try {
        const partial = await ollamaParser.enrichModel!(creds, id);
        results.set(id, partial);
      } catch {
        results.set(id, { id, enriched: false });
      }
    }
  });
  await Promise.all(workers);
  return results;
}
