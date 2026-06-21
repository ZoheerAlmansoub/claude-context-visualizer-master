import { describe, expect, test } from "bun:test";
import { decodeCursorProjectSlug, decodePiProjectSlug, encodeWorkspaceSlug, getAgentConfig, isAgentKind } from "./paths.ts";
import { realTotalFromUsage } from "./usage.ts";
import { extractUserQuery, extractTitle, stripXmlTags } from "./text-utils.ts";
import { normalizeCursorRecords, normalizePiRecords, normalizeAntigravityRecords } from "./record-normalize.ts";
import { recordsToTranscript } from "./normalizers/transcript-parser.ts";
import { detectSessionPatterns } from "./insights/pattern-detector.ts";
import type { SessionTranscript } from "./types.ts";

describe("agent registry", () => {
  test("recognizes supported agents", () => {
    expect(isAgentKind("claude")).toBe(true);
    expect(isAgentKind("pi")).toBe(true);
    expect(isAgentKind("cursor")).toBe(true);
    expect(isAgentKind("opencode")).toBe(true);
    expect(isAgentKind("antigravity")).toBe(true);
    expect(isAgentKind("other")).toBe(false);
  });

  test("uses the discovered Pi sessions directory", () => {
    expect(getAgentConfig("pi").sessionsDir).toContain(".pi");
    expect(getAgentConfig("pi").sessionsDir).toContain("agent");
    expect(getAgentConfig("pi").sessionsDir).toContain("sessions");
  });

  test("uses Cursor projects directory", () => {
    expect(getAgentConfig("cursor").sessionsDir).toContain(".cursor");
    expect(getAgentConfig("cursor").sessionsDir).toContain("projects");
  });

  test("uses OpenCode storage directory", () => {
    expect(getAgentConfig("opencode").sessionsDir).toContain("opencode");
    expect(getAgentConfig("opencode").sessionsDir).toContain("storage");
  });

  test("uses Antigravity brain directory", () => {
    expect(getAgentConfig("antigravity").sessionsDir).toContain("antigravity-ide");
    expect(getAgentConfig("antigravity").sessionsDir).toContain("brain");
  });

  test("decodes Pi project slugs to readable Windows paths", () => {
    expect(decodePiProjectSlug("--D--dev-ERP-SAP--")).toBe("D:\\dev\\ERP-SAP");
    expect(decodePiProjectSlug("--C--Users-Eng.Zoheer--")).toBe("C:\\Users\\Eng.Zoheer");
  });

  test("decodes Cursor project slugs", () => {
    expect(decodeCursorProjectSlug("d-dev-ERP-SAP")).toBe("D:/dev/ERP-SAP");
    expect(decodeCursorProjectSlug("d-dev-claude-context-visualizer-master")).toBe(
      "D:/dev/claude-context-visualizer-master",
    );
  });

  test("encodes workspace paths to slugs", () => {
    expect(encodeWorkspaceSlug("D:\\dev\\sample-app")).toBe("d-dev-sample-app");
  });
});

describe("usage totals", () => {
  test("computes Claude input-context totals", () => {
    expect(
      realTotalFromUsage({
        input_tokens: 10,
        cache_creation_input_tokens: 20,
        cache_read_input_tokens: 30,
        output_tokens: 999,
      }),
    ).toBe(60);
  });

  test("computes Pi input-context totals", () => {
    expect(
      realTotalFromUsage({
        input: 10,
        cacheWrite: 20,
        cacheRead: 30,
        output: 999,
      }),
    ).toBe(60);
  });
});

describe("antigravity normalizer smoke", () => {
  test("normalizes planner response with tool calls", () => {
    const records = normalizeAntigravityRecords([
      {
        type: "USER_INPUT",
        content: "<USER_REQUEST>Hello</USER_REQUEST>",
        step_index: 0,
      },
      {
        type: "PLANNER_RESPONSE",
        content: "OK",
        step_index: 1,
        tool_calls: [{ name: "list_dir", args: { DirectoryPath: '"d:\\\\dev"' } }],
      },
      { type: "LIST_DIRECTORY", content: "files", step_index: 2, status: "DONE" },
    ]);
    expect(records.filter((r) => r.type === "user")).toHaveLength(2);
    expect(records.filter((r) => r.type === "assistant")).toHaveLength(1);
  });

  test("links CODE_ACTION and GENERIC steps as tool results", () => {
    const records = normalizeAntigravityRecords([
      {
        type: "PLANNER_RESPONSE",
        step_index: 1,
        tool_calls: [
          { name: "replace_file_content", args: {} },
          { name: "manage_task", args: {} },
        ],
      },
      { type: "GENERIC", content: "running", step_index: 2, status: "RUNNING" },
      { type: "CODE_ACTION", content: "patched", step_index: 3, status: "DONE" },
      { type: "GENERIC", content: "task done", step_index: 4, status: "DONE" },
    ]);
    const toolResults = records.flatMap((r) => {
      const content = (r.message as { content?: unknown[] } | undefined)?.content;
      return Array.isArray(content)
        ? content.filter((b) => (b as { type?: string }).type === "tool_result")
        : [];
    });
    expect(toolResults).toHaveLength(2);
  });
});

