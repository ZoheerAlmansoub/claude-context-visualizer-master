import type { LlmProviderKind } from "../types.ts";
import { AnthropicProvider } from "./anthropic.ts";
import { OpenAIProvider } from "./openai.ts";
import { OllamaProvider } from "./ollama.ts";
import { NvidiaProvider } from "./nvidia.ts";
import { OpenAiCompatibleProvider } from "./openai-compatible.ts";
import type { LLMProvider } from "./provider.ts";
import { getLlmConfig, resolveModelForProvider } from "../config.ts";
import { openAiCompatConfigFor } from "../llm-config-store.ts";

const OPENAI_COMPAT_IDS: LlmProviderKind[] = ["openrouter", "opencode-zen", "groq", "deepseek"];

const OPENAI_COMPAT_ERRORS: Record<(typeof OPENAI_COMPAT_IDS)[number], string> = {
  openrouter: "OPENROUTER_API_KEY not configured",
  "opencode-zen": "OPENCODE_ZEN_API_KEY not configured",
  groq: "GROQ_API_KEY not configured",
  deepseek: "DEEPSEEK_API_KEY not configured",
};

function openAiCompatProvider(id: (typeof OPENAI_COMPAT_IDS)[number]): LLMProvider {
  return new OpenAiCompatibleProvider(
    id,
    () => openAiCompatConfigFor(id),
    OPENAI_COMPAT_ERRORS[id],
  );
}

export function getProvider(kind?: LlmProviderKind): LLMProvider {
  const cfg = getLlmConfig();
  const id = kind ?? cfg.defaultProvider;
  switch (id) {
    case "openai":
      return new OpenAIProvider();
    case "openrouter":
    case "opencode-zen":
    case "groq":
    case "deepseek":
      return openAiCompatProvider(id);
    case "ollama":
      return new OllamaProvider();
    case "nvidia":
      return new NvidiaProvider();
    case "anthropic":
      return new AnthropicProvider();
    default:
      return new AnthropicProvider();
  }
}

export function resolveModel(provider: LlmProviderKind, model?: string): string {
  return resolveModelForProvider(provider, model);
}
