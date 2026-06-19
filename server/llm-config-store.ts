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
  openrouterApiKey: string;
  openrouterBaseUrl: string;
  openrouterModel: string;
  opencodeZenApiKey: string;
  opencodeZenBaseUrl: string;
  opencodeZenModel: string;
  groqApiKey: string;
  groqBaseUrl: string;
  groqModel: string;
  deepseekApiKey: string;
  deepseekBaseUrl: string;
  deepseekModel: string;
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

export type LlmSettingsPatch = Partial<LlmSettingsData>;

export const UNCHANGED_KEY_SENTINEL = "__UNCHANGED__";

const SETTINGS_PATH = join(CACHE_DIR, "llm-settings.json");

export const LLM_PROVIDER_ORDER: LlmProviderKind[] = [
  "anthropic",
  "openai",
  "openrouter",
  "opencode-zen",
  "groq",
  "deepseek",
  "ollama",
  "nvidia",
];

type ProviderDefinition = {
  id: LlmProviderKind;
  label: string;
  modelField: keyof LlmSettingsData;
  apiKeyField?: keyof LlmSettingsData;
  baseUrlField?: keyof LlmSettingsData;
  apiUrlField?: keyof LlmSettingsData;
  textModelField?: keyof LlmSettingsData;
  visionModelField?: keyof LlmSettingsData;
  defaultModel: string;
  defaultBaseUrl?: string;
  envApiKey?: string;
  envBaseUrl?: string;
  envModel?: string;
};

const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    apiKeyField: "anthropicApiKey",
    modelField: "anthropicModel",
    defaultModel: "claude-sonnet-4-20250514",
    envApiKey: "ANTHROPIC_API_KEY",
  },
  {
    id: "openai",
    label: "OpenAI",
    apiKeyField: "openaiApiKey",
    modelField: "openaiModel",
    defaultModel: "gpt-4o-mini",
    envApiKey: "OPENAI_API_KEY",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    apiKeyField: "openrouterApiKey",
    baseUrlField: "openrouterBaseUrl",
    modelField: "openrouterModel",
    defaultModel: "google/gemini-2.0-flash-001",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    envApiKey: "OPENROUTER_API_KEY",
    envBaseUrl: "OPENROUTER_BASE_URL",
    envModel: "OPENROUTER_MODEL",
  },
  {
    id: "opencode-zen",
    label: "OpenCode Zen",
    apiKeyField: "opencodeZenApiKey",
    baseUrlField: "opencodeZenBaseUrl",
    modelField: "opencodeZenModel",
    defaultModel: "deepseek-v4-flash-free",
    defaultBaseUrl: "https://opencode.ai/zen/v1",
    envApiKey: "OPENCODE_ZEN_API_KEY",
    envBaseUrl: "OPENCODE_ZEN_BASE_URL",
    envModel: "OPENCODE_ZEN_MODEL",
  },
  {
    id: "groq",
    label: "Groq",
    apiKeyField: "groqApiKey",
    baseUrlField: "groqBaseUrl",
    modelField: "groqModel",
    defaultModel: "llama-3.3-70b-versatile",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    envApiKey: "GROQ_API_KEY",
    envBaseUrl: "GROQ_BASE_URL",
    envModel: "GROQ_MODEL",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    apiKeyField: "deepseekApiKey",
    baseUrlField: "deepseekBaseUrl",
    modelField: "deepseekModel",
    defaultModel: "deepseek-chat",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    envApiKey: "DEEPSEEK_API_KEY",
    envBaseUrl: "DEEPSEEK_BASE_URL",
    envModel: "DEEPSEEK_MODEL",
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    baseUrlField: "ollamaBaseUrl",
    modelField: "ollamaModel",
    defaultModel: "llama3.2",
    defaultBaseUrl: "http://localhost:11434",
    envBaseUrl: "OLLAMA_BASE_URL",
    envModel: "OLLAMA_MODEL",
  },
  {
    id: "nvidia",
    label: "NVIDIA NIM",
    apiKeyField: "nvidiaApiKey",
    apiUrlField: "nvidiaApiUrl",
    textModelField: "nvidiaTextModel",
    visionModelField: "nvidiaVisionModel",
    modelField: "nvidiaTextModel",
    defaultModel: "nvidia/nemotron-3-ultra-550b-a55b",
    defaultBaseUrl: "https://integrate.api.nvidia.com/v1",
    envApiKey: "NVIDIA_API_KEY",
    envBaseUrl: "NVIDIA_API_URL",
    envModel: "NVIDIA_TEXT_MODEL",
  },
];

