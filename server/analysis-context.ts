import type { RecurringPattern, SessionTranscript } from "./types.ts";

export function buildTokenStatsBlock(transcript: SessionTranscript): string {
  const lines: string[] = ["## Token statistics (from transcript)"];

  lines.push(
    `- User message tokens (aggregated): ~${transcript.userMessages.totalTokens}`,
    `- User message chars: ${transcript.userMessages.totalChars}`,
    `- Tool events: ${transcript.toolEvents.length}`,
  );

  const byTool = new Map<string, { count: number; tokens: number; errors: number }>();
  let totalToolTokens = 0;
  let errorEvents = 0;

  for (const t of transcript.toolEvents) {
    const prev = byTool.get(t.toolName) ?? { count: 0, tokens: 0, errors: 0 };
    prev.count++;
    prev.tokens += t.tokens ?? 0;
    if (t.isError) {
      prev.errors++;
      errorEvents++;
    }
    byTool.set(t.toolName, prev);
    totalToolTokens += t.tokens ?? 0;
  }

  lines.push(`- Tool result tokens (estimated): ~${totalToolTokens}`);
  lines.push(`- Tool errors: ${errorEvents}`);

  const ranked = [...byTool.entries()].sort((a, b) => b[1].tokens - a[1].tokens);
  if (ranked.length) {
    lines.push("", "### Per-tool breakdown (sorted by tokens)", "");
    for (const [name, stats] of ranked.slice(0, 15)) {
      lines.push(
        `- **${name}**: ${stats.count} calls, ~${stats.tokens} tok${stats.errors ? `, ${stats.errors} errors` : ""}`,
      );
    }
  }

  const heavy = transcript.toolEvents
    .filter((t) => (t.tokens ?? 0) >= 500)
    .sort((a, b) => (b.tokens ?? 0) - (a.tokens ?? 0))
    .slice(0, 10);

  if (heavy.length) {
    lines.push("", "### Heaviest tool results", "");
    for (const t of heavy) {
      lines.push(
        `- Turn ${t.turn}: ${t.toolName} ~${t.tokens ?? 0} tok${t.isError ? " (ERROR)" : ""} — ${t.resultText.slice(0, 120)}`,
      );
    }
  }

  return lines.join("\n");
}

export function buildEnrichedToolSummary(transcript: SessionTranscript, maxEvents = 120): string {
  const events = [...transcript.toolEvents].sort((a, b) => {
    if (a.isError !== b.isError) return a.isError ? -1 : 1;
    return (b.tokens ?? 0) - (a.tokens ?? 0);
  });

  return events
    .slice(0, maxEvents)
    .map((t) => {
      const tok = t.tokens != null ? ` ~${t.tokens}tok` : "";
      const err = t.isError ? " (ERROR)" : "";
      const input = t.toolInput ? ` | input: ${t.toolInput.slice(0, 100)}` : "";
      return `Turn ${t.turn}: ${t.toolName}${err}${tok}${input} — ${t.resultText.slice(0, 280)}`;
    })
    .join("\n");
}

export function buildLoopEvidenceBlock(patterns: RecurringPattern[]): string {
  const loopKinds = new Set([
    "retry_loop",
    "repeated_tool_error",
    "bash_failure_loop",
    "duplicate_user_intent",
    "token_waste_read",
    "compaction_pressure",
  ]);
  const relevant = patterns.filter((p) => loopKinds.has(p.kind));
  if (!relevant.length) return "";

  const lines = ["## Loop/error evidence (heuristic — use as anchors)", ""];
  for (const p of relevant) {
    lines.push(
      `- [${p.kind}] **${p.label}** (${p.count}x): ${p.description}`,
      `  Recommendation: ${p.recommendation}`,
    );
  }
  return lines.join("\n");
}
