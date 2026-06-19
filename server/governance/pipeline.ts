import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CACHE_DIR } from "../paths.ts";
import { runAnalysis } from "../analysis.ts";
import { computeTranscript } from "../transcript.ts";
import { findSessionMeta } from "../indexer.ts";
import { getProjectInsights } from "../insights/indexer.ts";
import { loadProjectContext } from "../project-context.ts";
import type {
  AgentKind,
  AnalyzeType,
  GovernancePipelineMode,
  GovernancePipelineResult,
  GovernancePipelineStep,
  LlmProviderKind,
} from "../types.ts";
import { generateProjectPlaybook } from "./playbook.ts";
import { PROJECT_PIPELINES, SESSION_PIPELINES } from "./step-lists.ts";
import { recordGovernanceRun } from "./schedule.ts";
import {
  AUTO_APPLY_ANALYSIS_TYPES,
  collectApplyPackFromAnalysis,
  filterAutoApplyItems,
} from "../artifacts/apply-collector.ts";
import { applyArtifactPack } from "../artifacts/write.ts";
import { getSessionAnalysis } from "../analysis.ts";

function pipelineCachePath(id: string): string {
  return join(CACHE_DIR, "pipeline", `${id}.json`);
}

function resolvePipelineSteps(scope: "session" | "project", mode: GovernancePipelineMode): AnalyzeType[] {
  return scope === "session" ? SESSION_PIPELINES[mode] : PROJECT_PIPELINES[mode];
}

function formatCrossSessionPatterns(patterns: Awaited<ReturnType<typeof getProjectInsights>>): string {
  if (!patterns.length) return "";
  const lines = ["## Cross-session patterns (project-wide)", ""];
  for (const p of patterns.slice(0, 20)) {
    lines.push(
      `- **${p.label}** (${p.count}x, ${p.sessionIds.length} sessions): ${p.description}. Fix: ${p.recommendation}`,
    );
  }
  return lines.join("\n");
}

async function persistPipeline(payload: GovernancePipelineResult): Promise<void> {
  payload.updatedAt = new Date().toISOString();
  await mkdir(join(CACHE_DIR, "pipeline"), { recursive: true });
  await writeFile(pipelineCachePath(payload.pipelineId), JSON.stringify(payload, null, 2), "utf8");
}

async function isCancelled(pipelineId: string): Promise<boolean> {
  const current = await getGovernancePipeline(pipelineId);
  return !!current?.cancelled;
}

type PipelineRunContext = {
  agent: AgentKind;
  scope: "session" | "project";
  mode: GovernancePipelineMode;
  provider?: LlmProviderKind;
  model?: string;
  locale: "ar" | "en";
  force: boolean;
  sessionId?: string;
  projectSlug?: string;
  sessionTitle?: string;
  transcriptFilePath: string;
  transcriptMtimeMs: number;
  projectPath: string;
  projectSlug: string;
  crossPatterns: string;
  patterns?: Awaited<ReturnType<typeof getProjectInsights>>;
  autoApply?: boolean;
  analysisSessionId: string;
  projectSessionCount?: number;
};

async function executePipelineSteps(
  pipelineId: string,
  payload: GovernancePipelineResult,
  ctx: PipelineRunContext,
): Promise<void> {
  const projectContext = await loadProjectContext({
    agent: ctx.agent,
    projectSlug: ctx.projectSlug,
    cwd: ctx.projectPath,
  });
  payload.projectRoot = projectContext.projectRoot;

  const transcript = await computeTranscript(
    ctx.transcriptFilePath,
    ctx.agent,
    ctx.analysisSessionId,
  );

  for (let i = 0; i < payload.steps.length; i++) {
    const step = payload.steps[i]!;
    if (step.status === "done" || step.status === "skipped") continue;
    if (await isCancelled(pipelineId)) {
      payload.status = "cancelled";
      await persistPipeline(payload);
      return;
    }

    payload.steps[i] = { ...step, status: "running" };
    payload.status = "running";
    await persistPipeline(payload);

    try {
      const result = await runAnalysis(transcript, {
        type: step.type,
        provider: ctx.provider,
        model: ctx.model,
        locale: ctx.locale,
        force: ctx.force,
        transcriptMtimeMs: ctx.transcriptMtimeMs,
        projectSlug: ctx.projectSlug,
        projectPath: ctx.projectPath,
        projectContext,
        crossSessionPatterns: ctx.crossPatterns,
      });
      payload.steps[i] = { type: step.type, status: "done", analysisId: result.analysisId };
    } catch (err) {
      payload.steps[i] = {
        type: step.type,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      };
    }
    await persistPipeline(payload);
  }

  if (await isCancelled(pipelineId)) {
    payload.status = "cancelled";
    await persistPipeline(payload);
    return;
  }

  payload.playbookMarkdown = await generateProjectPlaybook({
    agent: ctx.agent,
    projectSlug: ctx.projectSlug,
    projectRoot: projectContext.projectRoot,
    scope: ctx.scope,
    sessionTitle: ctx.sessionTitle,
    patterns: ctx.patterns,
    steps: payload.steps,
  });
  payload.status = payload.steps.some((s) => s.status === "error") ? "error" : "complete";

  if (payload.autoApply && projectContext.verified && projectContext.projectRoot) {
    const packItems = [];
    for (const step of payload.steps) {
      if (step.status !== "done" || !step.analysisId || !AUTO_APPLY_ANALYSIS_TYPES.has(step.type)) continue;
      const analysis = await getSessionAnalysis(ctx.agent, ctx.analysisSessionId, step.analysisId);
      if (analysis) packItems.push(...collectApplyPackFromAnalysis(analysis, ctx.agent));
    }
    const toApply = filterAutoApplyItems(packItems).map((i) => ({
      path: i.path,
      content: i.content,
      action: i.action,
      selected: true,
    }));
    if (toApply.length) {
      payload.applyResults = await applyArtifactPack(toApply, projectContext.projectRoot);
    }
  }

  if (ctx.scope === "project" && ctx.projectSessionCount != null) {
    await recordGovernanceRun({
      agent: ctx.agent,
      projectSlug: ctx.projectSlug,
      sessionCount: ctx.projectSessionCount,
      pipelineId,
    });
  }

  await persistPipeline(payload);
}

