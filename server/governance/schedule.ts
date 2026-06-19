import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CACHE_DIR } from "../paths.ts";
import type { AgentKind } from "../types.ts";

export type GovernanceScheduleState = {
  agent: AgentKind;
  projectSlug: string;
  enabled: boolean;
  minNewSessions: number;
  lastRunAt: string | null;
  lastSessionCount: number;
  lastPipelineId?: string;
};

function schedulePath(agent: AgentKind, projectSlug: string): string {
  return join(CACHE_DIR, "governance-schedule", agent, `${projectSlug}.json`);
}

export async function getGovernanceSchedule(
  agent: AgentKind,
  projectSlug: string,
): Promise<GovernanceScheduleState> {
  try {
    return JSON.parse(await readFile(schedulePath(agent, projectSlug), "utf8")) as GovernanceScheduleState;
  } catch {
    return {
      agent,
      projectSlug,
      enabled: process.env.GOVERNANCE_AUTO_SCHEDULE === "1",
      minNewSessions: Number(process.env.GOVERNANCE_MIN_NEW_SESSIONS ?? 3),
      lastRunAt: null,
      lastSessionCount: 0,
    };
  }
}

export async function saveGovernanceSchedule(state: GovernanceScheduleState): Promise<void> {
  const path = schedulePath(state.agent, state.projectSlug);
  await mkdir(join(CACHE_DIR, "governance-schedule", state.agent), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2), "utf8");
}

export async function recordGovernanceRun(opts: {
  agent: AgentKind;
  projectSlug: string;
  sessionCount: number;
  pipelineId: string;
}): Promise<GovernanceScheduleState> {
  const prev = await getGovernanceSchedule(opts.agent, opts.projectSlug);
  const next: GovernanceScheduleState = {
    ...prev,
    lastRunAt: new Date().toISOString(),
    lastSessionCount: opts.sessionCount,
    lastPipelineId: opts.pipelineId,
  };
  await saveGovernanceSchedule(next);
  return next;
}

export function isGovernanceEligible(
  schedule: GovernanceScheduleState,
  currentSessionCount: number,
): { eligible: boolean; newSessions: number; reason: string } {
  const newSessions = Math.max(0, currentSessionCount - schedule.lastSessionCount);
  if (!schedule.lastRunAt) {
    return { eligible: currentSessionCount > 0, newSessions: currentSessionCount, reason: "never_run" };
  }
  if (newSessions >= schedule.minNewSessions) {
    return { eligible: true, newSessions, reason: "new_sessions_threshold" };
  }
  return {
    eligible: false,
    newSessions,
    reason: `need_${schedule.minNewSessions - newSessions}_more_sessions`,
  };
}
