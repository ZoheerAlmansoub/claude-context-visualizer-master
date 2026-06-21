import type { AgentKind } from "./types.ts";
import { readCached, writeCached } from "./cache.ts";
import { computeSnapshot } from "./snapshot.ts";

/**
 * Resolve input-context token total for session list rows.
 * Priority: API usage from JSONL → snapshot cache → full computeSnapshot (same as Detail view).
 */
export async function resolveSessionRealTotal(opts: {
  agent: AgentKind;
  sessionId: string;
  filePath: string;
  mtimeMs: number;
  usageRealTotal: number | null;
}): Promise<number | null> {
  if (opts.usageRealTotal != null && opts.usageRealTotal > 0) {
    return opts.usageRealTotal;
  }

  try {
    const cached = await readCached(opts.agent, opts.sessionId, opts.mtimeMs);
    if (cached && cached.headline.realTotal > 0) {
      return cached.headline.realTotal;
    }
  } catch {
    // fall through to compute
  }

  try {
    const snap = await computeSnapshot(opts.filePath, opts.mtimeMs, opts.agent);
    if (snap.headline.realTotal > 0) {
      await writeCached(snap);
      return snap.headline.realTotal;
    }
  } catch {
    return opts.usageRealTotal;
  }

  return opts.usageRealTotal;
}
