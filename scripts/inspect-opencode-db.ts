import { Database } from "bun:sqlite";
import { homedir } from "node:os";
import { join } from "node:path";

const dbPath = join(homedir(), ".local", "share", "opencode", "opencode.db");
const db = new Database(dbPath, { readonly: true });

const tables = db
  .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all() as Array<{ name: string }>;
console.log("tables:", tables.map((r) => r.name).join(", "));

for (const t of ["session", "message", "part", "project"]) {
  try {
    const cols = db.query(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>;
    const count = db.query(`SELECT COUNT(*) as c FROM ${t}`).get() as { c: number };
    console.log(`${t}: cols=${cols.map((c) => c.name).join("|")} count=${count.c}`);
  } catch {
    console.log(`${t}: missing`);
  }
}

const sessions = db
  .query("SELECT id, project_id, title, directory, time_updated FROM session ORDER BY time_updated DESC LIMIT 3")
  .all();
console.log("sample sessions:", JSON.stringify(sessions, null, 2));

const msg = db.query("SELECT id, session_id, data FROM message LIMIT 1").get() as {
  id: string;
  session_id: string;
  data: string;
} | null;
if (msg) {
  const parsed = JSON.parse(msg.data);
  console.log("sample message keys:", Object.keys(parsed));
  console.log("sample message role:", parsed.role);
}

const part = db.query("SELECT id, message_id, data FROM part LIMIT 1").get() as {
  id: string;
  message_id: string;
  data: string;
} | null;
if (part) {
  const parsed = JSON.parse(part.data);
  console.log("sample part type:", parsed.type);
}
