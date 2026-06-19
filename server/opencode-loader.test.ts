import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  findOpenCodeSessionById,
  indexOpenCodeSession,
  listOpenCodeProjects,
  listOpenCodeSessions,
  loadOpenCodeRecords,
  openCodeSessionPath,
  parseOpenCodeSessionPath,
  resolveSessionSourceMtimeMs,
} from "./opencode-loader.ts";
import { normalizeOpenCodeRecords } from "./record-normalize.ts";
import { recordsToTranscript } from "./normalizers/transcript-parser.ts";
import { computeTranscript } from "./transcript.ts";

const FIXTURE_ROOT = join(import.meta.dir, "fixtures", "opencode", "storage");

describe("OpenCode loader", () => {
  test("parses session ref path", () => {
    const path = openCodeSessionPath("proj-demo", "sess-demo", FIXTURE_ROOT);
    expect(parseOpenCodeSessionPath(path)).toEqual({
      projectId: "proj-demo",
      sessionId: "sess-demo",
    });
  });

  test("lists projects from fixture storage", async () => {
    const projects = await listOpenCodeProjects(FIXTURE_ROOT);
    expect(projects.length).toBe(1);
    expect(projects[0]?.slug).toBe("proj-demo");
    expect(projects[0]?.path).toBe("D:\\dev\\demo-project");
    expect(projects[0]?.sessionCount).toBe(1);
  });

  test("lists sessions for project", async () => {
    const sessions = await listOpenCodeSessions("proj-demo", FIXTURE_ROOT);
    expect(sessions.length).toBe(1);
    expect(sessions[0]?.id).toBe("sess-demo");
    expect(sessions[0]?.title).toContain("authentication");
    expect(sessions[0]?.projectPath).toBe("D:\\dev\\demo-project");
    expect(sessions[0]?.realTotal).toBe(2100);
  });

  test("finds session by id", async () => {
    const path = await findOpenCodeSessionById("sess-demo", FIXTURE_ROOT);
    expect(path).toBe(openCodeSessionPath("proj-demo", "sess-demo", FIXTURE_ROOT));
  });

  test("loads message bundles and normalizes to transcript", async () => {
    const path = openCodeSessionPath("proj-demo", "sess-demo", FIXTURE_ROOT);
    const loaded = await loadOpenCodeRecords(path);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const normalized = normalizeOpenCodeRecords(loaded.records);
    expect(normalized.some((r) => r.type === "user")).toBe(true);
    expect(normalized.some((r) => r.type === "assistant")).toBe(true);

    const assistant = normalized.find((r) => r.type === "assistant");
    const blocks = (assistant?.message?.content ?? []) as Array<Record<string, unknown>>;
    expect(blocks.some((b) => b.type === "tool_use")).toBe(true);

    const toolResultUser = normalized.find((r) => {
      if (r.type !== "user" || !Array.isArray(r.message?.content)) return false;
      return (r.message.content as Array<Record<string, unknown>>).some((b) => b.type === "tool_result");
    });
    expect(toolResultUser).toBeDefined();

    const { conversation } = recordsToTranscript(normalized, {
      agent: "opencode",
      sessionId: "sess-demo",
    });
    expect(conversation.some((m) => m.role === "user")).toBe(true);
  });

  test("indexOpenCodeSession extracts metadata", async () => {
    const path = openCodeSessionPath("proj-demo", "sess-demo", FIXTURE_ROOT);
    const meta = await indexOpenCodeSession(path);
    expect(meta.id).toBe("sess-demo");
    expect(meta.model).toBe("claude-sonnet-4");
    expect(meta.cwd).toBe("D:\\dev\\demo-project");
  });

  test("computeTranscript works for opencode agent", async () => {
    const path = openCodeSessionPath("proj-demo", "sess-demo", FIXTURE_ROOT);
    const transcript = await computeTranscript(path, "opencode", "sess-demo");
    expect(transcript.warnings).toHaveLength(0);
    expect(transcript.userMessages.messages.length).toBeGreaterThan(0);
    expect(transcript.conversation.length).toBeGreaterThan(0);
  });

  test("resolveSessionSourceMtimeMs uses file mtime for fixture sessions", async () => {
    const path = openCodeSessionPath("proj-demo", "sess-demo", FIXTURE_ROOT);
    const mtime = await resolveSessionSourceMtimeMs(path, "opencode");
    expect(mtime).toBeGreaterThan(0);
  });
});
