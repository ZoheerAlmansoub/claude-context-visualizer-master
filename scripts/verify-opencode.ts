import { listOpenCodeProjects, listOpenCodeSessions, loadOpenCodeRecords, opencodeProjectStatus } from "../server/opencode-loader.ts";

const status = await opencodeProjectStatus();
console.log("status:", status);

const projects = await listOpenCodeProjects();
console.log(
  "projects:",
  projects.length,
  projects.slice(0, 3).map((p) => ({ slug: p.slug, path: p.path, sessions: p.sessionCount, unavailable: p.unavailableReason })),
);

const first = projects.find((p) => p.slug !== "__unavailable__");
if (first) {
  const sessions = await listOpenCodeSessions(first.slug);
  console.log(
    "sessions sample:",
    sessions.slice(0, 2).map((s) => ({ id: s.id, title: s.title, realTotal: s.realTotal })),
  );
  if (sessions[0]) {
    const loaded = await loadOpenCodeRecords(sessions[0].filePath);
    console.log("load ok:", loaded.ok, loaded.ok ? `${loaded.records.length} bundles` : loaded.reason);
  }
}
