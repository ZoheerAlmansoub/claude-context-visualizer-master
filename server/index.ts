import { listProjects, listSessions, findSessionById, findSessionMeta } from "./indexer.ts";
import { computeSnapshot } from "./snapshot.ts";
import { readCached, writeCached, invalidateCache } from "./cache.ts";
import { resolveSessionSourceMtimeMs } from "./opencode-loader.ts";
import { isAgentKind } from "./paths.ts";
import { computeTranscript, formatUserMessages } from "./transcript.ts";
import { getPublicLlmConfig, ANALYSIS_TYPES } from "./config.ts";
import {
  getLlmSettingsView,
  updateLlmSettings,
  type LlmSettingsPatch,
} from "./llm-config-store.ts";
import { testLlmConnection } from "./llm/test-connection.ts";
import { listLlmModels, enrichLlmModel, invalidateModelCatalogCache } from "./llm/list-models.ts";
import { runAnalysis, listSessionAnalyses, getSessionAnalysis } from "./analysis.ts";
import { improveUserPrompt, listPromptImprovements } from "./prompt-improvement.ts";
import { generateArtifacts } from "./artifacts/generator.ts";
import { detectSessionPatterns, writeArtifactFile } from "./insights/pattern-detector.ts";
import { applyArtifactPack } from "./artifacts/write.ts";
import { loadProjectContext, toProjectContextSummary } from "./project-context.ts";
import {
  runSessionGovernancePipeline,
  runProjectGovernancePipeline,
  getGovernancePipeline,
  cancelGovernancePipeline,
  resumeGovernancePipeline,
  listGovernancePipelines,
} from "./governance/pipeline.ts";
import { getGovernanceSchedule, isGovernanceEligible } from "./governance/schedule.ts";
import { exportPlaybookToProject } from "./governance/playbook.ts";
import { getGovernanceConfigResponse } from "./governance/config-api.ts";
import { getProjectInsights } from "./insights/indexer.ts";
import type { AnalyzeType, LlmProviderKind } from "./types.ts";

const PORT = Number(process.env.PORT ?? 5174);

function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      ...(init.headers ?? {}),
    },
  });
}

function notFound(msg = "not found") {
  return json({ error: msg }, { status: 404 });
}

function badRequest(msg: string) {
  return json({ error: msg }, { status: 400 });
}

function requestedAgent(url: URL) {
  const raw = url.searchParams.get("agent") ?? "claude";
  if (!isAgentKind(raw)) return null;
  return raw;
}

async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Decode path segments (e.g. project%3Aslug → project:slug for project-scoped analysis cache). */
function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

