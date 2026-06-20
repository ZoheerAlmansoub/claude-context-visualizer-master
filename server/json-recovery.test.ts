import { describe, expect, test } from "bun:test";
import { parseAnalysisResponse } from "./llm/parse-analysis-response.ts";
import {
  parseJsonObjectRobust,
  repairUnescapedNewlinesInJsonStrings,
  salvageAnalysisObject,
} from "./llm/json-recovery.ts";

describe("json-recovery", () => {
  test("repairs unescaped newlines inside JSON strings", () => {
    const broken = `{"summary":"ok","files":[{"path":"AGENTS.md","content":"# Title
second line"}]}`;
    const repaired = repairUnescapedNewlinesInJsonStrings(broken);
    const parsed = JSON.parse(repaired) as { files: Array<{ content: string }> };
    expect(parsed.files[0]?.content).toContain("second line");
  });

  test("parseJsonObjectRobust handles Windows-style path escapes", () => {
    const raw =
      '{"summary":"ERP context","files":[{"path":"AGENTS.md","purpose":"memory","action":"create","rationale":"session","content":"Root at D:\\dev\\ERP-SAP with modules."}]}';
    const parsed = parseJsonObjectRobust(raw);
    expect(Array.isArray(parsed.files)).toBe(true);
    expect(String((parsed.files as Array<{ content: string }>)[0]?.content)).toContain("ERP-SAP");
  });

  test("salvage extracts user-growth plan when JSON is truncated mid growthAreas", () => {
    const raw = `{
  "summary": "Growth plan overview",
  "overallScore": 25,
  "weeklyPlan": [
    { "day": "Mon", "focus": "Retry discipline", "task": "Stop after 2 failures" },
    { "day": "Tue", "focus": "Pre-flight", "task": "Verify paths before tools" }
  ],
  "growthAreas": [
    {
      "area": "Retry loop elimination",
      "whyItMatters": "600+ retry loops detected",
      "concreteActions": ["Stop after 2 failures", "Change approach"],
      "suggestedRule": "stop-after-2-failures",
      "suggestedSkill": "debugging-workflow",
      "practiceExercise": "Pick a failing command and diagnose"
    },
    {
      "area": "Input verification",
      "whyItMatters": "610 tool errors preventable",
      "concreteActions": ["Verify paths", "Validate syntax"],
      "suggestedRule": "verify-before-call",
      "suggestedSkill": "preflight-check",
      "practiceExercise": "Add verification comment before each call"
    },
    {
      "area": "Efficient context",
      "whyItMatters": "855 large reads",
      "concreteActions": [
        "Use semantic search",
        "Read with offset/limit",
        "Summarize outputs >3k tokens",
        "Use
`;
    const salvaged = salvageAnalysisObject("user-growth-plan", raw);
    expect(salvaged?.overallScore).toBe(25);
    expect((salvaged?.weeklyPlan as unknown[])?.length).toBe(2);
    expect((salvaged?.growthAreas as unknown[])?.length).toBe(2);
    const areas = salvaged?.growthAreas as Array<{ area: string; suggestedRule?: string }>;
    expect(areas[1]?.area).toBe("Input verification");
    expect(areas[0]?.suggestedRule).toBe("stop-after-2-failures");
  });

  test("salvage extracts files when JSON is truncated", () => {
    const raw = `{
  "summary": "ERP SaaS platform memory",
  "files": [
    {
      "path": "AGENTS.md",
      "purpose": "project memory",
      "action": "create",
      "rationale": "Sprint 1-2 work",
      "content": "# ERP-SAP SaaS Platform

## Overview
Multi-tenant ERP with .NET 8 backend."
    }
  `;
    const salvaged = salvageAnalysisObject("memory-file-drafts", raw);
    expect(salvaged?.summary).toContain("ERP");
    expect(Array.isArray(salvaged?.files)).toBe(true);
    expect((salvaged?.files as Array<{ path: string }>)[0]?.path).toBe("AGENTS.md");
  });
});

describe("parseAnalysisResponse recovery", () => {
  test("recovers memory-file-drafts from broken JSON with multiline content", () => {
    const raw = `Here is the analysis:
{
  "summary": "Durable ERP project context for future agents",
  "files": [
    {
      "path": "AGENTS.md",
      "purpose": "Project memory",
      "action": "create",
      "rationale": "Captured sprint outcomes",
      "content": "# ERP-SAP SaaS Platform

## Tech stack
- .NET 8 backend
- React + TypeScript frontend"
    }
  ]
}
`;
    const result = parseAnalysisResponse("memory-file-drafts", raw, "en");
    expect(result.structured?.kind).toBe("memory-files");
    if (result.structured?.kind === "memory-files") {
      expect(result.structured.files.length).toBeGreaterThan(0);
      expect(result.structured.files[0]?.content).toContain("ERP-SAP");
    }
    expect(result.rawLlmResponse).toContain("ERP-SAP");
  });
});