function initPipelinePayload(opts: {
  pipelineId: string;
  scope: "session" | "project";
  mode: GovernancePipelineMode;
  steps: AnalyzeType[];
  agent: AgentKind;
  sessionId?: string;
  projectSlug: string;
  provider?: LlmProviderKind;
  model?: string;
  locale: "ar" | "en";
  autoApply?: boolean;
}): GovernancePipelineResult {
  return {
    pipelineId: opts.pipelineId,
    scope: opts.scope,
    mode: opts.mode,
    status: "running",
    cancelled: false,
    steps: opts.steps.map((type) => ({ type, status: "pending" as const })),
    agent: opts.agent,
    sessionId: opts.sessionId,
    projectSlug: opts.projectSlug,
    provider: opts.provider,
    model: opts.model,
    locale: opts.locale,
    autoApply: opts.autoApply,
  };
}

export async function runSessionGovernancePipeline(opts: {
  agent: AgentKind;
  sessionId: string;
  provider?: LlmProviderKind;
  model?: string;
  locale?: "ar" | "en";
  force?: boolean;
  mode?: GovernancePipelineMode;
  autoApply?: boolean;
}): Promise<GovernancePipelineResult> {
  const meta = await findSessionMeta(opts.sessionId, opts.agent);
  if (!meta) throw new Error("Session not found");

  const mode = opts.mode ?? "standard";
  const steps = resolvePipelineSteps("session", mode);
  const crossPatterns = formatCrossSessionPatterns(
    await getProjectInsights(opts.agent, meta.project, { limit: 20 }),
  );

  const pipelineId = createHash("sha256")
    .update(`session:${opts.sessionId}:${Date.now()}`)
    .digest("hex")
    .slice(0, 16);

  const payload = initPipelinePayload({
    pipelineId,
    scope: "session",
    mode,
    steps,
    agent: opts.agent,
    sessionId: opts.sessionId,
    projectSlug: meta.project,
    provider: opts.provider,
    model: opts.model,
    locale: opts.locale ?? "en",
    autoApply: opts.autoApply ?? process.env.GOVERNANCE_AUTO_APPLY === "1",
  });
  await persistPipeline(payload);

  const ctx: PipelineRunContext = {
    agent: opts.agent,
    scope: "session",
    mode,
    provider: opts.provider,
    model: opts.model,
    locale: opts.locale ?? "en",
    force: opts.force ?? true,
    sessionId: opts.sessionId,
    projectSlug: meta.project,
    sessionTitle: meta.title,
    transcriptFilePath: meta.filePath,
    transcriptMtimeMs: meta.mtimeMs,
    projectPath: meta.projectPath,
    crossPatterns,
    autoApply: payload.autoApply,
    analysisSessionId: opts.sessionId,
  };

  void executePipelineSteps(pipelineId, payload, ctx).catch(async (err) => {
    payload.status = "error";
    await persistPipeline(payload);
    console.error("Session governance pipeline failed:", err);
  });

  return payload;
}