const server = Bun.serve({
  port: PORT,
  /** Allow long-running analyze/improve-prompt handlers (seconds; max 255) */
  idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    try {
      if (req.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
            "access-control-allow-headers": "content-type",
          },
        });
      }
      if (path === "/api/health") return json({ ok: true });

      if (path === "/api/config/llm" && req.method === "GET") {
        return json({ ...getPublicLlmConfig(), analysisTypes: ANALYSIS_TYPES });
      }

      if (path === "/api/governance/config" && req.method === "GET") {
        const agent = requestedAgent(url);
        if (!agent) return badRequest("unsupported agent");
        return json(getGovernanceConfigResponse(agent));
      }

      if (path === "/api/config/llm/settings" && req.method === "GET") {
        return json(getLlmSettingsView());
      }

      if (path === "/api/config/llm/settings" && req.method === "PUT") {
        const body = await readJsonBody(req);
        const view = updateLlmSettings(body as LlmSettingsPatch);
        invalidateModelCatalogCache();
        return json({ ok: true, settings: view, public: getPublicLlmConfig() });
      }

      if (path === "/api/config/llm/test" && req.method === "POST") {
        const body = await readJsonBody(req);
        const provider = body.provider as LlmProviderKind | undefined;
        if (!provider) return badRequest("provider required");
        const result = await testLlmConnection(provider, {
          apiKey: body.apiKey as string | undefined,
          baseUrl: body.baseUrl as string | undefined,
          apiUrl: body.apiUrl as string | undefined,
          model: body.model as string | undefined,
        });
        return json(result);
      }

      if (path === "/api/config/llm/models" && req.method === "POST") {
        const body = await readJsonBody(req);
        const provider = body.provider as LlmProviderKind | undefined;
        if (!provider) return badRequest("provider required");
        const result = await listLlmModels(provider, {
          apiKey: body.apiKey as string | undefined,
          baseUrl: body.baseUrl as string | undefined,
          apiUrl: body.apiUrl as string | undefined,
        }, {
          enrichOllama: body.enrichOllama !== false,
        });
        return json(result);
      }

      if (path === "/api/config/llm/models/enrich" && req.method === "POST") {
        const body = await readJsonBody(req);
        const provider = body.provider as LlmProviderKind | undefined;
        const modelId = body.modelId as string | undefined;
        if (!provider) return badRequest("provider required");
        if (!modelId?.trim()) return badRequest("modelId required");
        const result = await enrichLlmModel(provider, modelId.trim(), {
          apiKey: body.apiKey as string | undefined,
          baseUrl: body.baseUrl as string | undefined,
          apiUrl: body.apiUrl as string | undefined,
        });
        return json(result);
      }

      if (path === "/api/projects" && req.method === "GET") {
        const agent = requestedAgent(url);
        if (!agent) return badRequest("unsupported agent");
        return json(await listProjects(agent));
      }

      if (path === "/api/sessions" && req.method === "GET") {
        const agent = requestedAgent(url);
        if (!agent) return badRequest("unsupported agent");
        const project = url.searchParams.get("project");
        if (!project) return badRequest("project required");
        return json(await listSessions(project, agent));
      }

      const transcriptMatch = path.match(/^\/api\/sessions\/([^/]+)\/transcript$/);
      if (transcriptMatch && req.method === "GET") {
        const agent = requestedAgent(url);
        if (!agent) return badRequest("unsupported agent");
        const sessionId = decodePathSegment(transcriptMatch[1]!);
        const filePath = await findSessionById(sessionId, agent);
        if (!filePath) return notFound("session not found");
        const postCompactionOnly = url.searchParams.get("postCompactionOnly") === "true";
        const transcript = await computeTranscript(filePath, agent, sessionId, {
          postCompactionOnly,
        });
        return json(transcript);
      }

      const userMessagesMatch = path.match(/^\/api\/sessions\/([^/]+)\/user-messages$/);
      if (userMessagesMatch && req.method === "GET") {
        const agent = requestedAgent(url);
        if (!agent) return badRequest("unsupported agent");
        const sessionId = decodePathSegment(userMessagesMatch[1]!);
        const filePath = await findSessionById(sessionId, agent);
        if (!filePath) return notFound("session not found");
        const format = (url.searchParams.get("format") ?? "markdown") as "markdown" | "plain" | "json";
        const transcript = await computeTranscript(filePath, agent, sessionId, {
          postCompactionOnly: url.searchParams.get("postCompactionOnly") === "true",
        });
        const text = formatUserMessages(transcript, format);
        if (format !== "json") {
          return new Response(text, {
            headers: {
              "content-type": format === "markdown" ? "text/markdown" : "text/plain",
              "access-control-allow-origin": "*",
            },
          });
        }
        return json(JSON.parse(text));
      }

      const analyzeMatch = path.match(/^\/api\/sessions\/([^/]+)\/analyze$/);
      if (analyzeMatch && req.method === "POST") {
        const agent = requestedAgent(url);
        if (!agent) return badRequest("unsupported agent");
        const sessionId = decodePathSegment(analyzeMatch[1]!);
        const filePath = await findSessionById(sessionId, agent);
        if (!filePath) return notFound("session not found");
        const body = await readJsonBody(req);
        const type = (body.type as AnalyzeType) ?? "summarize";
        const transcript = await computeTranscript(filePath, agent, sessionId);
        const meta = await findSessionMeta(sessionId, agent);
        const result = await runAnalysis(transcript, {
          type,
          provider: body.provider as LlmProviderKind | undefined,
          model: body.model as string | undefined,
          locale: (body.locale as "ar" | "en") ?? "en",
          force: body.force === true,
          transcriptMtimeMs: meta?.mtimeMs,
          projectSlug: meta?.project,
          projectPath: meta?.projectPath,
        });
        return json(result);
      }

      const analysesListMatch = path.match(/^\/api\/sessions\/([^/]+)\/analyses$/);
      if (analysesListMatch && req.method === "GET") {
        const agent = requestedAgent(url);
        if (!agent) return badRequest("unsupported agent");
        const sessionId = decodePathSegment(analysesListMatch[1]!);
        const analyses = await listSessionAnalyses(agent, sessionId);
        return json({ analyses });
      }

      const analysisGetMatch = path.match(/^\/api\/sessions\/([^/]+)\/analyses\/([^/]+)$/);
      if (analysisGetMatch && req.method === "GET") {
        const agent = requestedAgent(url);
        if (!agent) return badRequest("unsupported agent");
        const sessionId = decodePathSegment(analysisGetMatch[1]!);
        const analysisId = decodePathSegment(analysisGetMatch[2]!);
        const result = await getSessionAnalysis(agent, sessionId, analysisId);
        if (!result) return notFound("analysis not found");
        return json(result);
      }

      const improvementsListMatch = path.match(/^\/api\/sessions\/([^/]+)\/prompt-improvements$/);
      if (improvementsListMatch && req.method === "GET") {
        const agent = requestedAgent(url);
        if (!agent) return badRequest("unsupported agent");
        const sessionId = decodePathSegment(improvementsListMatch[1]!);
        const improvements = await listPromptImprovements(agent, sessionId);
        return json({ improvements });
      }

      const improveMatch = path.match(/^\/api\/sessions\/([^/]+)\/messages\/([^/]+)\/improve-prompt$/);
      if (improveMatch && req.method === "POST") {
        const agent = requestedAgent(url);
        if (!agent) return badRequest("unsupported agent");
        const sessionId = decodePathSegment(improveMatch[1]!);
        const messageId = decodeURIComponent(improveMatch[2]!);
        const filePath = await findSessionById(sessionId, agent);
        if (!filePath) return notFound("session not found");
        const body = await readJsonBody(req);
        const transcript = await computeTranscript(filePath, agent, sessionId);
        const result = await improveUserPrompt(transcript, messageId, {
          provider: body.provider as LlmProviderKind | undefined,
          model: body.model as string | undefined,
          locale: (body.locale as "ar" | "en") ?? "en",
          force: body.force === true,
        });
        return json(result);
      }

      const artifactsMatch = path.match(/^\/api\/sessions\/([^/]+)\/generate-artifacts$/);
      if (artifactsMatch && req.method === "POST") {
        const agent = requestedAgent(url);
        if (!agent) return badRequest("unsupported agent");
        const sessionId = decodePathSegment(artifactsMatch[1]!);
        const filePath = await findSessionById(sessionId, agent);
        if (!filePath) return notFound("session not found");
        const body = await readJsonBody(req);
        const transcript = await computeTranscript(filePath, agent, sessionId);
        const artifacts = await generateArtifacts(transcript, {
          useLlm: body.useLlm !== false,
          provider: body.provider as LlmProviderKind | undefined,
          model: body.model as string | undefined,
          locale: (body.locale as "ar" | "en") ?? "en",
          agent,
        });
        return json({ artifacts });
      }

      const sessionInsightsMatch = path.match(/^\/api\/sessions\/([^/]+)\/insights$/);
      if (sessionInsightsMatch && req.method === "GET") {
        const agent = requestedAgent(url);
        if (!agent) return badRequest("unsupported agent");
        const sessionId = decodePathSegment(sessionInsightsMatch[1]!);
        const filePath = await findSessionById(sessionId, agent);
        if (!filePath) return notFound("session not found");
        const transcript = await computeTranscript(filePath, agent, sessionId);
        return json({ patterns: detectSessionPatterns(transcript) });
      }

      if (path === "/api/insights/recurring" && req.method === "GET") {
        const agent = requestedAgent(url);
        if (!agent) return badRequest("unsupported agent");
        const project = url.searchParams.get("project");
        if (!project) return badRequest("project required");
        const limit = Number(url.searchParams.get("limit") ?? 20);
        const refresh = url.searchParams.get("refresh") === "true";
        const patterns = await getProjectInsights(agent, project, { limit, refresh });
        return json({ patterns });
      }

      if (path === "/api/artifacts/write" && req.method === "POST") {
        const body = await readJsonBody(req);
        const targetPath = body.path as string;
        const content = body.content as string;
        const projectRoot = body.projectRoot as string | undefined;
        const action = body.action as "create" | "update" | "append" | undefined;
        if (!targetPath || !content) return badRequest("path and content required");
        if (action && action !== "create") {
          const { writeWithMerge } = await import("./artifacts/write.ts");
          const result = await writeWithMerge({
            targetPath,
            content,
            action,
            projectRoot,
          });
          return json({ ok: true, path: result.path, merged: true });
        }
        const result = await writeArtifactFile(targetPath, content, { projectRoot });
        return json({ ok: true, path: result.path });
      }

      if (path === "/api/artifacts/apply-pack" && req.method === "POST") {
        const body = await readJsonBody(req);
        const items = body.items as Array<{
          path: string;
          content: string;
          action?: "create" | "update" | "append";
          selected?: boolean;
        }>;
        const projectRoot = body.projectRoot as string | undefined;
        if (!Array.isArray(items)) return badRequest("items array required");
        const results = await applyArtifactPack(items, projectRoot);
        return json({ results });
      }

      const projectDashboardMatch = path.match(/^\/api\/projects\/([^/]+)\/dashboard$/);
      if (projectDashboardMatch && req.method === "GET") {
        const agent = requestedAgent(url);
        if (!agent) return badRequest("unsupported agent");
        const projectSlug = decodeURIComponent(projectDashboardMatch[1]!);
        const cwd = url.searchParams.get("cwd") ?? undefined;
        const sessions = await listSessions(projectSlug, agent);
        const [context, patterns, schedule] = await Promise.all([
          loadProjectContext({ agent, projectSlug, cwd: cwd ?? sessions[0]?.projectPath }),
          getProjectInsights(agent, projectSlug, { limit: 30 }),
          getGovernanceSchedule(agent, projectSlug),
        ]);
        const eligibility = isGovernanceEligible(schedule, sessions.length);
        return json({
          context: toProjectContextSummary(context),
          patterns,
          sessions: sessions.slice(0, 20).map((s) => ({
            id: s.id,
            title: s.title,
            mtimeMs: s.mtimeMs,
            realTotal: s.realTotal,
            hasCompaction: s.hasCompaction,
          })),
          schedule,
          eligibility,
        });
      }

      const governEligibleMatch = path.match(/^\/api\/projects\/([^/]+)\/govern\/eligible$/);
      if (governEligibleMatch && req.method === "GET") {
        const agent = requestedAgent(url);
        if (!agent) return badRequest("unsupported agent");
        const projectSlug = decodeURIComponent(governEligibleMatch[1]!);
        const sessions = await listSessions(projectSlug, agent);
        const schedule = await getGovernanceSchedule(agent, projectSlug);
        return json({ ...isGovernanceEligible(schedule, sessions.length), schedule, sessionCount: sessions.length });
      }

      const projectContextSummaryMatch = path.match(/^\/api\/projects\/([^/]+)\/context\/summary$/);
      if (projectContextSummaryMatch && req.method === "GET") {
        const agent = requestedAgent(url);
        if (!agent) return badRequest("unsupported agent");
        const projectSlug = decodeURIComponent(projectContextSummaryMatch[1]!);
        const cwd = url.searchParams.get("cwd") ?? undefined;
        const snapshot = await loadProjectContext({ agent, projectSlug, cwd });
        return json(toProjectContextSummary(snapshot));
      }

      const projectContextMatch = path.match(/^\/api\/projects\/([^/]+)\/context$/);
      if (projectContextMatch && req.method === "GET") {
        const agent = requestedAgent(url);
        if (!agent) return badRequest("unsupported agent");
        const projectSlug = decodeURIComponent(projectContextMatch[1]!);
        const cwd = url.searchParams.get("cwd") ?? undefined;
        const snapshot = await loadProjectContext({ agent, projectSlug, cwd });
        return json({
          projectRoot: snapshot.projectRoot,
          verified: snapshot.verified,
          source: snapshot.source,
          warning: snapshot.warning,
          inventoryHash: snapshot.inventoryHash,
          files: snapshot.files.map((f) => ({
            relativePath: f.relativePath,
            sizeBytes: f.sizeBytes,
            hash: f.hash,
            truncated: f.truncated,
            content: f.content,
          })),
        });
      }

      const sessionGovernMatch = path.match(/^\/api\/sessions\/([^/]+)\/govern$/);
      if (sessionGovernMatch && req.method === "POST") {
        const agent = requestedAgent(url);
        if (!agent) return badRequest("unsupported agent");
        const sessionId = decodePathSegment(sessionGovernMatch[1]!);
        const body = await readJsonBody(req);
        const result = await runSessionGovernancePipeline({
          agent,
          sessionId,
          provider: body.provider as LlmProviderKind | undefined,
          model: body.model as string | undefined,
          locale: (body.locale as "ar" | "en") ?? "en",
          force: body.force !== false,
          mode: (body.mode as "quick" | "standard" | "full") ?? "standard",
          autoApply: body.autoApply === true || process.env.GOVERNANCE_AUTO_APPLY === "1",
        });
        return json(result);
      }

      const projectGovernMatch = path.match(/^\/api\/projects\/([^/]+)\/govern$/);
      if (projectGovernMatch && req.method === "POST") {
        const agent = requestedAgent(url);
        if (!agent) return badRequest("unsupported agent");
        const projectSlug = decodeURIComponent(projectGovernMatch[1]!);
        const body = await readJsonBody(req);
        const result = await runProjectGovernancePipeline({
          agent,
          projectSlug,
          provider: body.provider as LlmProviderKind | undefined,
          model: body.model as string | undefined,
          locale: (body.locale as "ar" | "en") ?? "en",
          force: body.force !== false,
          mode: (body.mode as "quick" | "standard" | "full") ?? "standard",
          autoApply: body.autoApply === true || process.env.GOVERNANCE_AUTO_APPLY === "1",
        });
        return json(result);
      }

      const governanceHistoryMatch = path.match(/^\/api\/projects\/([^/]+)\/governance\/history$/);
      if (governanceHistoryMatch && req.method === "GET") {
        const agent = requestedAgent(url);
        if (!agent) return badRequest("unsupported agent");
        const projectSlug = decodeURIComponent(governanceHistoryMatch[1]!);
        const sessionId = url.searchParams.get("sessionId") ?? undefined;
        const limit = Number(url.searchParams.get("limit") ?? 20);
        const items = await listGovernancePipelines({
          agent,
          projectSlug,
          sessionId,
          limit: Number.isFinite(limit) ? limit : 20,
        });
        return json({ items });
      }

      const governanceGetMatch = path.match(/^\/api\/governance\/([^/]+)$/);
      if (governanceGetMatch && req.method === "GET") {
        const pipelineId = governanceGetMatch[1]!;
        const result = await getGovernancePipeline(pipelineId);
        if (!result) return notFound("pipeline not found");
        return json(result);
      }

      const governanceCancelMatch = path.match(/^\/api\/governance\/([^/]+)\/cancel$/);
      if (governanceCancelMatch && req.method === "POST") {
        const pipelineId = governanceCancelMatch[1]!;
        const result = await cancelGovernancePipeline(pipelineId);
        if (!result) return notFound("pipeline not found");
        return json(result);
      }

      const governanceResumeMatch = path.match(/^\/api\/governance\/([^/]+)\/resume$/);
      if (governanceResumeMatch && req.method === "POST") {
        const pipelineId = governanceResumeMatch[1]!;
        const result = await resumeGovernancePipeline(pipelineId);
        if (!result) return notFound("pipeline not found");
        return json(result);
      }

      const playbookMatch = path.match(/^\/api\/projects\/([^/]+)\/playbook$/);
      if (playbookMatch && req.method === "GET") {
        const agent = requestedAgent(url);
        if (!agent) return badRequest("unsupported agent");
        const projectSlug = decodeURIComponent(playbookMatch[1]!);
        const format = url.searchParams.get("format") ?? "md";
        const pipelineId = url.searchParams.get("pipelineId");
        const refresh = url.searchParams.get("refresh") === "true";

        let govern: Awaited<ReturnType<typeof getGovernancePipeline>> | Awaited<
          ReturnType<typeof runProjectGovernancePipeline>
        >;

        if (pipelineId && !refresh) {
          govern = await getGovernancePipeline(pipelineId);
          if (!govern || govern.projectSlug !== projectSlug) {
            return notFound("pipeline not found for this project");
          }
        } else {
          govern = await runProjectGovernancePipeline({
            agent,
            projectSlug,
            locale: (url.searchParams.get("locale") as "ar" | "en") ?? "en",
            force: refresh,
          });
        }

        const save = url.searchParams.get("save") === "true";
        let savedPath: string | undefined;
        if (save && govern.projectRoot && govern.playbookMarkdown) {
          savedPath = await exportPlaybookToProject(govern.projectRoot, govern.playbookMarkdown);
        }
        if (format === "json") return json({ ...govern, savedPath });
        return new Response(govern.playbookMarkdown ?? "", {
          headers: {
            "content-type": "text/markdown",
            "access-control-allow-origin": "*",
          },
        });
      }

      const snapshotMatch = path.match(/^\/api\/sessions\/([^/]+)\/snapshot$/);
      if (snapshotMatch && req.method === "GET") {
        const agent = requestedAgent(url);
        if (!agent) return badRequest("unsupported agent");
        const sessionId = decodePathSegment(snapshotMatch[1]!);
        const filePath = await findSessionById(sessionId, agent);
        if (!filePath) return notFound("session not found");
        const mtimeMs = await resolveSessionSourceMtimeMs(filePath, agent);
        const cached = await readCached(agent, sessionId, mtimeMs);
        if (cached) return json({ ...cached, fromCache: true });
        const snap = await computeSnapshot(filePath, mtimeMs, agent);
        await writeCached(snap);
        return json({ ...snap, fromCache: false });
      }

      const invalidateMatch = path.match(/^\/api\/sessions\/([^/]+)\/invalidate-cache$/);
      if (invalidateMatch && req.method === "POST") {
        const agent = requestedAgent(url);
        if (!agent) return badRequest("unsupported agent");
        const sessionId = decodePathSegment(invalidateMatch[1]!);
        const ok = await invalidateCache(agent, sessionId);
        return json({ ok });
      }

      return notFound();
    } catch (e: unknown) {
      console.error("[server]", e);
      const msg = e instanceof Error ? e.message : String(e);
      return json({ error: msg }, { status: 500 });
    }
  },
});

console.log(`[visualizer] backend on http://localhost:${server.port}`);
