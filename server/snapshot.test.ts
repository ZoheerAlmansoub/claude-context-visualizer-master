import { describe, expect, test } from "bun:test";
import { normalizePiRecords, normalizeRecordsForAgent, type NormalizedRecord } from "./record-normalize.ts";
import { computeSnapshot } from "./snapshot.ts";
import { realTotalFromUsage } from "./usage.ts";

describe("record normalization", () => {
  test("Pi compaction maps to compact_boundary", () => {
    const out = normalizePiRecords([
      { type: "compaction", tokensBefore: 12000, fromHook: true },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.type).toBe("system");
    expect(out[0]?.subtype).toBe("compact_boundary");
    expect(out[0]?.compactMetadata?.preTokens).toBe(12000);
  });

  test("Pi assistant usage is normalized for snapshot", () => {
    const out = normalizePiRecords([
      {
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "hello" }],
          usage: { input: 10, cacheWrite: 20, cacheRead: 30, output: 5 },
          model: "test-model",
        },
      },
    ]);
    expect(out[0]?.type).toBe("assistant");
    expect(realTotalFromUsage(out[0]?.message?.usage)).toBe(60);
  });

  test("Claude records pass through unchanged", () => {
    const raw = [{ type: "user", message: { content: [{ type: "text", text: "hi" }] } }];
    const out = normalizeRecordsForAgent("claude", raw);
    expect(out).toEqual(raw);
  });
});

describe("computeSnapshot", () => {
  test("estimates Cursor snapshot when usage is missing", async () => {
    const records: NormalizedRecord[] = [
      {
        role: "user",
        message: { content: [{ type: "text", text: "<user_query>Build feature X</user_query>" }] },
      },
      {
        role: "assistant",
        message: {
          content: [{ type: "text", text: "I'll help you build feature X with tests." }],
          usage: null,
          model: "cursor",
        },
      },
    ];
    // Write temp jsonl
    const { writeFile, mkdtemp, rm } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const dir = await mkdtemp(join(tmpdir(), "snap-"));
    const file = join(dir, "test-session.jsonl");
    try {
      await writeFile(
        file,
        records.map((r) => JSON.stringify(r)).join("\n"),
        "utf8",
      );
      const snap = await computeSnapshot(file, undefined, "cursor");
      expect(snap.headline.realTotal).toBeGreaterThan(0);
      expect(snap.buckets.length).toBeGreaterThan(0);
      expect(snap.warnings.some((w) => w.includes("estimated"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
