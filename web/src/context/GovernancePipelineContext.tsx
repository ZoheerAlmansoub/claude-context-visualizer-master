import { createContext, useContext, type ReactNode } from "react";
import {
  useGovernancePipeline as useGovernancePipelineState,
  pipelineCurrentStep,
  pipelineProgress,
} from "../hooks/useGovernancePipeline";

type GovernancePipelineValue = ReturnType<typeof useGovernancePipelineState>;

const GovernancePipelineContext = createContext<GovernancePipelineValue | null>(null);

export function GovernancePipelineProvider({ children }: { children: ReactNode }) {
  const value = useGovernancePipelineState();
  return <GovernancePipelineContext.Provider value={value}>{children}</GovernancePipelineContext.Provider>;
}

export function useGovernancePipeline(): GovernancePipelineValue {
  const ctx = useContext(GovernancePipelineContext);
  if (!ctx) {
    throw new Error("useGovernancePipeline must be used within GovernancePipelineProvider");
  }
  return ctx;
}

export { pipelineCurrentStep, pipelineProgress };
