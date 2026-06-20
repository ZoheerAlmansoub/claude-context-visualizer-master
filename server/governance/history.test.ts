import { describe, expect, test } from "bun:test";
import { toGovernanceListItem } from "./history.ts";
import type { GovernancePipelineResult } from "../types.ts";

describe("governance history", () => {
  test("toGovernanceListItem summarizes step counts", () => {
    const payload: GovernancePipelineResult = {
      pipelineId: "abc123",
      scope: "project",
      mode: "standard",
      status: "complete",
      agent: "cursor",
      projectSlug: "test-project",
      createdAt: "2026-06-19T10:00:00Z",
      updatedAt: "2026-06-19T10:05:00Z",
      summaryMarkdown: "## Summary",
      playbookMarkdown: "# Playbook",
      steps: [
        { type: "project-health-report", status: "done", analysisId: "a1" },
        { type: "user-growth-plan", status: "done", analysisId: "a2" },
        { type: "token-audit", status: "error", error: "timeout" },
      ],
    };

    const item = toGovernanceListItem(payload);
    expect(item.stepsDone).toBe(2);
    expect(item.stepsTotal).toBe(3);
    expect(item.stepsFailed).toBe(1);
    expect(item.hasSummary).toBe(true);
    expect(item.hasPlaybook).toBe(true);
  });
});
