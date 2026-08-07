import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { computeTranscript } from "../transcript.ts";

const FIXTURE = join(import.meta.dir, "../fixtures/antigravity/transcript-minimal.jsonl");

describe("governance pipeline transcript loading", () => {
  test("computeTranscript must be awaited before runAnalysis (not passed as Promise)", async () => {
    const sessionId = "fixture-minimal";
    const agent = "antigravity" as const;

    const buggyTranscript = computeTranscript(FIXTURE, agent, sessionId);
    expect(buggyTranscript).toBeInstanceOf(Promise);
    expect((buggyTranscript as Promise<unknown>).then).toBeDefined();

    const fixedTranscript = await computeTranscript(FIXTURE, agent, sessionId);
    expect(fixedTranscript.agent).toBe(agent);
    expect(fixedTranscript.sessionId).toBe(sessionId);
    expect(fixedTranscript.filePath).toBe(FIXTURE);
  });
});
