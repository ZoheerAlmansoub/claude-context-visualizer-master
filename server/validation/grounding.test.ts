import { describe, expect, test } from "bun:test";
import {
  passesAutoApplyGrounding,
  scoreArtifactGrounding,
  scoreMemoryDraftGrounding,
} from "../../shared/grounding.ts";

describe("grounding", () => {
  test("artifact with source turns and content scores medium or high", () => {
    const result = scoreArtifactGrounding(
      {
        content: "# Rule\n\nAlways verify schema before CallMcpTool.",
        sourceTurns: [3, 4],
        confidence: "high",
      },
      { conversation: [{ turn: 3, text: "x" }, { turn: 4, text: "y" }, { turn: 5, text: "z" }] },
    );
    expect(result.score).toBeGreaterThanOrEqual(45);
    expect(passesAutoApplyGrounding(result.level)).toBe(true);
  });

  test("memory draft with allowed path and long content passes medium+", () => {
    const result = scoreMemoryDraftGrounding({
      path: "AGENTS.md",
      action: "create",
      rationale: "Capture auth decisions from session about middleware",
      content: "# Project\n\n## Stack\n\nTypeScript + Bun backend with JWT auth middleware.",
    });
    expect(result.level).not.toBe("low");
  });

  test("short content scores low", () => {
    const result = scoreArtifactGrounding({
      content: "tiny",
      sourceTurns: [],
      confidence: "medium",
    });
    expect(result.level).toBe("low");
    expect(passesAutoApplyGrounding(result.level)).toBe(false);
  });
});
