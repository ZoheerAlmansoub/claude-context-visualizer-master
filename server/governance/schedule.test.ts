import { describe, expect, test } from "bun:test";
import { isGovernanceEligible } from "./schedule.ts";
import type { GovernanceScheduleState } from "./schedule.ts";

describe("governance schedule", () => {
  test("eligible when new sessions exceed threshold", () => {
    const schedule: GovernanceScheduleState = {
      agent: "cursor",
      projectSlug: "test",
      enabled: true,
      minNewSessions: 3,
      lastRunAt: "2026-01-01T00:00:00Z",
      lastSessionCount: 5,
    };
    const result = isGovernanceEligible(schedule, 9);
    expect(result.eligible).toBe(true);
    expect(result.newSessions).toBe(4);
  });

  test("not eligible when below threshold", () => {
    const schedule: GovernanceScheduleState = {
      agent: "cursor",
      projectSlug: "test",
      enabled: true,
      minNewSessions: 5,
      lastRunAt: "2026-01-01T00:00:00Z",
      lastSessionCount: 10,
    };
    const result = isGovernanceEligible(schedule, 12);
    expect(result.eligible).toBe(false);
  });
});
