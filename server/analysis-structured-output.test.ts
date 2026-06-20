import { describe, expect, test } from "bun:test";
import {
  hasCompleteJsonObject,
  isTruncatedLlmOutput,
} from "./llm/json-recovery.ts";
import {
  isAcceptableStructuredAnalysis,
  isSalvagedPartialParse,
  scaledMaxTokens,
} from "./analysis-structured-output.ts";
import { partialParseWarning } from "./llm/json-recovery.ts";
import { parseAnalysisResponse } from "./llm/parse-analysis-response.ts";

describe("structured output validation", () => {
  test("truncated user-growth JSON is not complete", () => {
    const raw = `{"summary":"x","overallScore":25,"growthAreas":[{"area":"a","whyItMatters":"b","concreteActions":["Use`;
    expect(hasCompleteJsonObject(raw)).toBe(false);
    expect(isTruncatedLlmOutput(raw, { finishReason: "stop" })).toBe(true);
  });

  test("finish_reason length marks truncation even when salvage might extract fields", () => {
    const raw = `{"summary":"ok","weeklyPlan":[]}`;
    expect(isTruncatedLlmOutput(raw, { finishReason: "length", maxTokens: 1280, completionTokens: 1280 })).toBe(
      true,
    );
  });

  test("salvaged partial parse is rejected for structured analyses", () => {
    const parsed = {
      structured: { kind: "user-growth" as const, summary: "x", overallScore: 25, weeklyPlan: [], growthAreas: [] },
      markdown: "x",
      parseWarning: partialParseWarning("en"),
    };
    expect(isSalvagedPartialParse(parsed, "en")).toBe(true);
    expect(
      isAcceptableStructuredAnalysis("user-growth-plan", '{"summary":"x"}', parsed, { text: "" }, 4096, "en"),
    ).toBe(false);
  });

  test("scaledMaxTokens doubles budget up to cap", () => {
    expect(scaledMaxTokens({ maxTokens: 2048 } as never, 2)).toBe(4096);
    expect(scaledMaxTokens({ maxTokens: 8192 } as never, 2.5)).toBe(16384);
  });

  test("complete small JSON passes acceptance", () => {
    const raw = JSON.stringify({
      summary: "ok",
      overallScore: 40,
      weeklyPlan: [{ day: "Mon", focus: "f", task: "t" }],
      growthAreas: [{ area: "a", whyItMatters: "w", concreteActions: ["do"] }],
    });
    const parsed = parseAnalysisResponse("user-growth-plan", raw, "en");
    expect(
      isAcceptableStructuredAnalysis(
        "user-growth-plan",
        raw,
        parsed,
        { text: raw, finishReason: "stop" },
        4096,
        "en",
      ),
    ).toBe(true);
  });
});
