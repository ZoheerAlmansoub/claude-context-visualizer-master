import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { Database } from "bun:sqlite";

const SESSION_JSON = ".json";

export type OpenCodeMessageBundle = {
  info: Record<string, unknown>;
  parts: Record<string, unknown>[];
};

export function getOpenCodeDataDir(): string {
  return join(homedir(), ".local", "share", "opencode");
}

export function getOpenCodeDbPath(): string {
  return join(getOpenCodeDataDir(), "opencode.db");
}

export function openCodeDbSessionPath(sessionId: string): string {
  return join(getOpenCodeDataDir(), "opencode.db", "session", `${sessionId}${SESSION_JSON}`);
}

export function isOpenCodeDbSessionPath(filePath: string): boolean {
  return filePath.replace(/\\/g, "/").includes("/opencode.db/session/");
}

export function parseOpenCodeDbSessionPath(filePath: string): string | null {
  if (!isOpenCodeDbSessionPath(filePath)) return null;
  return basename(filePath, SESSION_JSON);
}

export async function hasOpenCodeDatabase(): Promise<boolean> {
  try {
    await stat(getOpenCodeDbPath());
    return true;
  } catch {
    return false;
  }
}

function openDb(readonly = true): Database {
  return new Database(getOpenCodeDbPath(), { readonly });
}

type DbSessionRow = {
  id: string;
  project_id: string;
  title: string;
  directory: string;
  time_updated: number;
  time_compacting: number | null;
  model: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  tokens_cache_read: number | null;
  tokens_cache_write: number | null;
};

type DbProjectRow = {
  id: string;
  worktree: string | null;
  name: string | null;
  session_count: number;
  latest_mtime: number;
};

export function listOpenCodeProjectsFromDb(): DbProjectRow[] {
  const db = openDb();
  try {
    return db
      .query(
        `SELECT p.id, p.worktree, p.name,
                COUNT(s.id) AS session_count,
                COALESCE(MAX(s.time_updated), 0) AS latest_mtime
         FROM project p
         LEFT JOIN session s ON s.project_id = p.id
         GROUP BY p.id
         HAVING session_count > 0
         ORDER BY latest_mtime DESC`,
      )
      .all() as DbProjectRow[];
  } finally {
    db.close();
  }
}

export function getOpenCodeSessionCountFromDb(): number {
  const db = openDb();
  try {
    const row = db.query("SELECT COUNT(*) AS c FROM session").get() as { c: number };
    return row.c;
  } finally {
    db.close();
  }
}

export function listOpenCodeSessionsFromDb(projectId: string): DbSessionRow[] {
  const db = openDb();
  try {
    return db
      .query(
        `SELECT id, project_id, title, directory, time_updated, time_compacting, model,
                tokens_input, tokens_output, tokens_cache_read, tokens_cache_write
         FROM session
         WHERE project_id = ?
         ORDER BY time_updated DESC`,
      )
      .all(projectId) as DbSessionRow[];
  } finally {
    db.close();
  }
}

export function findOpenCodeSessionInDb(sessionId: string): DbSessionRow | null {
  const db = openDb();
  try {
    return (
      db
        .query(
          `SELECT id, project_id, title, directory, time_updated, time_compacting, model,
                  tokens_input, tokens_output, tokens_cache_read, tokens_cache_write
           FROM session WHERE id = ?`,
        )
        .get(sessionId) as DbSessionRow | null
    );
  } finally {
    db.close();
  }
}

export function getOpenCodeProjectWorktree(projectId: string): string | null {
  const db = openDb();
  try {
    const row = db.query("SELECT worktree, name FROM project WHERE id = ?").get(projectId) as
      | { worktree: string | null; name: string | null }
      | null;
    if (!row) return null;
    return row.worktree?.trim() || row.name?.trim() || null;
  } finally {
    db.close();
  }
}

export function loadOpenCodeMessageBundlesFromDb(sessionId: string): OpenCodeMessageBundle[] {
  const db = openDb();
  try {
    const messages = db
      .query(
        `SELECT id, session_id, time_created, data
         FROM message
         WHERE session_id = ?
         ORDER BY time_created ASC, id ASC`,
      )
      .all(sessionId) as Array<{ id: string; session_id: string; time_created: number; data: string }>;

    const partStmt = db.query(
      `SELECT id, message_id, session_id, data
       FROM part
       WHERE message_id = ?
       ORDER BY id ASC`,
    );

    const bundles: OpenCodeMessageBundle[] = [];

    for (const row of messages) {
      let info: Record<string, unknown>;
      try {
        info = JSON.parse(row.data) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (typeof info.role !== "string") continue;
      info.id = row.id;
      info.sessionID = row.session_id;

      const partRows = partStmt.all(row.id) as Array<{ id: string; message_id: string; session_id: string; data: string }>;
      const parts: Record<string, unknown>[] = [];
      for (const partRow of partRows) {
        try {
          const part = JSON.parse(partRow.data) as Record<string, unknown>;
          part.id = partRow.id;
          part.messageID = partRow.message_id;
          part.sessionID = partRow.session_id;
          parts.push(part);
        } catch {}
      }

      bundles.push({ info, parts });
    }

    return bundles;
  } finally {
    db.close();
  }
}

export function sessionRowToRealTotal(row: DbSessionRow): number | null {
  const input = Number(row.tokens_input ?? 0);
  const cacheRead = Number(row.tokens_cache_read ?? 0);
  const cacheWrite = Number(row.tokens_cache_write ?? 0);
  const total = input + cacheRead + cacheWrite;
  return total > 0 ? total : null;
}

export function sessionRowMtimeMs(row: DbSessionRow): number {
  const ts = Number(row.time_updated ?? 0);
  // OpenCode stores epoch ms; if value looks like seconds, scale up.
  return ts > 1e12 ? ts : ts * 1000;
}
