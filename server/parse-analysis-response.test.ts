import { describe, expect, test } from "bun:test";
import { parseAnalysisResponse, buildHeuristicFallbackResult } from "./llm/parse-analysis-response.ts";
import type { RecurringPattern } from "./types.ts";

const retryPattern: RecurringPattern = {
  id: "retry_loop:Read",
  kind: "retry_loop",
  label: "Retry loop: Read",
  description: "Same Read call repeated 4 times",
  count: 4,
  sessionIds: ["s1"],
  recommendation: "Stop after 2 failures and change approach.",
};

const toolErrorPattern: RecurringPattern = {
  id: "repeated_tool_error:Bash",
  kind: "repeated_tool_error",
  label: "Repeated Bash errors",
  description: "Bash failed 3 times in this session",
  count: 3,
  sessionIds: ["s1"],
  estimatedTokenWaste: 1200,
  recommendation: "Verify Bash inputs before retrying.",
};

describe("parseAnalysisResponse", () => {
  test("parses token-audit JSON", () => {
    const raw = JSON.stringify({
      summary: "Heavy reads dominated context.",
      wasteItems: [
        {
          source: "reads",
          description: "Same file read 5 times",
          estimatedImpact: "high",
          recommendation: "Cache file content",
          turns: [2, 4],
        },
      ],
    });
    const result = parseAnalysisResponse("token-audit", raw, "en");
    expect(result.structured?.kind).toBe("token-audit");
    if (result.structured?.kind === "token-audit") {
      expect(result.structured.wasteItems).toHaveLength(1);
      expect(result.structured.wasteItems[0]?.estimatedImpact).toBe("high");
    }
    expect(result.markdown).toContain("Heavy reads");
  });

  test("supplements loop-diagnosis from patterns when JSON fails", () => {
    const result = parseAnalysisResponse("loop-diagnosis", "not json at all", "en", [retryPattern]);
    expect(result.parseWarning).toBeUndefined();
    expect(result.analysisSource).toBe("heuristic");
    expect(result.structured?.kind).toBe("prevention-rules");
    if (result.structured?.kind === "prevention-rules") {
      expect(result.structured.rules.length).toBeGreaterThan(0);
      expect(result.structured.rules[0]?.content).toContain("Stop after 2 failures");
      expect(result.structured.summary).toContain("detected session patterns");
    }
  });

  test("merges heuristic tool hints into tool-hardening", () => {
    const raw = JSON.stringify({ summary: "Bash issues", toolHints: [] });
    const result = parseAnalysisResponse("tool-hardening", raw, "en", [toolErrorPattern]);
    expect(result.analysisSource).toBe("hybrid");
    expect(result.structured?.kind).toBe("artifacts");
    if (result.structured?.kind === "artifacts") {
      expect(result.structured.items.length).toBeGreaterThan(0);
      expect(result.structured.items[0]?.kind).toBe("tool-hint");
    }
  });

  test("returns markdown for agentic-lessons", () => {
    const raw = "## Principles\n\n1. Confirm scope early.";
    const result = parseAnalysisResponse("agentic-lessons", raw, "en");
    expect(result.structured).toBeUndefined();
    expect(result.markdown).toContain("Principles");
  });

  test("warns when structured output is empty", () => {
    const raw = JSON.stringify({ summary: "", wasteItems: [] });
    const result = parseAnalysisResponse("token-audit", raw, "en", []);
    expect(result.parseWarning).toContain("no actionable items");
  });

  test("buildHeuristicFallbackResult fills token-audit from patterns", () => {
    const wastePattern: RecurringPattern = {
      id: "token_waste_read:foo",
      kind: "token_waste_read",
      label: "Large reads",
      description: "Same file read 8 times",
      count: 8,
      sessionIds: ["s1"],
      estimatedTokenWaste: 4000,
      recommendation: "Cache reads.",
    };
    const result = buildHeuristicFallbackResult("token-audit", [wastePattern], "en");
    expect(result?.analysisSource).toBe("heuristic");
    expect(result?.structured?.kind).toBe("token-audit");
    if (result?.structured?.kind === "token-audit") {
      expect(result.structured.wasteItems.length).toBeGreaterThan(0);
    }
  });

  test("memory-file-drafts excludes cursor rules paths", () => {
    const raw = JSON.stringify({
      summary: "Context to persist",
      files: [
        {
          path: ".cursor/rules/agent-efficiency.mdc",
          purpose: "wrong type",
          action: "create",
          rationale: "loops",
          content: "# Rule body",
        },
        {
          path: "AGENTS.md",
          purpose: "project memory",
          action: "create",
          rationale: "ERP context",
          content: "# Project\n\nERP modules overview.",
        },
      ],
    });
    const result = parseAnalysisResponse("memory-file-drafts", raw, "en");
    expect(result.structured?.kind).toBe("memory-files");
    if (result.structured?.kind === "memory-files") {
      expect(result.structured.files).toHaveLength(1);
      expect(result.structured.files[0]?.path).toBe("AGENTS.md");
    }
    expect(result.parseWarning).toContain("Excluded");
  });
});
