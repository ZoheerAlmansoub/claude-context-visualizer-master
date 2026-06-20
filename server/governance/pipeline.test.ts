import { describe, expect, test } from "bun:test";
import { findSessionMeta } from "../indexer.ts";
import { computeTranscript } from "../transcript.ts";

describe("governance pipeline transcript loading", () => {
  test("computeTranscript must be awaited before runAnalysis (not passed as Promise)", async () => {
    const sessionId = "f849552f-73c1-4ad6-b1bc-bda17fc2fa0c";
    const agent = "cursor" as const;
    const meta = await findSessionMeta(sessionId, agent);
    if (!meta) return;

    const buggyTranscript = computeTranscript(meta.filePath, agent, sessionId);
    expect(buggyTranscript).toBeInstanceOf(Promise);
    expect((buggyTranscript as Promise<unknown>).then).toBeDefined();

    const fixedTranscript = await computeTranscript(meta.filePath, agent, sessionId);
    expect(fixedTranscript.agent).toBe(agent);
    expect(fixedTranscript.sessionId).toBe(sessionId);
    expect(fixedTranscript.filePath).toBe(meta.filePath);
  });
});
