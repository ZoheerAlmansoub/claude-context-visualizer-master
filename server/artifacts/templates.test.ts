import { describe, expect, test } from "bun:test";
import { enrichPatternWithArtifact, suggestedArtifactFromPattern } from "./templates.ts";
import type { RecurringPattern } from "../types.ts";

describe("artifact templates", () => {
  test("maps retry_loop to skill template", () => {
    const p: RecurringPattern = {
      id: "retry_loop:test",
      kind: "retry_loop",
      label: "Retry loop",
      description: "Same call repeated",
      count: 3,
      sessionIds: ["s1"],
      recommendation: "Stop after 2 failures",
    };
    const artifact = suggestedArtifactFromPattern(p, "cursor");
    expect(artifact?.kind).toBe("skill");
    expect(artifact?.name).toBe("stop-retry-loop");
    expect(artifact?.content).toContain("Stop after 2 failures");
  });

  test("enrichPatternWithArtifact attaches suggestedArtifact", () => {
    const p: RecurringPattern = {
      id: "compaction_pressure",
      kind: "compaction_pressure",
      label: "Compaction",
      description: "Boundary hit",
      count: 1,
      sessionIds: ["s1"],
      recommendation: "Trim context",
    };
    const enriched = enrichPatternWithArtifact(p);
    expect(enriched.suggestedArtifact?.kind).toBe("rule");
  });
});
