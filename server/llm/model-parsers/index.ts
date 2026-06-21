import type { LlmProviderKind } from "../../../shared/llm-model-info.ts";
import { anthropicParser } from "./anthropic.ts";
import { deepseekParser, groqParser, nvidiaParser } from "./openrouter.ts";
import { opencodeZenParser } from "./opencode-zen.ts";
import { ollamaParser } from "./ollama.ts";
import { openaiParser } from "./openai.ts";
import { openrouterParser } from "./openrouter.ts";
import type { ModelParser } from "./types.ts";

const PARSERS: Record<LlmProviderKind, ModelParser> = {
  anthropic: anthropicParser,
  openai: openaiParser,
  openrouter: openrouterParser,
  "opencode-zen": opencodeZenParser,
  groq: groqParser,
  deepseek: deepseekParser,
  ollama: ollamaParser,
  nvidia: nvidiaParser,
};

export function getModelParser(provider: LlmProviderKind): ModelParser {
  const parser = PARSERS[provider];
  if (!parser) throw new Error(`No model parser for provider: ${provider}`);
  return parser;
}

export { anthropicParser, openaiParser, openrouterParser, ollamaParser };
export { opencodeZenParser } from "./opencode-zen.ts";
export { groqParser, deepseekParser, nvidiaParser };
