import { stat } from "node:fs/promises";
import { listProjects, listSessions, findSessionById } from "./indexer.ts";
import { computeSnapshot } from "./snapshot.ts";
import { readCached, writeCached, invalidateCache } from "./cache.ts";
import { isAgentKind } from "./paths.ts";
import { computeTranscript, formatUserMessages } from "./transcript.ts";
import { getPublicLlmConfig, ANALYSIS_TYPES } from "./config.ts";
import {
  getLlmSettingsView,
  updateLlmSettings,
  type LlmSettingsPatch,
} from "./llm-config-store.ts";
import { testLlmConnection } from "./llm/test-connection.ts";
import { runAnalysis, listSessionAnalyses, getSessionAnalysis } from "./analysis.ts";
import { improveUserPrompt, listPromptImprovements } from "./prompt-improvement.ts";
import { generateArtifacts } from "./artifacts/generator.ts";
import { detectSessionPatterns, writeArtifactFile } from "./insights/pattern-detector.ts";
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

const server = Bun.serve({
  port: PORT,
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

      if (path === "/api/config/llm/settings" && req.method === "GET") {
        return json(getLlmSettingsView());
      }

      if (path === "/api/config/llm/settings" && req.method === "PUT") {
        const body = await readJsonBody(req);
        const view = updateLlmSettings(body as LlmSettingsPatch);
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
        const sessionId = transcriptMatch[1]!;
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
        const sessionId = userMessagesMatch[1]!;
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
        const sessionId = analyzeMatch[1]!;
        const filePath = await findSessionById(sessionId, agent);
        if (!filePath) return notFound("session not found");
        const body = await readJsonBody(req);
        const type = (body.type as AnalyzeType) ?? "summarize";
        const transcript = await computeTranscript(filePath, agent, sessionId);
        const result = await runAnalysis(transcript, {
          type,
          provider: body.provider as LlmProviderKind | undefined,
          model: body.model as string | undefined,
          locale: (body.locale as "ar" | "en") ?? "en",
          force: body.force === true,
        });
        return json(result);
      }

      const analysesListMatch = path.match(/^\/api\/sessions\/([^/]+)\/analyses$/);
      if (analysesListMatch && req.method === "GET") {
        const agent = requestedAgent(url);
        if (!agent) return badRequest("unsupported agent");
        const sessionId = analysesListMatch[1]!;
        const analyses = await listSessionAnalyses(agent, sessionId);
        return json({ analyses });
      }

      const analysisGetMatch = path.match(/^\/api\/sessions\/([^/]+)\/analyses\/([^/]+)$/);
      if (analysisGetMatch && req.method === "GET") {
        const agent = requestedAgent(url);
        if (!agent) return badRequest("unsupported agent");
        const sessionId = analysisGetMatch[1]!;
        const analysisId = analysisGetMatch[2]!;
        const result = await getSessionAnalysis(agent, sessionId, analysisId);
        if (!result) return notFound("analysis not found");
        return json(result);
      }

      const improvementsListMatch = path.match(/^\/api\/sessions\/([^/]+)\/prompt-improvements$/);
      if (improvementsListMatch && req.method === "GET") {
        const agent = requestedAgent(url);
        if (!agent) return badRequest("unsupported agent");
        const sessionId = improvementsListMatch[1]!;
        const improvements = await listPromptImprovements(agent, sessionId);
        return json({ improvements });
      }

      const improveMatch = path.match(/^\/api\/sessions\/([^/]+)\/messages\/([^/]+)\/improve-prompt$/);
      if (improveMatch && req.method === "POST") {
        const agent = requestedAgent(url);
        if (!agent) return badRequest("unsupported agent");
        const sessionId = improveMatch[1]!;
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
        const sessionId = artifactsMatch[1]!;
        const filePath = await findSessionById(sessionId, agent);
        if (!filePath) return notFound("session not found");
        const body = await readJsonBody(req);
        const transcript = await computeTranscript(filePath, agent, sessionId);
        const artifacts = await generateArtifacts(transcript, {
          useLlm: body.useLlm !== false,
          provider: body.provider as LlmProviderKind | undefined,
          model: body.model as string | undefined,
          locale: (body.locale as "ar" | "en") ?? "en",
        });
        return json({ artifacts });
      }

      const sessionInsightsMatch = path.match(/^\/api\/sessions\/([^/]+)\/insights$/);
      if (sessionInsightsMatch && req.method === "GET") {
        const agent = requestedAgent(url);
        if (!agent) return badRequest("unsupported agent");
        const sessionId = sessionInsightsMatch[1]!;
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
        if (!targetPath || !content) return badRequest("path and content required");
        await writeArtifactFile(targetPath, content);
        return json({ ok: true, path: targetPath });
      }

      const snapshotMatch = path.match(/^\/api\/sessions\/([^/]+)\/snapshot$/);
      if (snapshotMatch && req.method === "GET") {
        const agent = requestedAgent(url);
        if (!agent) return badRequest("unsupported agent");
        const sessionId = snapshotMatch[1]!;
        const filePath = await findSessionById(sessionId, agent);
        if (!filePath) return notFound("session not found");
        const st = await stat(filePath);
        const cached = await readCached(agent, sessionId, st.mtimeMs);
        if (cached) return json({ ...cached, fromCache: true });
        const snap = await computeSnapshot(filePath, st.mtimeMs, agent);
        await writeCached(snap);
        return json({ ...snap, fromCache: false });
      }

      const invalidateMatch = path.match(/^\/api\/sessions\/([^/]+)\/invalidate-cache$/);
      if (invalidateMatch && req.method === "POST") {
        const agent = requestedAgent(url);
        if (!agent) return badRequest("unsupported agent");
        const sessionId = invalidateMatch[1]!;
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
