import { ANALYSIS_TYPES } from "../config.ts";
import type { AgentKind } from "../types.ts";
import {
  AUTO_APPLY_ANALYSIS_TYPES,
  PROJECT_PIPELINES,
  SESSION_PIPELINES,
  SESSION_WIZARD_STEPS,
  SUMMARY_STEP_TYPES,
} from "../../shared/governance-config.ts";
import { agentArtifactPathHints, primaryMemoryPath } from "../../shared/artifact-paths.ts";

export function getGovernanceConfigResponse(agent: AgentKind = "cursor") {
  return {
    sessionPipelines: SESSION_PIPELINES,
    projectPipelines: PROJECT_PIPELINES,
    wizardSteps: SESSION_WIZARD_STEPS,
    summaryStepTypes: SUMMARY_STEP_TYPES,
    autoApplyTypes: AUTO_APPLY_ANALYSIS_TYPES,
    analysisTypes: ANALYSIS_TYPES,
    agentPathHints: agentArtifactPathHints(agent),
    primaryMemoryPath: primaryMemoryPath(agent),
  };
}
