import { describe, expect, test } from "bun:test";
import {
  AUTO_APPLY_ANALYSIS_TYPES,
  PROJECT_PIPELINES,
  SESSION_PIPELINES,
  SESSION_WIZARD_STEPS,
  SUMMARY_STEP_TYPES,
  pipelineStepTypes,
} from "../../shared/governance-config.ts";
import { getGovernanceConfigResponse } from "./config-api.ts";

describe("governance-config", () => {
  test("session full pipeline includes agent-orchestration", () => {
    expect(SESSION_PIPELINES.full).toContain("agent-orchestration");
  });

  test("API response matches shared step lists", () => {
    const cfg = getGovernanceConfigResponse("cursor");
    expect(cfg.sessionPipelines).toEqual(SESSION_PIPELINES);
    expect(cfg.projectPipelines).toEqual(PROJECT_PIPELINES);
    expect(cfg.wizardSteps).toEqual(SESSION_WIZARD_STEPS);
    expect(cfg.summaryStepTypes).toEqual(SUMMARY_STEP_TYPES);
    expect(cfg.autoApplyTypes).toEqual(AUTO_APPLY_ANALYSIS_TYPES);
  });

  test("pipelineStepTypes resolves scope and mode", () => {
    expect(pipelineStepTypes("session", "quick")).toEqual(["token-audit", "loop-diagnosis"]);
    expect(pipelineStepTypes("project", "full")).toEqual(PROJECT_PIPELINES.full);
  });
});
