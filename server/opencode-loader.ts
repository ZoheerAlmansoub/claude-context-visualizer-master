import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentConfig } from "./paths.ts";

export type OpenCodeLoadResult =
  | { ok: true; records: unknown[] }
  | { ok: false; reason: string };

export async function hasOpenCodeMessages(): Promise<boolean> {
  const storageDir = getAgentConfig("opencode").sessionsDir;
  try {
    const entries = await readdir(storageDir);
    return entries.includes("message") && entries.includes("part");
  } catch {
    return false;
  }
}

export async function loadOpenCodeRecords(_filePath: string): Promise<OpenCodeLoadResult> {
  const storageDir = getAgentConfig("opencode").sessionsDir;
  const messageDir = join(storageDir, "message");
  const partDir = join(storageDir, "part");

  try {
    await readdir(messageDir);
    await readdir(partDir);
  } catch {
    return {
      ok: false,
      reason:
        "OpenCode storage has no message/part directories. Only session_diff patches are available.",
    };
  }

  // OpenCode stores messages and parts as separate JSON files keyed by ID.
  // Full session reconstruction requires joining by sessionID — deferred until
  // a specific session file path mapping is established.
  return {
    ok: false,
    reason:
      "OpenCode message/part storage detected but session-to-file mapping is not yet implemented. Use Claude, Pi, or Cursor agents.",
  };
}

export async function opencodeProjectStatus(): Promise<{ available: boolean; reason?: string }> {
  const hasMessages = await hasOpenCodeMessages();
  if (hasMessages) {
    return {
      available: false,
      reason: "OpenCode message storage detected; full transcript adapter coming soon.",
    };
  }
  return {
    available: false,
    reason:
      "This OpenCode storage currently contains session_diff patch files, not full transcript data.",
  };
}
