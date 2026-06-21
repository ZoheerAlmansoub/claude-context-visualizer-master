/** Shared LLM model catalog types and display helpers (no Node deps). */

export type LlmProviderKind =
  | "anthropic"
  | "openai"
  | "openrouter"
  | "opencode-zen"
  | "groq"
  | "deepseek"
  | "ollama"
  | "nvidia";

export type Modality = "text" | "image" | "audio" | "file";
export type Capability = "chat" | "vision" | "tools" | "reasoning" | "embedding";

export type LlmModelInfo = {
  id: string;
  name: string;
  description?: string;
  provider: LlmProviderKind;

  isFree: boolean;
  pricing?: { promptPer1M: number; completionPer1M: number };

  contextLength?: number;
  maxOutputTokens?: number;
  inputModalities: Modality[];
  outputModalities: Modality[];
  capabilities: Capability[];

  parameterSize?: string;
  quantization?: string;
  diskSizeBytes?: number;
  ownedBy?: string;
  deprecated?: boolean;
  expirationDate?: string;

  enriched?: boolean;
};

export type ModelSortBy = "recommended" | "free-first" | "context-desc" | "name" | "price-asc";

export type ModelFilters = {
  freeOnly?: boolean;
  vision?: boolean;
  tools?: boolean;
  chatOnly?: boolean;
  visionOnly?: boolean;
};

