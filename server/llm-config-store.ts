import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CACHE_DIR } from "./paths.ts";
import type { LlmProviderKind } from "./types.ts";

export type LlmSettingsData = {
  defaultProvider: LlmProviderKind;
  defaultModel: string;
  anthropicApiKey: string;
  anthropicModel: string;
  openaiApiKey: string;
  openaiModel: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  nvidiaApiKey: string;
  nvidiaApiUrl: string;
  nvidiaTextModel: string;
  nvidiaVisionModel: string;
};

export type LlmProviderSettingsView = {
  id: LlmProviderKind;
  label: string;
  configured: boolean;
  defaultModel: string;
  apiKeyMasked: string | null;
  hasApiKey: boolean;
  baseUrl?: string;
  apiUrl?: string;
  textModel?: string;
  visionModel?: string;
};

export type LlmSettingsView = {
  defaultProvider: LlmProviderKind;
  defaultModel: string;
  storagePath: string;
  liveReload: boolean;
  providers: LlmProviderSettingsView[];
};

export type LlmSettingsPatch = {
  defaultProvider?: LlmProviderKind;
  defaultModel?: string;
  anthropicApiKey?: string;
  anthropicModel?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  nvidiaApiKey?: string;
  nvidiaApiUrl?: string;
  nvidiaTextModel?: string;
  nvidiaVisionModel?: string;
};

export const UNCHANGED_KEY_SENTINEL = "__UNCHANGED__";

const SETTINGS_PATH = join(CACHE_DIR, "llm-settings.json");

const PROVIDER_LABELS: Record<LlmProviderKind, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  ollama: "Ollama (local)",
  nvidia: "NVIDIA NIM",
};

const DEFAULTS: LlmSettingsData = {
  defaultProvider: "anthropic",
  defaultModel: "claude-sonnet-4-20250514",
  anthropicApiKey: "",
  anthropicModel: "claude-sonnet-4-20250514",
  openaiApiKey: "",
  openaiModel: "gpt-4o-mini",
  ollamaBaseUrl: "http://localhost:11434",
  ollamaModel: "llama3.2",
  nvidiaApiKey: "",
  nvidiaApiUrl: "https://integrate.api.nvidia.com/v1",
  nvidiaTextModel: "nvidia/nemotron-3-ultra-550b-a55b",
  nvidiaVisionModel: "nvidia/nemotron-3-ultra-550b-a55b",
};

function env(key: string): string {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : "";
}

function settingsFromEnv(): Partial<LlmSettingsData> {
  const nvidiaText = env("NVIDIA_TEXT_MODEL") || DEFAULTS.nvidiaTextModel;
  const defaultProvider = (env("DEFAULT_LLM_PROVIDER") || DEFAULTS.defaultProvider) as LlmProviderKind;
  return {
    defaultProvider,
    defaultModel:
      env("DEFAULT_LLM_MODEL") ||
      (defaultProvider === "openai"
        ? DEFAULTS.openaiModel
        : defaultProvider === "ollama"
          ? DEFAULTS.ollamaModel
          : defaultProvider === "nvidia"
            ? nvidiaText
            : DEFAULTS.anthropicModel),
    anthropicApiKey: env("ANTHROPIC_API_KEY"),
    openaiApiKey: env("OPENAI_API_KEY"),
    nvidiaApiKey: env("NVIDIA_API_KEY"),
    nvidiaApiUrl: env("NVIDIA_API_URL") || DEFAULTS.nvidiaApiUrl,
    nvidiaTextModel: nvidiaText,
    nvidiaVisionModel: env("NVIDIA_VISION_MODEL") || nvidiaText,
    ollamaBaseUrl: env("OLLAMA_BASE_URL") || DEFAULTS.ollamaBaseUrl,
  };
}

function readSettingsFile(): Partial<LlmSettingsData> {
  try {
    if (!existsSync(SETTINGS_PATH)) return {};
    return JSON.parse(readFileSync(SETTINGS_PATH, "utf8")) as Partial<LlmSettingsData>;
  } catch {
    return {};
  }
}

