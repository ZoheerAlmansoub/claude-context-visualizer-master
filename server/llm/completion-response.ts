import type { LlmResponse } from "./provider.ts";

type OpenAiStyleCompletion = {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  usage?: {
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  };
};

/** Normalize OpenAI-compatible chat completion payloads (OpenAI, NVIDIA, Groq, etc.). */
export function llmResponseFromOpenAiCompletion(data: OpenAiStyleCompletion): LlmResponse {
  const choice = data.choices?.[0];
  const usage = data.usage;
  let tokensUsed = usage?.total_tokens;
  if (tokensUsed == null && usage) {
    const sum = (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
    tokensUsed = sum > 0 ? sum : undefined;
  }
  return {
    text: choice?.message?.content ?? "",
    tokensUsed,
    finishReason: choice?.finish_reason,
    completionTokens: usage?.completion_tokens,
  };
}

type AnthropicMessageResponse = {
  content?: Array<{ type: string; text?: string }>;
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
};

export function llmResponseFromAnthropicMessage(data: AnthropicMessageResponse): LlmResponse {
  const text = data.content?.map((c) => c.text ?? "").join("") ?? "";
  const completionTokens = data.usage?.output_tokens;
  const tokensUsed = (data.usage?.input_tokens ?? 0) + (completionTokens ?? 0);
  return {
    text,
    tokensUsed: tokensUsed > 0 ? tokensUsed : undefined,
    finishReason: data.stop_reason,
    completionTokens,
  };
}
