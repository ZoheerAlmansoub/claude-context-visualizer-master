export type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

export type LlmRequest = {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
};

export type LlmResponse = {
  text: string;
  tokensUsed?: number;
  /** Provider stop reason, e.g. stop | length | max_tokens | end_turn */
  finishReason?: string;
  completionTokens?: number;
};

export interface LLMProvider {
  id: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}