function mergeSettings(base: LlmSettingsData, patch: Partial<LlmSettingsData>): LlmSettingsData {
  const next = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "" && k.endsWith("ApiKey")) continue;
    (next as Record<string, unknown>)[k] = typeof v === "string" ? v.trim() : v;
  }
  return next;
}

function maskApiKey(key: string): string | null {
  if (!key) return null;
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, Math.min(6, key.length))}••••${key.slice(-4)}`;
}

function providerDefaultModel(data: LlmSettingsData, id: LlmProviderKind): string {
  switch (id) {
    case "openai":
      return data.openaiModel;
    case "ollama":
      return data.ollamaModel;
    case "nvidia":
      return data.nvidiaTextModel;
    default:
      return data.anthropicModel;
  }
}

function providerConfigured(data: LlmSettingsData, id: LlmProviderKind): boolean {
  if (id === "ollama") return Boolean(data.ollamaBaseUrl);
  if (id === "anthropic") return Boolean(data.anthropicApiKey);
  if (id === "openai") return Boolean(data.openaiApiKey);
  if (id === "nvidia") return Boolean(data.nvidiaApiKey);
  return false;
}

let runtimeSettings: LlmSettingsData = mergeSettings(DEFAULTS, {
  ...settingsFromEnv(),
  ...readSettingsFile(),
});

function persistSettings(data: LlmSettingsData): void {
  mkdirSync(dirname(SETTINGS_PATH), { recursive: true });
  writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2), "utf8");
}

export function getLlmSettingsData(): LlmSettingsData {
  return { ...runtimeSettings };
}

export function getLlmSettingsView(): LlmSettingsView {
  const data = runtimeSettings;
  const providerIds: LlmProviderKind[] = ["anthropic", "openai", "ollama", "nvidia"];
  return {
    defaultProvider: data.defaultProvider,
    defaultModel: data.defaultModel,
    storagePath: SETTINGS_PATH,
    liveReload: true,
    providers: providerIds.map((id) => ({
      id,
      label: PROVIDER_LABELS[id],
      configured: providerConfigured(data, id),
      defaultModel: providerDefaultModel(data, id),
      hasApiKey:
        id === "anthropic"
          ? Boolean(data.anthropicApiKey)
          : id === "openai"
            ? Boolean(data.openaiApiKey)
            : id === "nvidia"
              ? Boolean(data.nvidiaApiKey)
              : false,
      apiKeyMasked:
        id === "anthropic"
          ? maskApiKey(data.anthropicApiKey)
          : id === "openai"
            ? maskApiKey(data.openaiApiKey)
            : id === "nvidia"
              ? maskApiKey(data.nvidiaApiKey)
              : null,
      baseUrl: id === "ollama" ? data.ollamaBaseUrl : undefined,
      apiUrl: id === "nvidia" ? data.nvidiaApiUrl : undefined,
      textModel: id === "nvidia" ? data.nvidiaTextModel : undefined,
      visionModel: id === "nvidia" ? data.nvidiaVisionModel : undefined,
    })),
  };
}

function resolveApiKey(current: string, incoming: string | undefined): string {
  if (incoming == null || incoming === UNCHANGED_KEY_SENTINEL) return current;
  const trimmed = incoming.trim();
  if (!trimmed || trimmed.includes("••••")) return current;
  return trimmed;
}

export function updateLlmSettings(patch: LlmSettingsPatch): LlmSettingsView {
  const cur = runtimeSettings;
  const next: LlmSettingsData = {
    ...cur,
    defaultProvider: (patch.defaultProvider as LlmProviderKind) ?? cur.defaultProvider,
    defaultModel: patch.defaultModel?.trim() || cur.defaultModel,
    anthropicApiKey: resolveApiKey(cur.anthropicApiKey, patch.anthropicApiKey),
    anthropicModel: patch.anthropicModel?.trim() || cur.anthropicModel,
    openaiApiKey: resolveApiKey(cur.openaiApiKey, patch.openaiApiKey),
    openaiModel: patch.openaiModel?.trim() || cur.openaiModel,
    ollamaBaseUrl: patch.ollamaBaseUrl?.trim() || cur.ollamaBaseUrl,
    ollamaModel: patch.ollamaModel?.trim() || cur.ollamaModel,
    nvidiaApiKey: resolveApiKey(cur.nvidiaApiKey, patch.nvidiaApiKey),
    nvidiaApiUrl: patch.nvidiaApiUrl?.trim() || cur.nvidiaApiUrl,
    nvidiaTextModel: patch.nvidiaTextModel?.trim() || cur.nvidiaTextModel,
    nvidiaVisionModel: patch.nvidiaVisionModel?.trim() || cur.nvidiaVisionModel,
  };

  if (patch.defaultProvider && !patch.defaultModel) {
    next.defaultModel = providerDefaultModel(next, patch.defaultProvider);
  }

  runtimeSettings = next;
  persistSettings(next);
  return getLlmSettingsView();
}

export function resolveModelForProvider(provider: LlmProviderKind, model?: string): string {
  if (model?.trim()) return model.trim();
  const data = runtimeSettings;
  if (provider === data.defaultProvider && data.defaultModel) return data.defaultModel;
  return providerDefaultModel(data, provider);
}

export function getLlmConfigLegacy() {
  const data = runtimeSettings;
  return {
    defaultProvider: data.defaultProvider,
    defaultModel: data.defaultModel,
    anthropicApiKey: data.anthropicApiKey || null,
    openaiApiKey: data.openaiApiKey || null,
    nvidiaApiKey: data.nvidiaApiKey || null,
    nvidiaApiUrl: data.nvidiaApiUrl,
    nvidiaTextModel: data.nvidiaTextModel,
    nvidiaVisionModel: data.nvidiaVisionModel,
    ollamaBaseUrl: data.ollamaBaseUrl,
    providers: (["anthropic", "openai", "ollama", "nvidia"] as LlmProviderKind[]).map((id) => ({
      id,
      label: PROVIDER_LABELS[id],
      configured: providerConfigured(data, id),
      defaultModel: providerDefaultModel(data, id),
    })),
  };
}

export function getPublicLlmConfigFromStore() {
  const legacy = getLlmConfigLegacy();
  return {
    defaultProvider: legacy.defaultProvider,
    defaultModel: legacy.defaultModel,
    providers: legacy.providers.map((p) => ({
      id: p.id,
      label: p.label,
      configured: p.configured,
      defaultModel: p.defaultModel,
    })),
  };
}

export type LlmTestOverrides = {
  apiKey?: string;
  baseUrl?: string;
  apiUrl?: string;
  model?: string;
};

export function credentialsForTest(provider: LlmProviderKind, overrides: LlmTestOverrides = {}) {
  const data = runtimeSettings;
  const model = resolveModelForProvider(provider, overrides.model);
  switch (provider) {
    case "anthropic":
      return {
        apiKey: resolveApiKey(data.anthropicApiKey, overrides.apiKey) || null,
        baseUrl: "",
        apiUrl: "",
        model,
      };
    case "openai":
      return {
        apiKey: resolveApiKey(data.openaiApiKey, overrides.apiKey) || null,
        baseUrl: "",
        apiUrl: "",
        model,
      };
    case "nvidia":
      return {
        apiKey: resolveApiKey(data.nvidiaApiKey, overrides.apiKey) || null,
        baseUrl: "",
        apiUrl: (overrides.apiUrl?.trim() || data.nvidiaApiUrl).replace(/\/$/, ""),
        model: overrides.model?.trim() || data.nvidiaTextModel,
      };
    case "ollama":
      return {
        apiKey: null,
        baseUrl: (overrides.baseUrl?.trim() || data.ollamaBaseUrl).replace(/\/$/, ""),
        apiUrl: "",
        model,
      };
    default:
      return { apiKey: null, baseUrl: "", apiUrl: "", model };
  }
}
