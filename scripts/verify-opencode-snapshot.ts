import { findOpenCodeSessionById } from "../server/opencode-loader.ts";
import { resolveSessionSourceMtimeMs } from "../server/opencode-loader.ts";
import { computeSnapshot } from "../server/snapshot.ts";

const sessionId = "ses_19f0a3682ffe5sECM8xE7WbbrJ";
const filePath = await findOpenCodeSessionById(sessionId);
if (!filePath) throw new Error("session not found");
console.log("path:", filePath);
const mtime = await resolveSessionSourceMtimeMs(filePath, "opencode");
console.log("mtime:", mtime);
const snap = await computeSnapshot(filePath, mtime, "opencode");
console.log("snapshot ok:", snap.sessionId, snap.headline.realTotal, snap.warnings);
