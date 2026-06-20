import type { GovernancePipelineMode, GovernancePipelineResult } from "../api";
import { pipelineStepTypes } from "./governance-steps";

export function createOptimisticPipeline(opts: {
  scope: "session" | "project";
  mode: GovernancePipelineMode;
  sessionId?: string;
}): GovernancePipelineResult {
  const types = pipelineStepTypes(opts.scope, opts.mode);
  return {
    pipelineId: "",
    scope: opts.scope,
    mode: opts.mode,
    status: "running",
    sessionId: opts.sessionId,
    steps: types.map((type, index) => ({
      type,
      status: index === 0 ? "running" : "pending",
    })),
  };
}

export function isPipelineInitializing(pipeline: GovernancePipelineResult): boolean {
  return !pipeline.pipelineId && pipeline.status === "running";
}
