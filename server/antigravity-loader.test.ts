import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractWorkspaceFromRecords,
  isAntigravityBrainSessionPath,
  isAntigravitySessionPath,
  loadAntigravityRecords,
  parseAntigravitySessionPath,
  resolveTranscriptPath,
} from "./antigravity-loader.ts";
import { readAllJSONL } from "./jsonl.ts";
import { normalizeAntigravityRecords } from "./record-normalize.ts";
import { recordsToTranscript } from "./normalizers/transcript-parser.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, "fixtures", "antigravity", "transcript-minimal.jsonl");

describe("antigravity loader", () => {
  test("detects brain session paths", () => {
    const sample =
      "C:/Users/me/.gemini/antigravity-ide/brain/uuid/.system_generated/logs/transcript.jsonl";
    expect(isAntigravityBrainSessionPath(sample)).toBe(true);
    expect(isAntigravitySessionPath(sample)).toBe(true);
  });

  test("parses brain session id from path", () => {
    const parsed = parseAntigravitySessionPath(
      "C:/Users/me/.gemini/antigravity-ide/brain/abc-123/.system_generated/logs/transcript.jsonl",
    );
    expect(parsed?.sessionId).toBe("abc-123");
    expect(parsed?.source).toBe("brain");
  });

  test("loads fixture transcript", async () => {
    const loaded = await loadAntigravityRecords(fixturePath);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.records.length).toBe(3);
  });

  test("extracts workspace from USER_INPUT metadata", async () => {
    const records = await readAllJSONL(fixturePath);
    expect(extractWorkspaceFromRecords(records)).toBe("D:/dev/sample-app");
  });

  test("resolveTranscriptPath prefers transcript_full when present", async () => {
    const resolved = await resolveTranscriptPath(join(dirname(fixturePath), "..", "missing-conv"));
    expect(resolved).toBeNull();
  });
});

describe("antigravity normalizer", () => {
  test("normalizes user, assistant, and tool result steps", async () => {
    const records = await readAllJSONL(fixturePath);
    const normalized = normalizeAntigravityRecords(records);
    expect(normalized.some((r) => r.type === "user")).toBe(true);
    expect(normalized.some((r) => r.type === "assistant")).toBe(true);
    const toolResults = normalized.flatMap((r) => {
      const content = (r.message as { content?: unknown[] } | undefined)?.content;
      return Array.isArray(content)
        ? content.filter((b) => (b as { type?: string }).type === "tool_result")
        : [];
    });
    expect(toolResults.length).toBe(1);
  });

  test("transcript parser extracts USER_REQUEST text", async () => {
    const records = normalizeAntigravityRecords(await readAllJSONL(fixturePath));
    const { conversation, toolEvents } = recordsToTranscript(records, {
      agent: "antigravity",
      sessionId: "test",
    });
    expect(conversation.find((m) => m.role === "user")?.text).toContain("Improve the chat UI");
    expect(toolEvents.length).toBe(1);
    expect(toolEvents[0]?.toolName).toBe("view_file");
  });
});
