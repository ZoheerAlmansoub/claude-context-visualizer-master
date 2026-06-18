import { mkdir, readFile, writeFile, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { CACHE_DIR } from "./paths.ts";
import { SNAPSHOT_SCHEMA_VERSION, type AgentKind, type Snapshot } from "./types.ts";

async function ensureCacheDir(agent: AgentKind) {
  await mkdir(join(CACHE_DIR, agent), { recursive: true });
}

function cachePath(agent: AgentKind, sessionId: string) {
  return join(CACHE_DIR, agent, `${sessionId}.json`);
}

export async function readCached(
  agent: AgentKind,
  sessionId: string,
  sourceMtimeMs: number,
): Promise<Snapshot | null> {
  try {
    const p = cachePath(agent, sessionId);
    const buf = await readFile(p, "utf8");
    const snap = JSON.parse(buf) as Snapshot;
    if (snap.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) return null;
    if (snap.agent !== agent) return null;
    if (Math.abs(snap.mtimeMs - sourceMtimeMs) < 1) return snap;
    return null;
  } catch {
    return null;
  }
}

export async function writeCached(snap: Snapshot): Promise<void> {
  await ensureCacheDir(snap.agent);
  await writeFile(cachePath(snap.agent, snap.sessionId), JSON.stringify(snap));
}

export async function invalidateCache(agent: AgentKind, sessionId: string): Promise<boolean> {
  try {
    await unlink(cachePath(agent, sessionId));
    return true;
  } catch {
    return false;
  }
}
