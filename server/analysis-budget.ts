import type { AnalyzeType, LlmProviderKind, SessionTranscript } from "./types.ts";
import type { AnalysisTranscriptContext } from "./llm/prompts.ts";
import { detectSessionPatterns } from "./insights/pattern-detector.ts";
import {
  buildEnrichedToolSummary,
  buildLoopEvidenceBlock,
  buildTokenStatsBlock,
} from "./analysis-context.ts";

export type AnalysisContextLimits = {
  userMessages: number;
  conversation: number;
  toolSummary: number;
  toolEvents: number;
  maxTokens: number;
  /** Prefer error turns + user messages instead of full thread */
  focusedConversation: boolean;
};

const HEURISTIC_FALLBACK_TYPES = new Set<AnalyzeType>([
  "token-audit",
  "loop-diagnosis",
  "tool-hardening",
]);

export function supportsHeuristicFallback(type: AnalyzeType): boolean {
  return HEURISTIC_FALLBACK_TYPES.has(type);
}

export function isHeavySession(transcript: SessionTranscript): boolean {
  const errorTools = transcript.toolEvents.filter((t) => t.isError).length;
  return (
    transcript.toolEvents.length >= 40 ||
    transcript.conversation.length >= 60 ||
    errorTools >= 15
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "\n\n… [truncated for LLM context limit]";
}

/** NVIDIA NIM gateway often returns 504 after ~5 min on huge prompts + 550B models */
export function isGatewaySensitiveProvider(provider: LlmProviderKind): boolean {
  return provider === "nvidia";
}

export function contextLimitsFor(
  type: AnalyzeType,
  opts: { compact?: boolean; ultraCompact?: boolean; gatewaySensitive?: boolean } = {},
): AnalysisContextLimits {
  const ultra = opts.ultraCompact ?? false;
  const compact = ultra || (opts.compact ?? false);
  const gw = opts.gatewaySensitive ?? false;

  if (ultra) {
    const ultraBase: AnalysisContextLimits = {
      userMessages: 1_200,
      conversation: 1_000,
      toolSummary: 1_200,
      toolEvents: 12,
      maxTokens: 768,
      focusedConversation: true,
    };
    switch (type) {
      case "artifact-blueprint":
      case "memory-file-drafts":
      case "agent-orchestration":
        return { ...ultraBase, userMessages: 1_800, conversation: 1_400, maxTokens: 1024 };
      case "agentic-lessons":
      case "summarize":
      case "intent-map":
      case "experience-extract":
      case "session-review":
        return {
          ...ultraBase,
          userMessages: 2_500,
          conversation: 2_000,
          toolSummary: 1_500,
          toolEvents: 20,
          maxTokens: 1024,
          focusedConversation: false,
        };
      default:
        return ultraBase;
    }
  }

  const toolHeavy: AnalysisContextLimits = {
    userMessages: compact ? 2_500 : gw ? 5_000 : 10_000,
    conversation: compact ? 2_000 : gw ? 4_000 : 12_000,
    toolSummary: compact ? 2_000 : gw ? 4_000 : 8_000,
    toolEvents: compact ? 20 : gw ? 35 : 70,
    maxTokens: compact ? 768 : gw ? 1280 : 2048,
    focusedConversation: true,
  };

  const artifactHeavy: AnalysisContextLimits = {
    userMessages: compact ? 4_000 : gw ? 8_000 : 18_000,
    conversation: compact ? 3_000 : gw ? 6_000 : 16_000,
    toolSummary: compact ? 2_500 : gw ? 4_000 : 8_000,
    toolEvents: compact ? 25 : gw ? 40 : 70,
    maxTokens: compact ? 1024 : gw ? 1536 : 3072,
    focusedConversation: !compact,
  };

  const markdown: AnalysisContextLimits = {
    userMessages: compact ? 6_000 : gw ? 12_000 : 24_000,
    conversation: compact ? 5_000 : gw ? 10_000 : 24_000,
    toolSummary: compact ? 3_500 : gw ? 5_000 : 10_000,
    toolEvents: compact ? 35 : gw ? 50 : 100,
    maxTokens: compact ? 1536 : 2048,
    focusedConversation: false,
  };

  switch (type) {
    case "token-audit":
    case "loop-diagnosis":
    case "tool-hardening":
      return toolHeavy;
    case "artifact-blueprint":
    case "memory-file-drafts":
    case "agent-orchestration":
      return artifactHeavy;
    default:
      return markdown;
  }
}

function buildFocusedConversation(transcript: SessionTranscript, maxChars: number): string {
  const errorTurns = new Set(
    transcript.toolEvents.filter((t) => t.isError).map((t) => t.turn),
  );
  const patternTurns = new Set(
    transcript.toolEvents
      .filter((t) => (t.tokens ?? 0) >= 500 || t.isError)
      .map((t) => t.turn),
  );

  const picked = transcript.conversation.filter(
    (m) =>
      m.role === "user" ||
      errorTurns.has(m.turn) ||
      patternTurns.has(m.turn),
  );

  const fallback =
    picked.length > 0
      ? picked
      : transcript.conversation.slice(-Math.min(40, transcript.conversation.length));

  const lines: string[] = [];
  let size = 0;
  for (const m of fallback) {
    const line = `[${m.role} turn ${m.turn}] ${m.text.slice(0, 1200)}`;
    if (size + line.length > maxChars) break;
    lines.push(line);
    size += line.length + 2;
  }
  return lines.join("\n\n");
}

export function buildAnalysisTranscriptContext(
  transcript: SessionTranscript,
  type: AnalyzeType,
  limits: AnalysisContextLimits,
): AnalysisTranscriptContext {
  const patterns = detectSessionPatterns(transcript);

  const conversationText = limits.focusedConversation
    ? buildFocusedConversation(transcript, limits.conversation)
    : transcript.conversation
        .map((m) => `[${m.role} turn ${m.turn}] ${m.text.slice(0, 1500)}`)
        .join("\n\n");

  return {
    userMessages: truncate(transcript.userMessages.aggregatedText, limits.userMessages),
    conversation: truncate(conversationText, limits.conversation),
    toolSummary: truncate(
      buildEnrichedToolSummary(transcript, limits.toolEvents),
      limits.toolSummary,
    ),
    tokenStats: buildTokenStatsBlock(transcript),
    loopEvidence: buildLoopEvidenceBlock(patterns),
    patterns,
    compactionBoundaryIndex: transcript.compactionBoundaryIndex,
    userMessageStats: transcript.userMessageStats,
    warnings: transcript.warnings,
  };
}

export function isRetryableGatewayError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /\b504\b/.test(msg) ||
    /gateway timeout/i.test(msg) ||
    /timed out/i.test(msg)
  );
}

export function formatAnalysisLlmError(err: unknown, locale: "ar" | "en"): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/\b504\b/.test(raw) || /gateway timeout/i.test(raw)) {
    return locale === "ar"
      ? "انتهت مهلة بوابة NVIDIA (~5 دقائق). جرّب نموذجاً أسرع، أو جلسة أقصر، أو نوع تحليل أخف. تم تقليل السياق تلقائياً عند إعادة المحاولة."
      : "NVIDIA gateway timed out (~5 min). Try a faster model, a shorter session, or a lighter analysis type. Context is auto-reduced on retry.";
  }
  return raw;
}
