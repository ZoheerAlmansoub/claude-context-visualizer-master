import { describe, expect, test } from "bun:test";
import {
  artifactApplyPath,
  disambiguateApplyPaths,
  ruleDedupApplyPath,
} from "./apply-paths.ts";
import { collectApplyPackFromStructured } from "./apply-collector.ts";

describe("apply-paths", () => {
  test("cursor rules get unique .mdc paths per name", () => {
    const path = artifactApplyPath("cursor", {
      kind: "rule",
      name: "Repeated-bash-errors",
      description: "x",
      trigger: "t",
      content: "body",
      sourceTurns: [],
      confidence: "high",
    });
    expect(path).toBe(".cursor/rules/repeated-bash-errors.mdc");
  });

  test("pi rules no longer all map to AGENTS.md", () => {
    const path = artifactApplyPath("pi", {
      kind: "rule",
      name: "Retry-loop-read",
      description: "x",
      trigger: "t",
      content: "body",
      sourceTurns: [],
      confidence: "medium",
    });
    expect(path).toBe(".pi/rules/retry-loop-read.md");
    expect(path).not.toBe("AGENTS.md");
  });

  test("rule-dedup redirects AGENTS.md when content is mdc rule", () => {
    const path = ruleDedupApplyPath("cursor", {
      name: "Repeated-bash-errors",
      proposedPath: "AGENTS.md",
      content: "---\ndescription: test\nalwaysApply: true\n---\n# Rule",
    });
    expect(path).toBe(".cursor/rules/repeated-bash-errors.mdc");
  });

  test("cursor skills use user-scoped ~/.cursor/skills path", () => {
    const path = artifactApplyPath("cursor", {
      kind: "skill",
      name: "My Skill",
      description: "x",
      trigger: "t",
      content: "body",
      sourceTurns: [],
      confidence: "high",
    });
    expect(path).toBe("~/.cursor/skills/my-skill/SKILL.md");
  });

  test("disambiguateApplyPaths suffixes duplicates", () => {
    const out = disambiguateApplyPaths([
      { path: ".cursor/rules/a.mdc" },
      { path: ".cursor/rules/a.mdc" },
    ]);
    expect(out[0]!.path).toBe(".cursor/rules/a.mdc");
    expect(out[1]!.path).toBe(".cursor/rules/a-2.mdc");
  });
});

describe("collectApplyPackFromStructured", () => {
  test("loop-diagnosis prevention rules get distinct paths", () => {
    const items = collectApplyPackFromStructured(
      {
        kind: "prevention-rules",
        summary: "s",
        rules: [
          {
            kind: "rule",
            name: "Repeated-bash-errors",
            description: "d",
            trigger: "t",
            content: "c1",
            rendered: "---\nalwaysApply: true\n---\nc1",
            sourceTurns: [],
            confidence: "high",
          },
          {
            kind: "rule",
            name: "Retry-loop-read",
            description: "d",
            trigger: "t",
            content: "c2",
            rendered: "---\nalwaysApply: true\n---\nc2",
            sourceTurns: [],
            confidence: "high",
          },
        ],
      },
      "cursor",
    );
    expect(items).toHaveLength(2);
    expect(items[0]!.path).toBe(".cursor/rules/repeated-bash-errors.mdc");
    expect(items[1]!.path).toBe(".cursor/rules/retry-loop-read.mdc");
    expect(new Set(items.map((i) => i.path)).size).toBe(2);
  });
});