function definitionFor(id: LlmProviderKind): ProviderDefinition {
  const def = PROVIDER_DEFINITIONS.find((p) => p.id === id);
  if (!def) throw new Error(`Unknown provider: ${id}`);
  return def;
}

const DEFAULTS: LlmSettingsData = {
  defaultProvider: "anthropic",
  defaultModel: "claude-sonnet-4-20250514",
  anthropicApiKey: "",
  anthropicModel: "claude-sonnet-4-20250514",
  openaiApiKey: "",
  openaiModel: "gpt-4o-mini",
  openrouterApiKey: "",
  openrouterBaseUrl: "https://openrouter.ai/api/v1",
  openrouterModel: "google/gemini-2.0-flash-001",
  opencodeZenApiKey: "",
  opencodeZenBaseUrl: "https://opencode.ai/zen/v1",
  opencodeZenModel: "deepseek-v4-flash-free",
  groqApiKey: "",
  groqBaseUrl: "https://api.groq.com/openai/v1",
  groqModel: "llama-3.3-70b-versatile",
  deepseekApiKey: "",
  deepseekBaseUrl: "https://api.deepseek.com/v1",
  deepseekModel: "deepseek-chat",
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
  const patch: Partial<LlmSettingsData> = {};
  const defaultProvider = (env("DEFAULT_LLM_PROVIDER") || DEFAULTS.defaultProvider) as LlmProviderKind;
  patch.defaultProvider = defaultProvider;

  for (const def of PROVIDER_DEFINITIONS) {
    if (def.envApiKey) {
      const value = env(def.envApiKey);
      if (value && def.apiKeyField) (patch as Record<string, string>)[def.apiKeyField] = value;
    }
    if (def.envBaseUrl && def.baseUrlField) {
      const value = env(def.envBaseUrl);
      if (value) (patch as Record<string, string>)[def.baseUrlField] = value;
    }
    if (def.envBaseUrl && def.apiUrlField) {
      const value = env(def.envBaseUrl);
      if (value) (patch as Record<string, string>)[def.apiUrlField] = value;
    }
    if (def.envModel) {
      const value = env(def.envModel);
      if (value) (patch as Record<string, string>)[def.modelField] = value;
    }
  }

  const nvidiaText = env("NVIDIA_TEXT_MODEL");
  if (nvidiaText) {
    patch.nvidiaTextModel = nvidiaText;
    patch.nvidiaVisionModel = env("NVIDIA_VISION_MODEL") || nvidiaText;
  }

  patch.defaultModel =
    env("DEFAULT_LLM_MODEL") || providerDefaultModel({ ...DEFAULTS, ...patch } as LlmSettingsData, defaultProvider);

  if (!patch.opencodeZenApiKey) {
    const opencodeKey = env("OPENCODE_API_KEY");
    if (opencodeKey) patch.opencodeZenApiKey = opencodeKey;
  }

  return patch;
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

function readField(data: LlmSettingsData, field: keyof LlmSettingsData): string {
  return String(data[field] ?? "");
}

export function providerDefaultModel(data: LlmSettingsData, id: LlmProviderKind): string {
  const def = definitionFor(id);
  if (def.textModelField) return readField(data, def.textModelField) || def.defaultModel;
  return readField(data, def.modelField) || def.defaultModel;
}

export function providerConfigured(data: LlmSettingsData, id: LlmProviderKind): boolean {
  const def = definitionFor(id);
  if (id === "ollama") return Boolean(readField(data, "ollamaBaseUrl"));
  if (def.apiKeyField) return Boolean(readField(data, def.apiKeyField));
  return false;
}

export function providerBaseUrl(data: LlmSettingsData, id: LlmProviderKind): string {
  const def = definitionFor(id);
  if (def.apiUrlField) return readField(data, def.apiUrlField) || def.defaultBaseUrl || "";
  if (def.baseUrlField) return readField(data, def.baseUrlField) || def.defaultBaseUrl || "";
  return def.defaultBaseUrl ?? "";
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

function providerToView(data: LlmSettingsData, def: ProviderDefinition): LlmProviderSettingsView {
  const apiKey = def.apiKeyField ? readField(data, def.apiKeyField) : "";
  return {
    id: def.id,
    label: def.label,
    configured: providerConfigured(data, def.id),
    defaultModel: providerDefaultModel(data, def.id),
    hasApiKey: Boolean(apiKey),
    apiKeyMasked: def.apiKeyField ? maskApiKey(apiKey) : null,
    baseUrl: def.baseUrlField ? providerBaseUrl(data, def.id) : undefined,
    apiUrl: def.apiUrlField ? providerBaseUrl(data, def.id) : undefined,
    textModel: def.textModelField ? readField(data, def.textModelField) : undefined,
    visionModel: def.visionModelField ? readField(data, def.visionModelField) : undefined,
  };
}

export function getLlmSettingsView(): LlmSettingsView {
  const data = runtimeSettings;
  return {
    defaultProvider: data.defaultProvider,
    defaultModel: data.defaultModel,
    storagePath: SETTINGS_PATH,
    liveReload: true,
    providers: LLM_PROVIDER_ORDER.map((id) => providerToView(data, definitionFor(id))),
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
  const next: LlmSettingsData = { ...cur };

  for (const def of PROVIDER_DEFINITIONS) {
    if (def.apiKeyField) {
      const key = def.apiKeyField;
      if (patch[key] !== undefined) {
        (next as Record<string, string>)[key] = resolveApiKey(readField(cur, key), patch[key] as string);
      }
    }
    if (def.baseUrlField) {
      const key = def.baseUrlField;
      const incoming = patch[key];
      if (incoming !== undefined) (next as Record<string, string>)[key] = String(incoming).trim() || readField(cur, key);
    }
    if (def.apiUrlField) {
      const key = def.apiUrlField;
      const incoming = patch[key];
      if (incoming !== undefined) (next as Record<string, string>)[key] = String(incoming).trim() || readField(cur, key);
    }
    if (def.modelField) {
      const key = def.modelField;
      const incoming = patch[key];
      if (incoming !== undefined) (next as Record<string, string>)[key] = String(incoming).trim() || readField(cur, key);
    }
    if (def.textModelField) {
      const key = def.textModelField;
      const incoming = patch[key];
      if (incoming !== undefined) (next as Record<string, string>)[key] = String(incoming).trim() || readField(cur, key);
    }
    if (def.visionModelField) {
      const key = def.visionModelField;
      const incoming = patch[key];
      if (incoming !== undefined) (next as Record<string, string>)[key] = String(incoming).trim() || readField(cur, key);
    }
  }

  if (patch.defaultProvider) next.defaultProvider = patch.defaultProvider;
  if (patch.defaultModel?.trim()) next.defaultModel = patch.defaultModel.trim();

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
    openrouterApiKey: data.openrouterApiKey || null,
    openrouterBaseUrl: data.openrouterBaseUrl,
    openrouterModel: data.openrouterModel,
    opencodeZenApiKey: data.opencodeZenApiKey || null,
    opencodeZenBaseUrl: data.opencodeZenBaseUrl,
    opencodeZenModel: data.opencodeZenModel,
    groqApiKey: data.groqApiKey || null,
    groqBaseUrl: data.groqBaseUrl,
    groqModel: data.groqModel,
    deepseekApiKey: data.deepseekApiKey || null,
    deepseekBaseUrl: data.deepseekBaseUrl,
    deepseekModel: data.deepseekModel,
    nvidiaApiKey: data.nvidiaApiKey || null,
    nvidiaApiUrl: data.nvidiaApiUrl,
    nvidiaTextModel: data.nvidiaTextModel,
    nvidiaVisionModel: data.nvidiaVisionModel,
    ollamaBaseUrl: data.ollamaBaseUrl,
    providers: LLM_PROVIDER_ORDER.map((id) => {
      const def = definitionFor(id);
      return {
        id,
        label: def.label,
        configured: providerConfigured(data, id),
        defaultModel: providerDefaultModel(data, id),
      };
    }),
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
  const def = definitionFor(provider);

  if (provider === "anthropic") {
    return {
      apiKey: resolveApiKey(data.anthropicApiKey, overrides.apiKey) || null,
      baseUrl: "",
      apiUrl: "",
      model,
    };
  }

  if (provider === "openai") {
    return {
      apiKey: resolveApiKey(data.openaiApiKey, overrides.apiKey) || null,
      baseUrl: "https://api.openai.com/v1",
      apiUrl: "",
      model,
    };
  }

  if (provider === "ollama") {
    return {
      apiKey: null,
      baseUrl: (overrides.baseUrl?.trim() || data.ollamaBaseUrl).replace(/\/$/, ""),
      apiUrl: "",
      model,
    };
  }

  if (provider === "nvidia") {
    return {
      apiKey: resolveApiKey(data.nvidiaApiKey, overrides.apiKey) || null,
      baseUrl: "",
      apiUrl: (overrides.apiUrl?.trim() || data.nvidiaApiUrl).replace(/\/$/, ""),
      model: overrides.model?.trim() || data.nvidiaTextModel,
    };
  }

  if (def.apiKeyField && def.baseUrlField) {
    const apiKeyField = def.apiKeyField;
    const baseUrlField = def.baseUrlField;
    return {
      apiKey: resolveApiKey(readField(data, apiKeyField), overrides.apiKey) || null,
      baseUrl: (overrides.baseUrl?.trim() || overrides.apiUrl?.trim() || readField(data, baseUrlField) || def.defaultBaseUrl || "").replace(
        /\/$/,
        "",
      ),
      apiUrl: "",
      model,
    };
  }

  return { apiKey: null, baseUrl: "", apiUrl: "", model };
}

export function openAiCompatConfigFor(provider: LlmProviderKind): {
  apiKey: string;
  baseUrl: string;
  extraHeaders?: Record<string, string>;
} {
  const data = runtimeSettings;
  switch (provider) {
    case "openrouter":
      return {
        apiKey: data.openrouterApiKey,
        baseUrl: data.openrouterBaseUrl,
        extraHeaders: {
          "HTTP-Referer": "http://localhost:5173",
          "X-Title": "Agent Session Intelligence",
        },
      };
    case "opencode-zen":
      return { apiKey: data.opencodeZenApiKey, baseUrl: data.opencodeZenBaseUrl };
    case "groq":
      return { apiKey: data.groqApiKey, baseUrl: data.groqBaseUrl };
    case "deepseek":
      return { apiKey: data.deepseekApiKey, baseUrl: data.deepseekBaseUrl };
    default:
      throw new Error(`Not an OpenAI-compatible provider: ${provider}`);
  }
}

export function isOpenAiCompatibleProvider(provider: LlmProviderKind): boolean {
  return provider === "openrouter" || provider === "opencode-zen" || provider === "groq" || provider === "deepseek";
}
