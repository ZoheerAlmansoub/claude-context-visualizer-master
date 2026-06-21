import { readAllJSONL } from "./jsonl.ts";
import { normalizeRecordsForAgent } from "./record-normalize.ts";
import { countTokens } from "./tokenizer.ts";
import type { AgentKind, SessionTranscript, UserMessageBundle } from "./types.ts";
import { formatUserMessagesMarkdown } from "./text-utils.ts";
import { recordsToTranscript } from "./normalizers/transcript-parser.ts";
import { loadOpenCodeRecords } from "./opencode-loader.ts";
import { loadAntigravityRecords, parseAntigravitySessionPath } from "./antigravity-loader.ts";

const MAX_TRANSCRIPT_CHARS = 2_000_000;

export type TranscriptOptions = {
  postCompactionOnly?: boolean;
  includeSubagents?: boolean;
};

export async function computeTranscript(
  filePath: string,
  agent: AgentKind,
  sessionId: string,
  opts: TranscriptOptions = {},
): Promise<SessionTranscript> {
  const warnings: string[] = [];
  let records: unknown[];

  if (agent === "opencode") {
    const loaded = await loadOpenCodeRecords(filePath);
    if (!loaded.ok) {
      return emptyTranscript(agent, sessionId, filePath, loaded.reason);
    }
    records = loaded.records;
  } else if (agent === "antigravity") {
    const loaded = await loadAntigravityRecords(filePath);
    if (!loaded.ok) {
      return emptyTranscript(agent, sessionId, filePath, loaded.reason);
    }
    records = loaded.records;
  } else {
    records = await readAllJSONL(filePath);
  }

  const normalized = normalizeRecordsForAgent(agent, records);
  const postCompactionOnly = opts.postCompactionOnly ?? false;
  const { conversation, toolEvents, compactionBoundaryIndex, totalUserMessageCount } =
    recordsToTranscript(normalized, {
      agent,
      sessionId,
      postCompactionOnly,
    });

  const userOnly = conversation.filter((m) => m.role === "user");
  let aggregatedText = formatUserMessagesMarkdown(
    userOnly.map((m) => ({ turn: m.turn, text: m.text, timestamp: m.timestamp })),
  );

  if (aggregatedText.length > MAX_TRANSCRIPT_CHARS) {
    warnings.push(
      `User messages truncated from ${aggregatedText.length.toLocaleString()} to ${MAX_TRANSCRIPT_CHARS.toLocaleString()} chars.`,
    );
    aggregatedText = aggregatedText.slice(0, MAX_TRANSCRIPT_CHARS);
  }

  const userMessages: UserMessageBundle = {
    messages: userOnly,
    aggregatedText,
    totalChars: aggregatedText.length,
    totalTokens: userOnly.reduce((s, m) => s + (m.tokens ?? countTokens(m.text)), 0),
  };

  return {
    agent,
    sessionId,
    filePath,
    userMessages,
    userMessageStats: {
      visibleCount: userOnly.length,
      totalCount: totalUserMessageCount,
      postCompactionOnly,
    },
    conversation,
    toolEvents,
    compactionBoundaryIndex,
    warnings,
  };
}

function emptyTranscript(
  agent: AgentKind,
  sessionId: string,
  filePath: string,
  reason: string,
): SessionTranscript {
  return {
    agent,
    sessionId,
    filePath,
    userMessages: { messages: [], aggregatedText: "", totalChars: 0, totalTokens: 0 },
    userMessageStats: { visibleCount: 0, totalCount: 0, postCompactionOnly: false },
    conversation: [],
    toolEvents: [],
    compactionBoundaryIndex: null,
    warnings: [reason],
  };
}

export function formatUserMessages(
  transcript: SessionTranscript,
  format: "markdown" | "plain" | "json",
): string {
  if (format === "json") {
    return JSON.stringify(transcript.userMessages.messages, null, 2);
  }
  if (format === "plain") {
    return transcript.userMessages.messages.map((m) => m.text).join("\n\n---\n\n");
  }
  return transcript.userMessages.aggregatedText;
}
