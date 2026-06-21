import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  pickDefaultModel,
  type LlmModelInfo,
  type ModelFilters,
} from "@shared/llm-model-info.ts";
import {
  api,
  UNCHANGED_KEY_SENTINEL,
  type LlmProviderKind,
} from "../api";

export type ModelCatalogCredentials = {
  apiKey?: string;
  baseUrl?: string;
  apiUrl?: string;
  configured?: boolean;
  hasApiKey?: boolean;
};

export type UseModelCatalogOptions = {
  autoFetch?: boolean;
  fallbackModelId?: string;
  onAutoSelect?: (modelId: string) => void;
  debounceMs?: number;
};

const sessionCache = new Map<string, LlmModelInfo[]>();

function cacheKey(provider: LlmProviderKind, creds: ModelCatalogCredentials): string {
  const keyPart = creds.apiKey === UNCHANGED_KEY_SENTINEL ? "stored" : creds.apiKey?.slice(0, 8) ?? "";
  return `${provider}|${creds.baseUrl ?? ""}|${creds.apiUrl ?? ""}|${keyPart}`;
}

function canFetch(provider: LlmProviderKind, creds: ModelCatalogCredentials): boolean {
  if (provider === "ollama") return Boolean(creds.baseUrl?.trim() || creds.configured);
  if (creds.apiKey && creds.apiKey !== UNCHANGED_KEY_SENTINEL && creds.apiKey.length >= 8) return true;
  if (creds.hasApiKey || creds.configured) return true;
  return false;
}

function apiOverrides(creds: ModelCatalogCredentials) {
  return {
    apiKey: creds.apiKey === UNCHANGED_KEY_SENTINEL ? undefined : creds.apiKey || undefined,
    baseUrl: creds.baseUrl || undefined,
    apiUrl: creds.apiUrl || undefined,
  };
}

export function useModelCatalog(
  provider: LlmProviderKind,
  credentials: ModelCatalogCredentials,
  options: UseModelCatalogOptions = {},
) {
  const { autoFetch = true, fallbackModelId, onAutoSelect, debounceMs = 600 } = options;
  const [models, setModels] = useState<LlmModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchModels = useCallback(async () => {
    if (!canFetch(provider, credentials)) {
      setModels([]);
      setError(null);
      return;
    }

    abortRef.current?.abort();
    setLoading(true);
    setError(null);

    try {
      const result = await api.listLlmModels(provider, apiOverrides(credentials));
      if (!result.ok) {
        setModels([]);
        setError(result.error ?? "Failed to load models");
        setCached(false);
        return;
      }
      setModels(result.models);
      setCached(Boolean(result.cached));
      sessionCache.set(cacheKey(provider, credentials), result.models);
    } catch (e) {
      setModels([]);
      setError(String(e));
      setCached(false);
    } finally {
      setLoading(false);
    }
  }, [
    provider,
    credentials.apiKey,
    credentials.baseUrl,
    credentials.apiUrl,
    credentials.configured,
    credentials.hasApiKey,
  ]);

  const retry = useCallback(() => {
    void fetchModels();
  }, [fetchModels]);

  const enrichModel = useCallback(
    async (modelId: string) => {
      if (provider !== "ollama") return;
      try {
        const result = await api.enrichLlmModel(provider, modelId, apiOverrides(credentials));
        if (result.ok && result.model) {
          setModels((prev) =>
            prev.map((m) => (m.id === modelId ? { ...m, ...result.model, id: m.id } : m)),
          );
        }
      } catch {
        /* ignore enrich errors */
      }
    },
    [provider, credentials],
  );

  useEffect(() => {
    if (!autoFetch) return;
    if (!canFetch(provider, credentials)) {
      setModels([]);
      return;
    }

    const key = cacheKey(provider, credentials);
    const hit = sessionCache.get(key);
    if (hit) {
      setModels(hit);
      setCached(true);
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchModels();
    }, debounceMs);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [autoFetch, provider, credentials, debounceMs, fetchModels]);

  useEffect(() => {
    if (provider !== "ollama" || models.length === 0) return;
    const unenriched = models.filter((m) => !m.enriched && m.capabilities.includes("chat")).slice(0, 20);
    for (const m of unenriched) {
      void enrichModel(m.id);
    }
  }, [provider, models, enrichModel]);

  const pickDefault = useCallback(
    (currentId: string | undefined) =>
      pickDefaultModel(models, currentId, fallbackModelId),
    [models, fallbackModelId],
  );

  return useMemo(
    () => ({
      models,
      loading,
      error,
      cached,
      fetchModels,
      retry,
      enrichModel,
      pickDefault,
      canFetch: canFetch(provider, credentials),
    }),
    [models, loading, error, cached, fetchModels, retry, enrichModel, pickDefault, provider, credentials],
  );
}

export type ModelCatalogFilters = ModelFilters & {
  query?: string;
  sortBy?: import("@shared/llm-model-info.ts").ModelSortBy;
};
