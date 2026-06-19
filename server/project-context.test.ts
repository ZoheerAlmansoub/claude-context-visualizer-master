import { describe, expect, test } from "bun:test";
import { resolveUnderRoot, diffContent } from "./project-context.ts";

describe("project-context", () => {
  test("resolveUnderRoot blocks traversal", () => {
    expect(() => resolveUnderRoot("C:/proj", "../etc/passwd")).toThrow();
  });

  test("diffContent append merges content", () => {
    const { merged, isNew } = diffContent("existing", "new section", "append");
    expect(isNew).toBe(false);
    expect(merged).toContain("existing");
    expect(merged).toContain("new section");
  });

  test("diffContent create on empty", () => {
    const { merged, isNew } = diffContent(null, "fresh", "create");
    expect(isNew).toBe(true);
    expect(merged).toBe("fresh");
  });
});
