import type { LlmProviderKind } from "../types.ts";
import { AnthropicProvider } from "./anthropic.ts";
import { OpenAIProvider } from "./openai.ts";
import { OllamaProvider } from "./ollama.ts";
import { NvidiaProvider } from "./nvidia.ts";
import type { LLMProvider } from "./provider.ts";
import { getLlmConfig, resolveModelForProvider } from "../config.ts";

export function getProvider(kind?: LlmProviderKind): LLMProvider {
  const cfg = getLlmConfig();
  const id = kind ?? cfg.defaultProvider;
  switch (id) {
    case "openai":
      return new OpenAIProvider();
    case "ollama":
      return new OllamaProvider();
    case "nvidia":
      return new NvidiaProvider();
    case "anthropic":
    default:
      return new AnthropicProvider();
  }
}

export function resolveModel(provider: LlmProviderKind, model?: string): string {
  return resolveModelForProvider(provider, model);
}
