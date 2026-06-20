import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { analysisSessionCacheDirName } from "./analysis-cache-path.ts";
import { projectAnalysisSessionId } from "../shared/governance-config.ts";

describe("analysisSessionCacheDirName", () => {
  test("project ids replace colon for Windows-safe paths", () => {
    const slug = "--D--dev-ERP-SAP--";
    const logical = projectAnalysisSessionId(slug);
    expect(logical).toBe("project:--D--dev-ERP-SAP--");
    expect(analysisSessionCacheDirName(logical)).toBe("project__--D--dev-ERP-SAP--");
    expect(analysisSessionCacheDirName(logical)).not.toContain(":");
  });

  test("regular session uuids pass through unchanged", () => {
    const id = "f849552f-73c1-4ad6-b1bc-bda17fc2fa0c";
    expect(analysisSessionCacheDirName(id)).toBe(id);
  });

  test("sanitized segment is valid as a single path component", () => {
    const name = analysisSessionCacheDirName(projectAnalysisSessionId("a:b/c"));
    expect(name).not.toMatch(/[:<>"/\\|?*]/);
    expect(join("analysis", "pi", name)).toContain("project__");
  });
});
