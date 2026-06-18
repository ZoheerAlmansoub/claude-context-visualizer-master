import { describe, expect, test } from "bun:test";
import {
  coerceImprovementFields,
  isFallbackRationale,
  parseImprovementResponse,
} from "./llm/parse-improvement-response.ts";
import { formatPromptImprovementMarkdown } from "./llm/prompts.ts";

const SAMPLE_WITH_BAD_ESCAPE = `{
  "improvedPrompt": "# Title\\n\\n## Section\\n(Payments & Billing)\\- bullet",
  "rationale": "Clear scope and structured output.",
  "issues": ["Too vague", "No acceptance criteria"],
  "tips": ["Define deliverable", "Use P0/P1/P2"]
}`;

describe("parseImprovementResponse", () => {
  test("parses JSON with invalid escape sequences", () => {
    const parsed = parseImprovementResponse(SAMPLE_WITH_BAD_ESCAPE);
    expect(parsed.improvedPrompt).toContain("# Title");
    expect(parsed.improvedPrompt).toContain("(Payments & Billing)- bullet");
    expect(parsed.rationale).toContain("Clear scope");
    expect(parsed.issues).toHaveLength(2);
    expect(parsed.tips).toHaveLength(2);
  });

  test("coerce extracts from stored JSON blob in improvedPrompt field", () => {
    const coerced = coerceImprovementFields({
      improvedPrompt: SAMPLE_WITH_BAD_ESCAPE,
      rationale: "تحسين تلقائي — راجع النص أعلاه.",
      issues: [],
      tips: [],
    });
    expect(coerced.improvedPrompt).toContain("# Title");
    expect(coerced.rationale).toContain("Clear scope");
    expect(coerced.issues.length).toBe(2);
    expect(isFallbackRationale("تحسين تلقائي — راجع النص أعلاه.")).toBe(true);
  });

  test("formats markdown report", () => {
    const md = formatPromptImprovementMarkdown({
      improvedPrompt: "Implement feature X with tests.",
      rationale: "Clear scope and acceptance criteria.",
      issues: ["Too vague", "No acceptance criteria"],
      tips: ["State file paths", "Define done criteria"],
      originalText: "do the thing",
      turn: 3,
      locale: "en",
    });
    expect(md).toContain("Implement feature X");
    expect(md).toContain("Turn 3");
  });
});
