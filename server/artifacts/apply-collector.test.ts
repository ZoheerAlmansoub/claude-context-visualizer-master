import { describe, expect, test } from "bun:test";
import {
  collectApplyPackFromStructured,
  enrichAndFilterAutoApplyItems,
  filterAutoApplyItems,
} from "./apply-collector.ts";
import type { GeneratedArtifact } from "../types.ts";

describe("apply-collector", () => {
  test("collects memory file drafts with valid paths", () => {
    const items = collectApplyPackFromStructured(
      {
        kind: "memory-files",
        summary: "test",
        files: [
          {
            path: "AGENTS.md",
            purpose: "project memory",
            action: "append",
            rationale: "session learnings from turns 3-5 about auth flow",
            content: "# Auth\n\nUse JWT middleware in src/auth.ts for all routes.",
          },
        ],
      },
      "cursor",
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.path).toBe("AGENTS.md");
  });

  test("skips short artifact content", () => {
    const items = collectApplyPackFromStructured(
      {
        kind: "artifacts",
        summary: "",
        items: [
          {
            kind: "rule",
            name: "tiny",
            description: "d",
            trigger: "t",
            content: "short",
            sourceTurns: [1],
            confidence: "high",
          } as GeneratedArtifact,
        ],
      },
      "cursor",
    );
    expect(items).toHaveLength(0);
  });

  test("enrichAndFilterAutoApplyItems rejects low grounding", () => {
    const filtered = enrichAndFilterAutoApplyItems(
      [
        {
          path: "AGENTS.md",
          content: "x",
          selected: true,
          confidence: "high",
          label: "memory: AGENTS.md",
        },
      ],
      {},
    );
    expect(filtered).toHaveLength(0);
  });

  test("filterAutoApplyItems keeps medium confidence artifacts", () => {
    const items = filterAutoApplyItems([
      {
        path: ".cursor/rules/test.mdc",
        content: "A".repeat(50),
        confidence: "medium",
        selected: true,
      },
      {
        path: ".cursor/rules/low.mdc",
        content: "B".repeat(50),
        confidence: "low",
        selected: true,
      },
    ]);
    expect(items).toHaveLength(1);
  });
});
