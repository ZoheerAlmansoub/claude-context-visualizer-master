import { createHash } from "node:crypto";
import type { LlmModelInfo, LlmProviderKind } from "../../shared/llm-model-info.ts";
import { sortModels } from "../../shared/llm-model-info.ts";
import type { LlmTestOverrides } from "../llm-config-store.ts";
import { credentialsForTest } from "../llm-config-store.ts";
import { getModelParser } from "./model-parsers/index.ts";
import { enrichOllamaModelsParallel } from "./model-parsers/ollama.ts";
import {
  enrichOpenCodeZenFromCatalog,
  fetchModelsDevZenCatalog,
  invalidateModelsDevZenCache,
} from "./model-parsers/opencode-zen.ts";
import type { ModelParserCreds } from "./model-parsers/types.ts";

export type LlmModelsResult = {
  ok: boolean;
  provider: LlmProviderKind;
  models: LlmModelInfo[];
  latencyMs: number;
  cached?: boolean;
  error?: string;
};

export type LlmModelEnrichResult = {
  ok: boolean;
  provider: LlmProviderKind;
  model: Partial<LlmModelInfo>;
  error?: string;
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 30_000;

type CacheEntry = {
  expiresAt: number;
  models: LlmModelInfo[];
};

const catalogCache = new Map<string, CacheEntry>();

function cacheKey(provider: LlmProviderKind, creds: ModelParserCreds): string {
  const apiKeyPrefix = creds.apiKey ? creds.apiKey.slice(0, 8) : "";
  const raw = `${provider}|${creds.baseUrl}|${creds.apiUrl}|${apiKeyPrefix}`;
  return createHash("sha256").update(raw).digest("hex");
}

function toParserCreds(
  provider: LlmProviderKind,
  overrides: LlmTestOverrides,
): ModelParserCreds {
  const creds = credentialsForTest(provider, overrides);
  return {
    apiKey: creds.apiKey,
    baseUrl: creds.baseUrl || creds.apiUrl,
    apiUrl: creds.apiUrl || creds.baseUrl,
  };
}

async function fetchList(endpoint: ReturnType<ReturnType<typeof getModelParser>["listEndpoint"]>): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint.url, {
      method: endpoint.method ?? "GET",
      headers: endpoint.headers,
      body: endpoint.body,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      const err = new Error(text.slice(0, 500));
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

function mergeEnrichment(base: LlmModelInfo, partial: Partial<LlmModelInfo>): LlmModelInfo {
  return {
    ...base,
    ...partial,
    id: base.id,
    name: base.name,
    provider: base.provider,
    inputModalities: partial.inputModalities ?? base.inputModalities,
    outputModalities: partial.outputModalities ?? base.outputModalities,
    capabilities: partial.capabilities ?? base.capabilities,
  };
}

export function invalidateModelCatalogCache(_provider?: LlmProviderKind): void {
  catalogCache.clear();
  invalidateModelsDevZenCache();
}

export async function listLlmModels(
  provider: LlmProviderKind,
  overrides: LlmTestOverrides = {},
  options?: { skipCache?: boolean; enrichOllama?: boolean },
): Promise<LlmModelsResult> {
  const started = Date.now();
  const parserCreds = toParserCreds(provider, overrides);

  if (provider !== "ollama" && !parserCreds.apiKey) {
    return {
      ok: false,
      provider,
      models: [],
      latencyMs: Date.now() - started,
      error: "API key is required",
    };
  }

  const key = cacheKey(provider, parserCreds);
  if (!options?.skipCache) {
    const hit = catalogCache.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      return {
        ok: true,
        provider,
        models: hit.models,
        latencyMs: Date.now() - started,
        cached: true,
      };
    }
  }

  try {
    const parser = getModelParser(provider);
    const endpoint = parser.listEndpoint(parserCreds);
    const json = await fetchList(endpoint);
    let models = parser.parseListResponse(json, provider);
    models = sortModels(models, "recommended");

    if (provider === "ollama" && options?.enrichOllama !== false) {
      const chatIds = models.filter((m) => m.capabilities.includes("chat")).map((m) => m.id);
      const enrichments = await enrichOllamaModelsParallel(parserCreds, chatIds.slice(0, 50), 5);
      models = models.map((m) => {
        const partial = enrichments.get(m.id);
        return partial ? mergeEnrichment(m, partial) : m;
      });
    }

    if (provider === "opencode-zen") {
      try {
        const zenCatalog = await fetchModelsDevZenCatalog();
        models = enrichOpenCodeZenFromCatalog(models, zenCatalog);
      } catch {
        // Keep unenriched list; pricing stays unknown (not free).
      }
    }

    catalogCache.set(key, { models, expiresAt: Date.now() + CACHE_TTL_MS });

    return {
      ok: true,
      provider,
      models,
      latencyMs: Date.now() - started,
      cached: false,
    };
  } catch (e: unknown) {
    let msg = e instanceof Error ? e.message : String(e);
    const status = (e as Error & { status?: number }).status;
    if (msg.includes("abort") || msg.includes("AbortError")) {
      msg = `Timed out after ${FETCH_TIMEOUT_MS / 1000}s`;
    }
    if (status === 401 || status === 403) {
      catalogCache.delete(key);
    }
    return {
      ok: false,
      provider,
      models: [],
      latencyMs: Date.now() - started,
      error: msg,
    };
  }
}

export async function enrichLlmModel(
  provider: LlmProviderKind,
  modelId: string,
  overrides: LlmTestOverrides = {},
): Promise<LlmModelEnrichResult> {
  if (provider !== "ollama") {
    return { ok: false, provider, model: { id: modelId }, error: "Enrichment only supported for Ollama" };
  }
  const parserCreds = toParserCreds(provider, overrides);
  const parser = getModelParser(provider);
  if (!parser.enrichModel) {
    return { ok: false, provider, model: { id: modelId }, error: "Parser does not support enrichment" };
  }
  try {
    const partial = await parser.enrichModel(parserCreds, modelId);
    return { ok: true, provider, model: partial };
  } catch (e: unknown) {
    return {
      ok: false,
      provider,
      model: { id: modelId },
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
