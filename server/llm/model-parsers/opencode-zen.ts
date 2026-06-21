import type { Capability, LlmModelInfo, Modality } from "../../../shared/llm-model-info.ts";
import {
  inferCapabilitiesFromSignals,
  inferIsFreeFromId,
  inferVisionFromId,
} from "../../../shared/llm-model-info.ts";
import type { ModelParser, ModelParserCreds } from "./types.ts";

const MODELS_DEV_URL = "https://models.dev/api.json";
const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 30_000;

export type ModelsDevZenModel = {
  id?: string;
  name?: string;
  cost?: { input?: number; output?: number; cache_read?: number; cache_write?: number };
  limit?: { context?: number; output?: number; input?: number };
  tool_call?: boolean;
  reasoning?: boolean;
  attachment?: boolean;
  modalities?: { input?: string[]; output?: string[] };
  status?: string;
};

type ModelsDevCache = {
  expiresAt: number;
  models: Record<string, ModelsDevZenModel>;
};

let modelsDevCache: ModelsDevCache | null = null;

function toModality(value: string): Modality | null {
  const lower = value.toLowerCase();
  if (lower === "text" || lower === "image" || lower === "audio" || lower === "file" || lower === "pdf") {
    if (lower === "pdf") return "file";
    return lower as Modality;
  }
  return null;
}

function parseModalities(raw?: { input?: string[]; output?: string[] }): {
  inputModalities: Modality[];
  outputModalities: Modality[];
} {
  const inputModalities: Modality[] = [];
  const outputModalities: Modality[] = [];
  for (const m of raw?.input ?? []) {
    const mod = toModality(m);
    if (mod && !inputModalities.includes(mod)) inputModalities.push(mod);
  }
  for (const m of raw?.output ?? []) {
    const mod = toModality(m);
    if (mod && !outputModalities.includes(mod)) outputModalities.push(mod);
  }
  if (inputModalities.length === 0) inputModalities.push("text");
  if (outputModalities.length === 0) outputModalities.push("text");
  return { inputModalities, outputModalities };
}

function capabilitiesFromMeta(id: string, name: string, meta?: ModelsDevZenModel): Capability[] {
  const { inputModalities } = parseModalities(meta?.modalities);
  const caps = inferCapabilitiesFromSignals({
    id,
    name,
    inputModalities,
    supportedParameters: meta?.tool_call ? ["tools"] : undefined,
  });
  if (meta?.reasoning && !caps.includes("reasoning")) caps.push("reasoning");
  if (
    meta?.attachment &&
    !caps.includes("vision") &&
    (inputModalities.includes("image") || inferVisionFromId(id, name))
  ) {
    caps.push("vision");
  }
  if (!caps.includes("chat")) caps.unshift("chat");
  return caps;
}

export function parseOpenCodeZenList(json: unknown): LlmModelInfo[] {
  const data = (json as { data?: Array<{ id?: string; owned_by?: string }> }).data ?? [];
  const results: LlmModelInfo[] = [];

  for (const raw of data) {
    if (!raw.id) continue;
    const id = raw.id;
    const name = id;
    const caps = inferCapabilitiesFromSignals({ id, name });
    if (!caps.includes("chat")) continue;

    results.push({
      id,
      name,
      provider: "opencode-zen",
      isFree: inferIsFreeFromId("opencode-zen", id),
      inputModalities: ["text"],
      outputModalities: ["text"],
      capabilities: caps,
      ownedBy: raw.owned_by,
      enriched: false,
    });
  }

  return results;
}

export function enrichOpenCodeZenFromCatalog(
  models: LlmModelInfo[],
  catalog: Record<string, ModelsDevZenModel>,
): LlmModelInfo[] {
  return models.map((model) => {
    const meta = catalog[model.id];
    if (!meta) {
      return {
        ...model,
        isFree: inferIsFreeFromId("opencode-zen", model.id),
        pricing: undefined,
        enriched: false,
      };
    }

    const inputCost = meta.cost?.input ?? 0;
    const outputCost = meta.cost?.output ?? 0;
    const isFree = inputCost === 0 && outputCost === 0;
    const { inputModalities, outputModalities } = parseModalities(meta.modalities);

    return {
      ...model,
      name: meta.name ?? model.name,
      isFree,
      pricing: isFree ? undefined : { promptPer1M: inputCost, completionPer1M: outputCost },
      contextLength: meta.limit?.context,
      maxOutputTokens: meta.limit?.output,
      inputModalities,
      outputModalities,
      capabilities: capabilitiesFromMeta(model.id, meta.name ?? model.name, meta),
      deprecated: meta.status === "deprecated",
      enriched: true,
    };
  });
}

export function invalidateModelsDevZenCache(): void {
  modelsDevCache = null;
}

export async function fetchModelsDevZenCatalog(options?: { skipCache?: boolean }): Promise<
  Record<string, ModelsDevZenModel>
> {
  if (!options?.skipCache && modelsDevCache && modelsDevCache.expiresAt > Date.now()) {
    return modelsDevCache.models;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(MODELS_DEV_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`models.dev fetch failed: ${res.status}`);
    const json = (await res.json()) as { opencode?: { models?: Record<string, ModelsDevZenModel> } };
    const models = json.opencode?.models ?? {};
    modelsDevCache = { models, expiresAt: Date.now() + CACHE_TTL_MS };
    return models;
  } finally {
    clearTimeout(timer);
  }
}

export const opencodeZenParser: ModelParser = {
  provider: "opencode-zen",

  listEndpoint(creds: ModelParserCreds) {
    if (!creds.apiKey) throw new Error("API key is required");
    const base = creds.baseUrl.replace(/\/$/, "");
    return {
      url: `${base}/models`,
      headers: { authorization: `Bearer ${creds.apiKey}` },
    };
  },

  parseListResponse(json) {
    return parseOpenCodeZenList(json);
  },
};
