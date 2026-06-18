import type { AgentKind } from "./types.ts";

/** JSONL record shape after agent-specific normalization — consumed by snapshot.ts */
export type NormalizedRecord = {
  type?: string;
  subtype?: string;
  role?: string;
  message?: {
    content?: unknown;
    usage?: Record<string, unknown> | null;
    model?: string | null;
  };
  attachment?: unknown;
  compactMetadata?: {
    preTokens?: number;
    postTokens?: number;
    trigger?: string;
  };
};

function piContentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content == null ? "" : JSON.stringify(content);
  return content
    .map((block) => {
      if (typeof block === "string") return block;
      if (!block || typeof block !== "object") return "";
      const b = block as Record<string, unknown>;
      if (b.type === "text") return (b.text as string) ?? "";
      if (b.type === "thinking") return (b.thinking as string) ?? "";
      return JSON.stringify(b);
    })
    .join("\n");
}

function normalizePiUsage(usage: Record<string, unknown> | null | undefined) {
  if (!usage) return usage;
  return {
    ...usage,
    input_tokens: usage.input ?? 0,
    cache_creation_input_tokens: usage.cacheWrite ?? 0,
    cache_read_input_tokens: usage.cacheRead ?? 0,
    output_tokens: usage.output ?? 0,
  };
}

function normalizePiContent(content: unknown): unknown[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  if (!Array.isArray(content)) return [];
  return content.flatMap((block): unknown[] => {
    if (typeof block === "string") return [{ type: "text", text: block }];
    if (!block || typeof block !== "object") return [];
    const b = block as Record<string, unknown>;
    if (b.type === "text") return [{ type: "text", text: b.text ?? "" }];
    if (b.type === "thinking") {
      return [{ type: "thinking", thinking: b.thinking ?? "", signature: b.thinkingSignature ?? "" }];
    }
    if (b.type === "toolCall") {
      return [{ type: "tool_use", id: b.id, name: b.name ?? "unknown", input: b.arguments ?? {} }];
    }
    return [{ type: "text", text: JSON.stringify(b) }];
  });
}

export function normalizePiRecords(records: unknown[]): NormalizedRecord[] {
  return records.flatMap((rec): NormalizedRecord[] => {
    const r = rec as Record<string, unknown>;
    if (r?.type === "compaction") {
      return [
        {
          type: "system",
          subtype: "compact_boundary",
          compactMetadata: {
            preTokens: Number(r.tokensBefore ?? 0),
            postTokens: 0,
            trigger: r.fromHook ? "hook" : "pi",
          },
        },
      ];
    }
    if (r?.type !== "message" || !r?.message) return [];
    const msg = r.message as Record<string, unknown>;
    if (msg.role === "user") {
      return [{ type: "user", message: { content: normalizePiContent(msg.content) } }];
    }
    if (msg.role === "assistant") {
      return [
        {
          type: "assistant",
          message: {
            content: normalizePiContent(msg.content),
            model: (msg.model ?? msg.responseModel ?? null) as string | null,
            usage: normalizePiUsage(msg.usage as Record<string, unknown>),
          },
        },
      ];
    }
    if (msg.role === "toolResult") {
      return [
        {
          type: "user",
          message: {
            content: [
              {
                type: "tool_result",
                tool_use_id: msg.toolCallId,
                content: piContentToText(msg.content),
                is_error: Boolean(msg.isError),
              },
            ],
          },
        },
      ];
    }
    return [];
  });
}

export function normalizeCursorRecords(records: unknown[]): NormalizedRecord[] {
  return records.flatMap((rec): NormalizedRecord[] => {
    const r = rec as Record<string, unknown>;
    if (!r?.role || !r?.message) return [];
    const msg = r.message as Record<string, unknown>;
    const content = msg.content;
    if (r.role === "user") {
      return [{ type: "user", message: { content } }];
    }
    if (r.role === "assistant") {
      const blocks = Array.isArray(content) ? content : [];
      const normalized = blocks.map((block) => {
        if (!block || typeof block !== "object") return block;
        const b = block as Record<string, unknown>;
        if (b.type === "tool_use") return b;
        if (b.type === "text") return { type: "text", text: b.text ?? "" };
        return b;
      });
      return [
        {
          type: "assistant",
          message: {
            content: normalized,
            usage: (msg.usage ?? null) as Record<string, unknown> | null,
            model: (msg.model ?? null) as string | null,
          },
        },
      ];
    }
    return [];
  });
}

export function normalizeRecordsForAgent(agent: AgentKind, records: unknown[]): NormalizedRecord[] {
  if (agent === "pi") return normalizePiRecords(records);
  if (agent === "cursor") return normalizeCursorRecords(records);
  return records as NormalizedRecord[];
}
