import { describe, expect, test } from "bun:test";
import { buildAnalysisPrompt, buildArtifactPrompt } from "./prompts.ts";
import type { AnalysisTranscriptContext } from "./prompts.ts";

const baseCtx: AnalysisTranscriptContext = {
  userMessages: "fix the bug",
  conversation: "user: fix\nassistant: ok",
  toolSummary: "Read: 2",
  tokenStats: "total: 1000",
  loopEvidence: "none",
  patterns: [],
  compactionBoundaryIndex: null,
  userMessageStats: { visibleCount: 1, totalCount: 1 },
  warnings: [],
};

describe("buildAnalysisPrompt", () => {
  test("artifact-blueprint includes agent hints without ReferenceError", () => {
    for (const agent of ["cursor", "claude", "pi", "opencode"] as const) {
      const { system, user } = buildAnalysisPrompt("artifact-blueprint", {
        ...baseCtx,
        agentKind: agent,
      });
      expect(system).toContain(agent);
      expect(system).not.toContain("undefined");
      expect(user).toContain(agent);
    }
  });

  test("loop-diagnosis uses agent-specific rule paths", () => {
    const claude = buildAnalysisPrompt("loop-diagnosis", { ...baseCtx, agentKind: "claude" });
    expect(claude.user).toContain(".claude/rules/");
    const cursor = buildAnalysisPrompt("loop-diagnosis", { ...baseCtx, agentKind: "cursor" });
    expect(cursor.user).toContain(".cursor/rules/");
  });

  test("memory-file-drafts forbids artifact paths per agent", () => {
    const { user } = buildAnalysisPrompt("memory-file-drafts", { ...baseCtx, agentKind: "pi" });
    expect(user).toContain("FORBIDDEN");
    expect(user).toContain("Pi:");
  });
});

describe("buildArtifactPrompt", () => {
  test("parameterizes agent in system prompt", () => {
    const { system } = buildArtifactPrompt(
      { userMessages: "hi", patterns: "none" },
      "en",
      "claude",
    );
    expect(system).toContain("claude");
    expect(system).toContain("Claude Code");
  });
});
