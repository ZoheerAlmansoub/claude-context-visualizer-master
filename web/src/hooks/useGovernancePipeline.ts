import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  type AgentKind,
  type GovernancePipelineMode,
  type GovernancePipelineResult,
  type LlmProviderKind,
} from "../api";
import { createOptimisticPipeline } from "../lib/governance-pipeline-ui";

export function pipelineProgress(steps: GovernancePipelineResult["steps"]): number {
  if (!steps.length) return 0;
  const done = steps.filter(
    (s) => s.status === "done" || s.status === "error" || s.status === "skipped",
  ).length;
  return Math.round((done / steps.length) * 100);
}

export function pipelineCurrentStep(steps: GovernancePipelineResult["steps"]): string | null {
  const running = steps.find((s) => s.status === "running");
  if (running) return running.type;
  const pending = steps.find((s) => s.status === "pending");
  return pending?.type ?? null;
}

type RunOpts = {
  agent: AgentKind;
  provider?: LlmProviderKind;
  model?: string;
  locale?: "ar" | "en";
  mode?: GovernancePipelineMode;
  autoApply?: boolean;
};

export function useGovernancePipeline() {
  const [pipeline, setPipeline] = useState<GovernancePipelineResult | null>(null);
  const [running, setRunning] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (pipelineId: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const latest = await api.getGovernancePipeline(pipelineId);
          if (!latest) return;
          setPipeline(latest);
          if (
            latest.status === "complete" ||
            latest.status === "cancelled" ||
            latest.status === "error"
          ) {
            setRunning(false);
            stopPolling();
          }
        } catch {
          /* keep polling */
        }
      }, 1200);
    },
    [stopPolling],
  );

  useEffect(() => () => stopPolling(), [stopPolling]);

  const runSession = useCallback(
    async (sessionId: string, opts: RunOpts) => {
      const mode = opts.mode ?? "standard";
      setRunning(true);
      setPipeline(
        createOptimisticPipeline({ scope: "session", mode, sessionId }),
      );
      const result = await api.governSession(opts.agent, sessionId, {
        provider: opts.provider,
        model: opts.model,
        locale: opts.locale,
        force: true,
        mode,
        autoApply: opts.autoApply,
      });
      setPipeline(result);
      startPolling(result.pipelineId);
      return result;
    },
    [startPolling],
  );

  const runProject = useCallback(
    async (projectSlug: string, opts: RunOpts) => {
      const mode = opts.mode ?? "standard";
      setRunning(true);
      setPipeline(createOptimisticPipeline({ scope: "project", mode }));
      const result = await api.governProject(opts.agent, projectSlug, {
        provider: opts.provider,
        model: opts.model,
        locale: opts.locale,
        force: true,
        mode,
        autoApply: opts.autoApply,
      });
      setPipeline(result);
      startPolling(result.pipelineId);
      return result;
    },
    [startPolling],
  );

  const stopPipeline = useCallback(async () => {
    if (!pipeline?.pipelineId) return null;
    const result = await api.cancelGovernancePipeline(pipeline.pipelineId);
    if (result) setPipeline(result);
    setRunning(false);
    stopPolling();
    return result;
  }, [pipeline?.pipelineId, stopPolling]);

  const resumePipeline = useCallback(async () => {
    if (!pipeline?.pipelineId) return null;
    setRunning(true);
    const result = await api.resumeGovernancePipeline(pipeline.pipelineId);
    if (result) {
      setPipeline(result);
      startPolling(result.pipelineId);
    }
    return result;
  }, [pipeline?.pipelineId, startPolling]);

  return {
    pipeline,
    setPipeline,
    running,
    setRunning,
    runSession,
    runProject,
    stopPipeline,
    resumePipeline,
    progress: pipeline ? pipelineProgress(pipeline.steps) : 0,
    currentStep: pipeline ? pipelineCurrentStep(pipeline.steps) : null,
  };
}