describe("text utils", () => {
  test("extracts user_query from Cursor messages", () => {
    const raw = "<timestamp>Thu</timestamp>\n<user_query>Hello world</user_query>";
    expect(extractUserQuery(raw)).toBe("Hello world");
  });

  test("extracts USER_REQUEST from Antigravity messages", () => {
    const raw = "<USER_REQUEST>Build feature X</USER_REQUEST>\n<ADDITIONAL_METADATA>meta</ADDITIONAL_METADATA>";
    expect(extractUserQuery(raw)).toBe("Build feature X");
  });

  test("stripXmlTags removes tags", () => {
    expect(stripXmlTags("<foo>bar</foo>")).toBe("bar");
  });

  test("extractTitle from user query", () => {
    expect(extractTitle("<user_query>Build feature X</user_query>")).toContain("Build feature X");
  });
});

describe("cursor normalizer", () => {
  test("normalizes cursor role-based records", () => {
    const records = normalizeCursorRecords([
      {
        role: "user",
        message: { content: [{ type: "text", text: "<user_query>Test</user_query>" }] },
      },
      {
        role: "assistant",
        message: {
          content: [{ type: "text", text: "OK" }],
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      },
    ]);
    expect(records).toHaveLength(2);
    expect((records[0] as { type: string }).type).toBe("user");
  });
});

describe("transcript parser", () => {
  test("parses user and assistant turns", () => {
    const records = normalizeCursorRecords([
      {
        role: "user",
        message: { content: [{ type: "text", text: "<user_query>Do something</user_query>" }] },
      },
      {
        role: "assistant",
        message: { content: [{ type: "text", text: "Done" }] },
      },
    ]);
    const { conversation } = recordsToTranscript(records, { agent: "cursor", sessionId: "test" });
    expect(conversation.filter((m) => m.role === "user")).toHaveLength(1);
    expect(conversation[0]?.text).toBe("Do something");
  });

  test("Pi compaction filter hides pre-compaction user messages", () => {
    const records = normalizePiRecords([
      { type: "message", message: { role: "user", content: [{ type: "text", text: "First prompt" }] } },
      { type: "message", message: { role: "assistant", content: [{ type: "text", text: "Working" }], usage: { input: 1, output: 1 } } },
      { type: "compaction", tokensBefore: 1000, fromHook: true },
      { type: "message", message: { role: "user", content: [{ type: "text", text: "After compaction" }] } },
      { type: "message", message: { role: "assistant", content: [{ type: "text", text: "OK" }], usage: { input: 2, output: 1 } } },
    ]);
    const full = recordsToTranscript(records, { agent: "pi", sessionId: "pi-test", postCompactionOnly: false });
    const post = recordsToTranscript(records, { agent: "pi", sessionId: "pi-test", postCompactionOnly: true });
    expect(full.totalUserMessageCount).toBe(2);
    expect(full.conversation.filter((m) => m.role === "user")).toHaveLength(2);
    expect(post.conversation.filter((m) => m.role === "user")).toHaveLength(1);
    expect(post.conversation.find((m) => m.role === "user")?.text).toBe("After compaction");
  });
});

describe("pattern detector", () => {
  test("detects duplicate user intent", () => {
    const transcript: SessionTranscript = {
      agent: "cursor",
      sessionId: "s1",
      filePath: "",
      userMessages: {
        messages: [
          { id: "1", turn: 1, role: "user", text: "Fix the login bug please" },
          { id: "2", turn: 2, role: "user", text: "Fix the login bug please" },
        ],
        aggregatedText: "",
        totalChars: 0,
        totalTokens: 0,
      },
      userMessageStats: { visibleCount: 2, totalCount: 2, postCompactionOnly: false },
      conversation: [],
      toolEvents: [],
      compactionBoundaryIndex: null,
      warnings: [],
    };
    const patterns = detectSessionPatterns(transcript);
    expect(patterns.some((p) => p.kind === "duplicate_user_intent")).toBe(true);
  });

  test("detects repeated tool errors", () => {
    const transcript: SessionTranscript = {
      agent: "claude",
      sessionId: "s1",
      filePath: "",
      userMessages: { messages: [], aggregatedText: "", totalChars: 0, totalTokens: 0 },
      userMessageStats: { visibleCount: 0, totalCount: 0, postCompactionOnly: false },
      conversation: [],
      toolEvents: [
        { id: "t1", turn: 1, toolName: "Bash", toolInput: "x", resultText: "fail", isError: true },
        { id: "t2", turn: 2, toolName: "Bash", toolInput: "y", resultText: "fail", isError: true },
      ],
      compactionBoundaryIndex: null,
      warnings: [],
    };
    const patterns = detectSessionPatterns(transcript);
    expect(patterns.some((p) => p.kind === "repeated_tool_error")).toBe(true);
  });
});
