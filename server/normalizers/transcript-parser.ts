import { countTokens } from "../tokenizer.ts";
import type { ToolEvent, TranscriptMessage } from "../types.ts";
import { contentBlocksToText, extractUserQuery, stripXmlTags } from "../text-utils.ts";

const TIMESTAMP_RE = /<timestamp>([\s\S]*?)<\/timestamp>/i;

function blockText(block: unknown): string {
  if (typeof block === "string") return block;
  if (block == null || typeof block !== "object") return "";
  const b = block as Record<string, unknown>;
  if (b.type === "tool_use") {
    return `${b.name ?? ""}\n${JSON.stringify(b.input ?? {})}`;
  }
  if (b.type === "tool_result") {
    if (typeof b.content === "string") return b.content;
    if (Array.isArray(b.content)) {
      return b.content
        .map((x) => {
          if (typeof x === "string") return x;
          const item = x as Record<string, unknown>;
          if (item?.type === "text") return (item.text as string) ?? "";
          return JSON.stringify(x);
        })
        .join("\n");
    }
    return JSON.stringify(b.content ?? "");
  }
  if (b.type === "text") return (b.text as string) ?? "";
  if (b.type === "thinking") {
    const plain = (b.thinking as string) ?? (b.text as string) ?? "";
    if (plain) return plain;
    if (typeof b.signature === "string" && b.signature.length > 0) return b.signature;
    return "";
  }
  return JSON.stringify(block);
}

function extractTimestamp(raw: string): string | undefined {
  const m = raw.match(TIMESTAMP_RE);
  return m?.[1]?.trim();
}


function parseUserText(raw: string): { text: string; timestamp?: string } {
  const timestamp = extractTimestamp(raw);
  const text = extractUserQuery(raw);
  return { text, timestamp };
}

function assistantTextFromBlocks(blocks: unknown[]): string {
  return blocks
    .filter((b) => {
      const block = b as Record<string, unknown>;
      return block?.type === "text";
    })
    .map((b) => ((b as Record<string, unknown>).text as string) ?? "")
    .join("\n")
    .trim();
}

function countUserTextMessages(
  records: unknown[],
  fromIdx: number,
  toIdx: number,
  agent: string,
): number {
  let count = 0;
  for (let i = fromIdx; i < toIdx; i++) {
    const r = records[i] as Record<string, unknown>;
    if (!r) continue;
    if (r.type === "user" && (r.message as Record<string, unknown>)?.content) {
      const c = (r.message as Record<string, unknown>).content;
      const blocks: unknown[] =
        typeof c === "string" ? [{ type: "text", text: c }] : Array.isArray(c) ? c : [];
      for (const block of blocks) {
        const b = block as Record<string, unknown>;
        if (b?.type === "text") {
          const raw = (b.text as string) ?? "";
          const parsed = parseUserText(raw);
          const displayText = agent === "cursor" ? parsed.text : stripXmlTags(parsed.text) || parsed.text;
          if (displayText.trim()) count++;
        }
      }
    } else if (r.role === "user" && r.message) {
      const raw = contentBlocksToText((r.message as Record<string, unknown>).content);
      const parsed = parseUserText(raw);
      if (parsed.text.trim()) count++;
    }
  }
  return count;
}