export function formatContextLength(n?: number): string {
  if (n == null || n <= 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

export function formatPricing(model: LlmModelInfo): string {
  if (model.isFree) return "Free";
  if (!model.pricing) return "—";
  const { promptPer1M, completionPer1M } = model.pricing;
  const fmt = (v: number) => (v < 0.01 ? v.toFixed(3) : v.toFixed(2));
  return `$${fmt(promptPer1M)} / $${fmt(completionPer1M)} per 1M`;
}

export function parsePricingPer1M(prompt?: string | number, completion?: string | number): {
  promptPer1M: number;
  completionPer1M: number;
  isFree: boolean;
  hasPricing: boolean;
} {
  const hasPrompt = prompt !== undefined && prompt !== null && String(prompt).trim() !== "";
  const hasCompletion = completion !== undefined && completion !== null && String(completion).trim() !== "";
  const hasPricing = hasPrompt || hasCompletion;
  const p = typeof prompt === "number" ? prompt : parseFloat(String(prompt ?? "0"));
  const c = typeof completion === "number" ? completion : parseFloat(String(completion ?? "0"));
  const promptPer1M = Number.isFinite(p) ? p * 1_000_000 : 0;
  const completionPer1M = Number.isFinite(c) ? c * 1_000_000 : 0;
  return {
    promptPer1M,
    completionPer1M,
    hasPricing,
    isFree: hasPricing && promptPer1M === 0 && completionPer1M === 0,
  };
}

export function inferIsFreeFromId(provider: LlmProviderKind, id: string): boolean {
  const lower = id.toLowerCase();
  if (provider === "ollama") return true;
  if (provider === "opencode-zen" && (lower.includes("-free") || lower.endsWith(":free"))) return true;
  if (provider === "openrouter" && (lower.includes(":free") || lower.endsWith("/free"))) return true;
  return false;
}

const VISION_ID_PATTERNS = [/vision/i, /-vl/i, /multimodal/i, /gpt-4o/i, /gemini.*pro/i, /claude-3/i];
const EMBEDDING_PATTERNS = [/embed/i, /embedding/i, /nomic-embed/i];
const NON_CHAT_PATTERNS = [
  /^text-embedding/i,
  /^whisper/i,
  /^dall-e/i,
  /^tts-/i,
  /^davinci/i,
  /^babbage/i,
  /^moderation/i,
  /^omni-moderation/i,
];

export function isNonChatModelId(id: string): boolean {
  return NON_CHAT_PATTERNS.some((p) => p.test(id));
}

export function inferVisionFromId(id: string, name?: string): boolean {
  const hay = `${id} ${name ?? ""}`;
  return VISION_ID_PATTERNS.some((p) => p.test(hay));
}

export function inferCapabilitiesFromSignals(signals: {
  id: string;
  name?: string;
  inputModalities?: Modality[];
  supportedParameters?: string[];
  architectureModality?: string;
}): Capability[] {
  const caps: Capability[] = [];
  const id = signals.id.toLowerCase();

  if (isNonChatModelId(signals.id) || EMBEDDING_PATTERNS.some((p) => p.test(id))) {
    caps.push("embedding");
    return caps;
  }

  caps.push("chat");

  const inputs = signals.inputModalities ?? [];
  const hasImageInput = inputs.includes("image");
  const modality = signals.architectureModality?.toLowerCase() ?? "";
  if (hasImageInput || modality.includes("image") || inferVisionFromId(signals.id, signals.name)) {
    caps.push("vision");
  }

  const params = (signals.supportedParameters ?? []).map((p) => p.toLowerCase());
  if (params.includes("tools") || params.includes("tool_choice") || params.includes("parallel_tool_calls")) {
    caps.push("tools");
  }
  if (
    params.includes("reasoning") ||
    params.includes("include_reasoning") ||
    params.includes("reasoning_effort") ||
    /thinking|reason|r1|o1|o3|o4/.test(id)
  ) {
    caps.push("reasoning");
  }

  return caps;
}

export function filterModels(models: LlmModelInfo[], filters: ModelFilters): LlmModelInfo[] {
  return models.filter((m) => {
    if (filters.freeOnly && !m.isFree) return false;
    if (filters.vision && !m.capabilities.includes("vision")) return false;
    if (filters.tools && !m.capabilities.includes("tools")) return false;
    if (filters.visionOnly && !m.capabilities.includes("vision")) return false;
    if (filters.chatOnly && m.capabilities.includes("embedding") && !m.capabilities.includes("chat")) {
      return false;
    }
    if (filters.chatOnly && !m.capabilities.includes("chat")) return false;
    return true;
  });
}

function recommendedScore(m: LlmModelInfo): number {
  let score = 0;
  if (m.isFree) score += 1000;
  if (m.contextLength) score += Math.min(m.contextLength / 1000, 500);
  if (m.capabilities.includes("chat")) score += 50;
  if (m.deprecated) score -= 500;
  return score;
}

export function sortModels(models: LlmModelInfo[], sortBy: ModelSortBy): LlmModelInfo[] {
  const copy = [...models];
  switch (sortBy) {
    case "free-first":
      copy.sort((a, b) => {
        if (a.isFree !== b.isFree) return a.isFree ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      break;
    case "context-desc":
      copy.sort((a, b) => (b.contextLength ?? 0) - (a.contextLength ?? 0));
      break;
    case "name":
      copy.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "price-asc":
      copy.sort((a, b) => {
        const pa = a.isFree ? 0 : (a.pricing?.promptPer1M ?? Infinity);
        const pb = b.isFree ? 0 : (b.pricing?.promptPer1M ?? Infinity);
        if (pa !== pb) return pa - pb;
        return a.name.localeCompare(b.name);
      });
      break;
    case "recommended":
    default:
      copy.sort((a, b) => {
        const diff = recommendedScore(b) - recommendedScore(a);
        if (diff !== 0) return diff;
        return a.name.localeCompare(b.name);
      });
      break;
  }
  return copy;
}

export function searchModels(models: LlmModelInfo[], query: string): LlmModelInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return models;
  return models.filter((m) => {
    const hay = `${m.id} ${m.name} ${m.description ?? ""} ${m.ownedBy ?? ""}`.toLowerCase();
    return hay.includes(q);
  });
}

export function pickDefaultModel(
  models: LlmModelInfo[],
  currentId: string | undefined,
  fallbackId?: string,
): string | undefined {
  if (currentId && models.some((m) => m.id === currentId)) return currentId;
  if (fallbackId && models.some((m) => m.id === fallbackId)) return fallbackId;
  const chatModels = models.filter((m) => m.capabilities.includes("chat"));
  const pool = chatModels.length > 0 ? chatModels : models;
  const free = pool.find((m) => m.isFree);
  if (free) return free.id;
  const sorted = sortModels(pool, "recommended");
  return sorted[0]?.id;
}
