import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveSessionRealTotal } from "./session-real-total.ts";
import { computeSnapshot } from "./snapshot.ts";
import type { NormalizedRecord } from "./record-normalize.ts";

describe("resolveSessionRealTotal", () => {
  test("estimates Cursor totals when JSONL has no usage (matches snapshot)", async () => {
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
    const dir = await mkdtemp(join(tmpdir(), "session-total-"));
    const file = join(dir, "cursor-session.jsonl");
    try {
      await writeFile(file, records.map((r) => JSON.stringify(r)).join("\n"), "utf8");
      const mtimeMs = Date.now();
      const snap = await computeSnapshot(file, mtimeMs, "cursor");
      const resolved = await resolveSessionRealTotal({
        agent: "cursor",
        sessionId: "cursor-session",
        filePath: file,
        mtimeMs,
        usageRealTotal: null,
      });
      expect(resolved).toBe(snap.headline.realTotal);
      expect(resolved).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("returns usage total immediately when present", async () => {
    const resolved = await resolveSessionRealTotal({
      agent: "claude",
      sessionId: "s1",
      filePath: "/nonexistent.jsonl",
      mtimeMs: 0,
      usageRealTotal: 42_000,
    });
    expect(resolved).toBe(42_000);
  });
});
