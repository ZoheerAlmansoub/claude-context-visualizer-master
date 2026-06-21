import type { LlmProviderKind } from "../../../shared/llm-model-info.ts";
import type { LlmModelInfo } from "../../../shared/llm-model-info.ts";

export type ModelParserCreds = {
  apiKey: string | null;
  baseUrl: string;
  apiUrl: string;
};

export type ListEndpoint = {
  url: string;
  headers: Record<string, string>;
  method?: "GET" | "POST";
  body?: string;
};

export interface ModelParser {
  provider: LlmProviderKind;
  listEndpoint(creds: ModelParserCreds): ListEndpoint;
  parseListResponse(json: unknown, provider: LlmProviderKind): LlmModelInfo[];
  enrichModel?(creds: ModelParserCreds, modelId: string): Promise<Partial<LlmModelInfo>>;
}

export type OpenAiListModel = {
  id?: string;
  owned_by?: string;
  created?: number;
  context_length?: number;
};

export type OpenRouterModel = {
  id?: string;
  name?: string;
  description?: string;
  context_length?: number;
  expiration_date?: string | null;
  pricing?: {
    prompt?: string | number;
    completion?: string | number;
  };
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
    modality?: string;
  };
  supported_parameters?: string[];
  top_provider?: {
    max_completion_tokens?: number | null;
    context_length?: number | null;
  };
};

export type OllamaTagModel = {
  name?: string;
  size?: number;
  details?: {
    parameter_size?: string;
    quantization_level?: string;
    family?: string;
  };
};

export type AnthropicListModel = {
  id?: string;
  display_name?: string;
  type?: string;
};
