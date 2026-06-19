import type { SessionTranscript, RecurringPattern } from "../types.ts";
import { enrichPatternWithArtifact } from "../artifacts/templates.ts";

export { writeArtifactFile, applyArtifactPack, writeWithMerge } from "../artifacts/write.ts";

export type DetectedPattern = RecurringPattern;

function similar(a: string, b: string): boolean {
  const na = a.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 200);
  const nb = b.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 200);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb.slice(0, 40)) || nb.includes(na.slice(0, 40));
}

export function detectSessionPatterns(transcript: SessionTranscript): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const sessionId = transcript.sessionId;

  const toolErrors = transcript.toolEvents.filter((t) => t.isError);
  if (toolErrors.length >= 2) {
    const byTool = new Map<string, number>();
    for (const t of toolErrors) byTool.set(t.toolName, (byTool.get(t.toolName) ?? 0) + 1);
    for (const [toolName, count] of byTool) {
      if (count >= 2) {
        patterns.push({
          id: `repeated_tool_error:${toolName}`,
          kind: "repeated_tool_error",
          label: `Repeated ${toolName} errors`,
          description: `${toolName} failed ${count} times in this session`,
          count,
          sessionIds: [sessionId],
          estimatedTokenWaste: toolErrors.filter((t) => t.toolName === toolName).reduce((s, t) => s + (t.tokens ?? 0), 0),
          recommendation: `Add a rule: verify ${toolName} inputs and diagnose errors before retrying.`,
        });
      }
    }
  }

  const byToolInput = new Map<string, number>();
  for (const t of transcript.toolEvents) {
    const key = `${t.toolName}:${t.toolInput.slice(0, 120)}`;
    byToolInput.set(key, (byToolInput.get(key) ?? 0) + 1);
  }
  for (const [key, count] of byToolInput) {
    if (count >= 3) {
      const toolName = key.split(":")[0]!;
      patterns.push({
        id: `retry_loop:${key.slice(0, 40)}`,
        kind: "retry_loop",
        label: `Retry loop: ${toolName}`,
        description: `Same ${toolName} call repeated ${count} times`,
        count,
        sessionIds: [sessionId],
        recommendation: "Add a debugging skill: stop after 2 failures, change approach.",
      });
    }
  }

  const readTools = transcript.toolEvents.filter(
    (t) => /^(Read|ReadFile|Grep|Glob)$/i.test(t.toolName) && (t.tokens ?? 0) > 500,
  );
  if (readTools.length >= 3) {
    patterns.push({
      id: "token_waste_read",
      kind: "token_waste_read",
      label: "Heavy read/search usage",
      description: `${readTools.length} large read/search tool results`,
      count: readTools.length,
      sessionIds: [sessionId],
      estimatedTokenWaste: readTools.reduce((s, t) => s + (t.tokens ?? 0), 0),
      recommendation: "Use semantic search or targeted reads; avoid dumping large files into context.",
    });
  }

  const bashFails = transcript.toolEvents.filter(
    (t) => /^(Bash|Shell)$/i.test(t.toolName) && t.isError,
  );
  if (bashFails.length >= 2) {
    patterns.push({
      id: "bash_failure_loop",
      kind: "bash_failure_loop",
      label: "Shell command failures",
      description: `${bashFails.length} failed shell commands`,
      count: bashFails.length,
      sessionIds: [sessionId],
      recommendation: "Diagnose exit codes and environment before re-running commands.",
    });
  }

  const userMsgs = transcript.userMessages.messages;
  for (let i = 1; i < userMsgs.length; i++) {
    if (similar(userMsgs[i]!.text, userMsgs[i - 1]!.text)) {
      patterns.push({
        id: "duplicate_user_intent",
        kind: "duplicate_user_intent",
        label: "Duplicate user intent",
        description: "User repeated similar requests across turns",
        count: 2,
        sessionIds: [sessionId],
        recommendation: "Confirm scope once at the start; summarize understanding before acting.",
      });
      break;
    }
  }

  if (transcript.compactionBoundaryIndex != null) {
    patterns.push({
      id: "compaction_pressure",
      kind: "compaction_pressure",
      label: "Context compaction occurred",
      description: "Session hit compaction boundary — context was trimmed",
      count: 1,
      sessionIds: [sessionId],
      recommendation: "Trim attachments and large tool outputs proactively before compaction.",
    });
  }

  return patterns.map((p) => enrichPatternWithArtifact(p, transcript.agent));
}

export function mergePatterns(existing: DetectedPattern[], incoming: DetectedPattern[]): DetectedPattern[] {
  const map = new Map<string, DetectedPattern>();
  for (const p of [...existing, ...incoming]) {
    const prev = map.get(p.id);
    if (!prev) {
      map.set(p.id, { ...p, sessionIds: [...new Set(p.sessionIds)] });
      continue;
    }
    prev.count += p.count;
    prev.sessionIds = [...new Set([...prev.sessionIds, ...p.sessionIds])];
    prev.estimatedTokenWaste = (prev.estimatedTokenWaste ?? 0) + (p.estimatedTokenWaste ?? 0);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

