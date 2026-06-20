import { describe, expect, test } from "bun:test";
import { artifactApplyPath } from "../../shared/artifact-paths.ts";
import { artifactApplyPath as serverArtifactApplyPath } from "../artifacts/apply-paths.ts";

describe("artifact path parity", () => {
  const agents = ["claude", "cursor", "pi", "opencode"] as const;
  const kinds = ["skill", "rule", "hook", "subagent", "tool-hint"] as const;

  for (const agent of agents) {
    for (const kind of kinds) {
      test(`${agent} ${kind} paths match between shared and server`, () => {
        const artifact = { kind, name: "Test Artifact" };
        expect(serverArtifactApplyPath(agent, {
          kind,
          name: "Test Artifact",
          description: "",
          trigger: "",
          content: "x",
          sourceTurns: [],
          confidence: "medium",
        })).toBe(artifactApplyPath(agent, artifact));
      });
    }
  }

  test("pi and opencode hooks use docs/hooks not .cursor/hooks", () => {
    expect(artifactApplyPath("pi", { kind: "hook", name: "Pre Tool" })).toBe(
      "docs/hooks/pre-tool.md",
    );
    expect(artifactApplyPath("opencode", { kind: "hook", name: "Post Tool" })).toBe(
      "docs/hooks/post-tool.md",
    );
  });
});