export async function runProjectGovernancePipeline(opts: {
  agent: AgentKind;
  projectSlug: string;
  provider?: LlmProviderKind;
  model?: string;
  locale?: "ar" | "en";
  force?: boolean;
  mode?: GovernancePipelineMode;
  autoApply?: boolean;
}): Promise<GovernancePipelineResult> {
  const { listSessions } = await import("../indexer.ts");
  const sessions = await listSessions(opts.projectSlug, opts.agent);
  const latest = sessions[0];
  if (!latest) throw new Error("No sessions in project");

  const mode = opts.mode ?? "standard";
  const steps = resolvePipelineSteps("project", mode);
  const patterns = await getProjectInsights(opts.agent, opts.projectSlug, { limit: 30, refresh: true });
  const crossPatterns = formatCrossSessionPatterns(patterns);

  const pipelineId = createHash("sha256")
    .update(`project:${opts.projectSlug}:${Date.now()}`)
    .digest("hex")
    .slice(0, 16);

  const payload = initPipelinePayload({
    pipelineId,
    scope: "project",
    mode,
    steps,
    agent: opts.agent,
    projectSlug: opts.projectSlug,
    provider: opts.provider,
    model: opts.model,
    locale: opts.locale ?? "en",
    autoApply: opts.autoApply ?? process.env.GOVERNANCE_AUTO_APPLY === "1",
  });
  await persistPipeline(payload);

  const ctx: PipelineRunContext = {
    agent: opts.agent,
    scope: "project",
    mode,
    provider: opts.provider,
    model: opts.model,
    locale: opts.locale ?? "en",
    force: opts.force ?? true,
    projectSlug: opts.projectSlug,
    transcriptFilePath: latest.filePath,
    transcriptMtimeMs: latest.mtimeMs,
    projectPath: latest.projectPath,
    crossPatterns,
    patterns,
    autoApply: payload.autoApply,
    analysisSessionId: latest.id,
    projectSessionCount: sessions.length,
  };

  void executePipelineSteps(pipelineId, payload, ctx).catch(async (err) => {
    payload.status = "error";
    await persistPipeline(payload);
    console.error("Project governance pipeline failed:", err);
  });

  return payload;
}

export async function getGovernancePipeline(pipelineId: string): Promise<GovernancePipelineResult | null> {
  try {
    return JSON.parse(await readFile(pipelineCachePath(pipelineId), "utf8")) as GovernancePipelineResult;
  } catch {
    return null;
  }
}

export async function cancelGovernancePipeline(pipelineId: string): Promise<GovernancePipelineResult | null> {
  const payload = await getGovernancePipeline(pipelineId);
  if (!payload) return null;
  payload.cancelled = true;
  payload.status = "cancelled";
  await persistPipeline(payload);
  return payload;
}

export async function resumeGovernancePipeline(pipelineId: string): Promise<GovernancePipelineResult | null> {
  const payload = await getGovernancePipeline(pipelineId);
  if (!payload || !payload.agent) return null;
  if (payload.status === "complete") return payload;

  payload.cancelled = false;
  payload.status = "running";
  await persistPipeline(payload);

  let ctx: PipelineRunContext;
  if (payload.scope === "session" && payload.sessionId) {
    const meta = await findSessionMeta(payload.sessionId, payload.agent);
    if (!meta) throw new Error("Session not found");
    const crossPatterns = formatCrossSessionPatterns(
      await getProjectInsights(payload.agent, meta.project, { limit: 20 }),
    );
    ctx = {
      agent: payload.agent,
      scope: "session",
      mode: payload.mode ?? "standard",
      provider: payload.provider,
      model: payload.model,
      locale: payload.locale ?? "en",
      force: true,
      sessionId: payload.sessionId,
      projectSlug: meta.project,
      sessionTitle: meta.title,
      transcriptFilePath: meta.filePath,
      transcriptMtimeMs: meta.mtimeMs,
      projectPath: meta.projectPath,
      crossPatterns,
      autoApply: payload.autoApply,
      analysisSessionId: payload.sessionId,
    };
  } else if (payload.projectSlug) {
    const { listSessions } = await import("../indexer.ts");
    const sessions = await listSessions(payload.projectSlug, payload.agent);
    const latest = sessions[0];
    if (!latest) throw new Error("No sessions in project");
    const patterns = await getProjectInsights(payload.agent, payload.projectSlug, { limit: 30 });
    ctx = {
      agent: payload.agent,
      scope: "project",
      mode: payload.mode ?? "standard",
      provider: payload.provider,
      model: payload.model,
      locale: payload.locale ?? "en",
      force: true,
      projectSlug: payload.projectSlug,
      transcriptFilePath: latest.filePath,
      transcriptMtimeMs: latest.mtimeMs,
      projectPath: latest.projectPath,
      crossPatterns: formatCrossSessionPatterns(patterns),
      patterns,
      autoApply: payload.autoApply,
      analysisSessionId: latest.id,
    };
  } else {
    return null;
  }

  void executePipelineSteps(pipelineId, payload, ctx).catch(async (err) => {
    payload.status = "error";
    await persistPipeline(payload);
    console.error("Resume governance pipeline failed:", err);
  });

  return payload;
}

export async function buildSyntheticTranscriptForProject(
  agent: AgentKind,
  projectSlug: string,
): Promise<{ transcript: import("../types.ts").SessionTranscript; meta: { mtimeMs: number; projectPath: string } } | null> {
  const { listSessions } = await import("../indexer.ts");
  const sessions = await listSessions(projectSlug, agent);
  const latest = sessions[0];
  if (!latest) return null;
  const transcript = await computeTranscript(latest.filePath, agent, latest.id);
  return {
    transcript,
    meta: { mtimeMs: latest.mtimeMs, projectPath: latest.projectPath },
  };
}