export function recordsToTranscript(
  records: unknown[],
  opts: { agent: string; sessionId: string; postCompactionOnly?: boolean },
): {
  conversation: TranscriptMessage[];
  toolEvents: ToolEvent[];
  compactionBoundaryIndex: number | null;
  totalUserMessageCount: number;
} {
  let compactionBoundaryIndex: number | null = null;
  let latestAssistantIdx = -1;
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i] as Record<string, unknown>;
    if (r?.type === "assistant" && (r.message as Record<string, unknown>)?.usage) {
      latestAssistantIdx = i;
      break;
    }
  }
  for (let i = 0; i < records.length; i++) {
    const r = records[i] as Record<string, unknown>;
    if (r?.type === "system" && r?.subtype === "compact_boundary") {
      if (latestAssistantIdx === -1 || i < latestAssistantIdx) {
        compactionBoundaryIndex = i;
      }
    }
  }

  const startIdx = opts.postCompactionOnly && compactionBoundaryIndex != null
    ? compactionBoundaryIndex + 1
    : 0;
  const endIdx = latestAssistantIdx === -1 ? records.length : latestAssistantIdx;
  const totalUserMessageCount = countUserTextMessages(records, 0, endIdx, opts.agent);

  const conversation: TranscriptMessage[] = [];
  const toolEvents: ToolEvent[] = [];
  const toolUseIdToName = new Map<string, string>();
  const toolUseIdToInput = new Map<string, unknown>();

  let userTurn = 0;
  let assistantTurn = 0;
  let msgIndex = 0;

  for (let i = startIdx; i < endIdx; i++) {
    const r = records[i] as Record<string, unknown>;
    if (!r) continue;

    if (r.type === "assistant" && (r.message as Record<string, unknown>)?.content) {
      const blocks = (r.message as Record<string, unknown>).content as unknown[];
      if (!Array.isArray(blocks)) continue;
      assistantTurn++;
      for (const block of blocks) {
        const b = block as Record<string, unknown>;
        if (b?.type === "tool_use" && b?.id) {
          toolUseIdToName.set(String(b.id), String(b.name ?? "unknown"));
          toolUseIdToInput.set(String(b.id), b.input ?? {});
        }
      }
      const text = assistantTextFromBlocks(blocks);
      if (text) {
        conversation.push({
          id: `msg-${msgIndex++}`,
          turn: assistantTurn,
          role: "assistant",
          text,
          tokens: countTokens(text),
        });
      }
    } else if (r.type === "user" && (r.message as Record<string, unknown>)?.content) {
      const c = (r.message as Record<string, unknown>).content;
      const blocks: unknown[] =
        typeof c === "string" ? [{ type: "text", text: c }] : Array.isArray(c) ? c : [];
      userTurn++;
      for (const block of blocks) {
        const b = block as Record<string, unknown>;
        if (b?.type === "tool_result") {
          const toolName = toolUseIdToName.get(String(b.tool_use_id)) ?? "unknown";
          const resultText = blockText(block);
          const toolInput = toolUseIdToInput.has(String(b.tool_use_id))
            ? JSON.stringify(toolUseIdToInput.get(String(b.tool_use_id)), null, 2)
            : "";
          toolEvents.push({
            id: `tool-${msgIndex}`,
            turn: userTurn,
            toolName,
            toolInput,
            resultText,
            isError: Boolean(b.is_error),
            tokens: countTokens(resultText),
          });
          conversation.push({
            id: `msg-${msgIndex++}`,
            turn: userTurn,
            role: "tool",
            text: resultText,
            toolName,
            toolInput,
            isError: Boolean(b.is_error),
            tokens: countTokens(resultText),
          });
        } else if (b?.type === "text") {
          const raw = (b.text as string) ?? "";
          const parsed = parseUserText(raw);
          const displayText =
            opts.agent === "cursor" || opts.agent === "antigravity"
              ? parsed.text
              : stripXmlTags(parsed.text) || parsed.text;
          conversation.push({
            id: `msg-${msgIndex++}`,
            turn: userTurn,
            role: "user",
            text: displayText,
            timestamp: parsed.timestamp,
            tokens: countTokens(displayText),
          });
        }
      }
    } else if (r.role === "user" && r.message) {
      // Cursor raw format (not yet normalized)
      userTurn++;
      const raw = contentBlocksToText((r.message as Record<string, unknown>).content);
      const parsed = parseUserText(raw);
      conversation.push({
        id: `msg-${msgIndex++}`,
        turn: userTurn,
        role: "user",
        text: parsed.text,
        timestamp: parsed.timestamp,
        tokens: countTokens(parsed.text),
      });
    } else if (r.role === "assistant" && r.message) {
      assistantTurn++;
      const blocks = (r.message as Record<string, unknown>).content as unknown[];
      const text = Array.isArray(blocks) ? assistantTextFromBlocks(blocks) : contentBlocksToText(blocks);
      if (text) {
        conversation.push({
          id: `msg-${msgIndex++}`,
          turn: assistantTurn,
          role: "assistant",
          text,
          tokens: countTokens(text),
        });
      }
    }
  }

  return { conversation, toolEvents, compactionBoundaryIndex, totalUserMessageCount };
}