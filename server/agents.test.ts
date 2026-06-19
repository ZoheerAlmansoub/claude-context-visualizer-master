import { describe, expect, test } from "bun:test";
import { decodeCursorProjectSlug, decodePiProjectSlug, getAgentConfig, isAgentKind } from "./paths.ts";
import { realTotalFromUsage } from "./usage.ts";
import { extractUserQuery, extractTitle, stripXmlTags } from "./text-utils.ts";
import { normalizeCursorRecords, normalizePiRecords } from "./record-normalize.ts";
import { recordsToTranscript } from "./normalizers/transcript-parser.ts";
import { detectSessionPatterns } from "./insights/pattern-detector.ts";
import type { SessionTranscript } from "./types.ts";

describe("agent registry", () => {
  test("recognizes supported agents", () => {
    expect(isAgentKind("claude")).toBe(true);
    expect(isAgentKind("pi")).toBe(true);
    expect(isAgentKind("cursor")).toBe(true);
    expect(isAgentKind("opencode")).toBe(true);
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

  test("decodes Pi project slugs to readable Windows paths", () => {
    expect(decodePiProjectSlug("--D--dev-ERP-SAP--")).toBe("D:\\dev\\ERP-SAP");
    expect(decodePiProjectSlug("--C--Users-Eng.Zoheer--")).toBe("C:\\Users\\Eng.Zoheer");
  });

  test("decodes Cursor project slugs", () => {
    expect(decodeCursorProjectSlug("d-dev-ERP-SAP")).toBe("D:/dev/ERP-SAP");
    expect(decodeCursorProjectSlug("d-dev-agent-session-intelligence")).toBe(
      "D:/dev/agent-session-intelligence",
    );
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

describe("text utils", () => {
  test("extracts user_query from Cursor messages", () => {
    const raw = "<timestamp>Thu</timestamp>\n<user_query>Hello world</user_query>";
    expect(extractUserQuery(raw)).toBe("Hello world");
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
