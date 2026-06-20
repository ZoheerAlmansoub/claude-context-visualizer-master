import { computeTranscript } from "../transcript.ts";
import type { AgentKind, SessionTranscript, ToolEvent, TranscriptMessage } from "../types.ts";
import { PROJECT_PIPELINE_MAX_SESSIONS } from "../../shared/governance-config.ts";
import { projectAnalysisSessionId } from "../../shared/governance-config.ts";

export type MultiSessionTranscriptMeta = {
  mtimeMs: number;
  projectPath: string;
  sessionIds: string[];
  sessionCount: number;
  analysisSessionId: string;
};

function mergeTranscripts(
  agent: AgentKind,
  parts: SessionTranscript[],
  projectSlug: string,
): SessionTranscript {
  const analysisSessionId = projectAnalysisSessionId(projectSlug);
  let turnOffset = 0;
  const conversation: TranscriptMessage[] = [];
  const toolEvents: ToolEvent[] = [];
  const warnings: string[] = [];
  const filePaths: string[] = [];
  let latestCompaction: number | null = null;

  for (const part of parts) {
    const markerTurn = turnOffset + 1;
    conversation.push({
      id: `session-marker-${part.sessionId}`,
      turn: markerTurn,
      role: "user",
      text: `[Session ${part.sessionId} — ${part.userMessages.messages.length} user turns, ${part.toolEvents.length} tool events]`,
    });
    turnOffset = markerTurn;

    for (const msg of part.conversation) {
      conversation.push({ ...msg, turn: msg.turn + turnOffset });
    }
    const maxTurn = conversation.reduce((m, c) => Math.max(m, c.turn), turnOffset);
    turnOffset = maxTurn;

    for (const ev of part.toolEvents) {
      toolEvents.push({ ...ev, turn: ev.turn + turnOffset });
    }

    if (part.compactionBoundaryIndex != null) {
      latestCompaction = part.compactionBoundaryIndex + turnOffset;
    }

    warnings.push(...part.warnings.map((w) => `[${part.sessionId}] ${w}`));
    filePaths.push(part.filePath);
  }

  const userOnly = conversation.filter((m) => m.role === "user" && !m.id.startsWith("session-marker"));
  const aggregatedText = userOnly.map((m) => `Turn ${m.turn}:\n${m.text}`).join("\n\n---\n\n");

  return {
    agent,
    sessionId: analysisSessionId,
    filePath: filePaths.join(";"),
    userMessages: {
      messages: userOnly,
      aggregatedText,
      totalChars: aggregatedText.length,
      totalTokens: userOnly.reduce((s, m) => s + (m.tokens ?? 0), 0),
    },
    userMessageStats: {
      visibleCount: userOnly.length,
      totalCount: userOnly.length,
      postCompactionOnly: false,
    },
    conversation,
    toolEvents,
    compactionBoundaryIndex: latestCompaction,
    warnings,
  };
}

/** Build a composite transcript from the latest N project sessions. */
export async function buildMultiSessionTranscriptForProject(
  agent: AgentKind,
  projectSlug: string,
  maxSessions = PROJECT_PIPELINE_MAX_SESSIONS,
): Promise<{ transcript: SessionTranscript; meta: MultiSessionTranscriptMeta } | null> {
  const { listSessions } = await import("../indexer.ts");
  const sessions = await listSessions(projectSlug, agent);
  if (!sessions.length) return null;

  const selected = sessions.slice(0, maxSessions);
  const parts: SessionTranscript[] = [];
  for (const session of selected) {
    parts.push(await computeTranscript(session.filePath, agent, session.id));
  }

  const latest = selected[0]!;
  const transcript = mergeTranscripts(agent, parts, projectSlug);

  return {
    transcript,
    meta: {
      mtimeMs: latest.mtimeMs,
      projectPath: latest.projectPath,
      sessionIds: selected.map((s) => s.id),
      sessionCount: sessions.length,
      analysisSessionId: projectAnalysisSessionId(projectSlug),
    },
  };
}

/** @deprecated Use buildMultiSessionTranscriptForProject */
export async function buildSyntheticTranscriptForProject(
  agent: AgentKind,
  projectSlug: string,
): Promise<{ transcript: SessionTranscript; meta: { mtimeMs: number; projectPath: string } } | null> {
  const built = await buildMultiSessionTranscriptForProject(agent, projectSlug, 1);
  if (!built) return null;
  return {
    transcript: built.transcript,
    meta: { mtimeMs: built.meta.mtimeMs, projectPath: built.meta.projectPath },
  };
}
