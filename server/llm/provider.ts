export type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

export type LlmRequest = {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
};

export type LlmResponse = {
  text: string;
  tokensUsed?: number;
};

export interface LLMProvider {
  id: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}
