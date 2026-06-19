import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import type { AgentKind, ProjectContextSummary } from "./types.ts";
import { cursorProjectPathCandidates, decodeProjectSlugForAgent } from "./paths.ts";

const MAX_FILE_BYTES = 64 * 1024;
const MAX_CONTEXT_CHARS = 48_000;

export type ProjectRootResolution = {
  projectRoot: string;
  verified: boolean;
  source: "cwd" | "decode" | "fallback";
  warning?: string;
};

export type ProjectContextFile = {
  path: string;
  relativePath: string;
  exists: boolean;
  sizeBytes: number;
  mtimeMs: number;
  hash: string;
  content: string;
  truncated: boolean;
};

export type ProjectContextSnapshot = {
  projectRoot: string;
  verified: boolean;
  source: ProjectRootResolution["source"];
  warning?: string;
  files: ProjectContextFile[];
  contextBlock: string;
  inventoryHash: string;
};

const STATIC_PATHS = [
  "AGENTS.md",
  ".cursor/AGENTS.md",
  "CLAUDE.md",
  "claude.md",
  "design.md",
  "docs/design.md",
  "README.md",
  "package.json",
] as const;

const AGENT_EXTRA_PATHS: Record<AgentKind, string[]> = {
  cursor: [".cursor/rules"],
  claude: [".claude/rules", ".claude/skills"],
  pi: [".pi/skills"],
  opencode: [".opencode/rules", ".opencode/skills"],
};

function expandHome(path: string): string {
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  if (path === "~") return homedir();
  return path;
}

export function resolveUnderRoot(projectRoot: string, relativePath: string): string {
  const root = resolve(expandHome(projectRoot));
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.includes("..")) throw new Error("Path traversal not allowed");
  const target = resolve(root, normalized);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error("Path escapes project root");
  }
  return target;
}

export async function resolveProjectRoot(opts: {
  agent: AgentKind;
  projectSlug: string;
  cwd?: string | null;
}): Promise<ProjectRootResolution> {
  const decodedPaths =
    opts.agent === "cursor"
      ? cursorProjectPathCandidates(opts.projectSlug)
      : [decodeProjectSlugForAgent(opts.agent, opts.projectSlug)];
  const candidates: Array<{ path: string; source: ProjectRootResolution["source"] }> = [];

  if (opts.cwd?.trim()) candidates.push({ path: opts.cwd.trim(), source: "cwd" });
  for (const decoded of decodedPaths) {
    if (decoded.trim()) candidates.push({ path: decoded.trim(), source: "decode" });
  }

  for (const c of candidates) {
    try {
      const resolved = resolve(expandHome(c.path));
      const st = await stat(resolved);
      if (st.isDirectory()) {
        return { projectRoot: resolved, verified: true, source: c.source };
      }
    } catch {}
  }

  const fallback = opts.cwd?.trim() || decodedPaths[0]?.trim() || opts.projectSlug;
  return {
    projectRoot: resolve(expandHome(fallback)),
    verified: false,
    source: "fallback",
    warning: "Project root could not be verified on disk — decoded path may be inaccurate",
  };
}

async function readFileSafe(
  projectRoot: string,
  relativePath: string,
): Promise<ProjectContextFile | null> {
  try {
    const abs = resolveUnderRoot(projectRoot, relativePath);
    const st = await stat(abs);
    if (!st.isFile()) return null;
    const sizeBytes = st.size;
    const buf = await readFile(abs);
    const truncated = buf.length > MAX_FILE_BYTES;
    const slice = truncated ? buf.subarray(0, MAX_FILE_BYTES) : buf;
    const content = slice.toString("utf8");
    const hash = createHash("sha256").update(buf).digest("hex").slice(0, 12);
    return {
      path: abs,
      relativePath: relativePath.replace(/\\/g, "/"),
      exists: true,
      sizeBytes,
      mtimeMs: st.mtimeMs,
      hash,
      content,
      truncated,
    };
  } catch {
    return null;
  }
}

async function collectDirFiles(
  projectRoot: string,
  dirRelative: string,
  ext: RegExp,
  limit: number,
): Promise<string[]> {
  try {
    const abs = resolveUnderRoot(projectRoot, dirRelative);
    const st = await stat(abs);
    if (!st.isDirectory()) return [];
    const entries = await readdir(abs, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && ext.test(e.name))
      .map((e) => join(dirRelative, e.name).replace(/\\/g, "/"))
      .slice(0, limit);
  } catch {
    return [];
  }
}

async function collectDocsContext(projectRoot: string): Promise<string[]> {
  try {
    const abs = resolveUnderRoot(projectRoot, "docs/context");
    const st = await stat(abs);
    if (!st.isDirectory()) return [];
    const entries = await readdir(abs, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && /\.md$/i.test(e.name))
      .map((e) => join("docs/context", e.name).replace(/\\/g, "/"))
      .slice(0, 8);
  } catch {
    return [];
  }
}

export function toProjectContextSummary(snapshot: ProjectContextSnapshot): ProjectContextSummary {
  return {
    projectRoot: snapshot.projectRoot,
    verified: snapshot.verified,
    source: snapshot.source,
    warning: snapshot.warning,
    inventoryHash: snapshot.inventoryHash,
    files: snapshot.files.map((f) => ({
      relativePath: f.relativePath,
      sizeBytes: f.sizeBytes,
      hash: f.hash,
      truncated: f.truncated,
    })),
  };
}

export async function loadProjectContext(opts: {
  agent: AgentKind;
  projectSlug: string;
  cwd?: string | null;
}): Promise<ProjectContextSnapshot> {
  const rootInfo = await resolveProjectRoot(opts);
  const paths = new Set<string>(STATIC_PATHS);

  for (const dir of AGENT_EXTRA_PATHS[opts.agent] ?? []) {
    if (dir.endsWith("rules")) {
      for (const p of await collectDirFiles(rootInfo.projectRoot, dir, /\.(mdc|md)$/i, 12)) {
        paths.add(p);
      }
    } else if (dir.endsWith("skills")) {
      try {
        const abs = resolveUnderRoot(rootInfo.projectRoot, dir);
        const entries = await readdir(abs, { withFileTypes: true });
        for (const e of entries.filter((x) => x.isDirectory()).slice(0, 8)) {
          paths.add(join(dir, e.name, "SKILL.md").replace(/\\/g, "/"));
        }
      } catch {}
    }
  }

  for (const p of await collectDocsContext(rootInfo.projectRoot)) paths.add(p);

  const files: ProjectContextFile[] = [];
  for (const rel of paths) {
    const f = await readFileSafe(rootInfo.projectRoot, rel);
    if (f) files.push(f);
  }

  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  const inventoryHash = createHash("sha256")
    .update(files.map((f) => `${f.relativePath}:${f.hash}`).join("|"))
    .digest("hex")
    .slice(0, 12);

  const contextBlock = buildProjectContextBlock(rootInfo, files);

  return {
    projectRoot: rootInfo.projectRoot,
    verified: rootInfo.verified,
    source: rootInfo.source,
    warning: rootInfo.warning,
    files,
    contextBlock,
    inventoryHash,
  };
}

export function buildProjectContextBlock(
  rootInfo: ProjectRootResolution,
  files: ProjectContextFile[],
): string {
  const lines = [
    "## Existing project context (on disk)",
    `- Project root: ${rootInfo.projectRoot}`,
    `- Verified: ${rootInfo.verified ? "yes" : "no"} (${rootInfo.source})`,
  ];
  if (rootInfo.warning) lines.push(`- Warning: ${rootInfo.warning}`);

  if (!files.length) {
    lines.push("", "No allowlisted project memory/rules files found.");
    return lines.join("\n");
  }

  lines.push("", `Found ${files.length} file(s):`, "");
  let total = 0;
  for (const f of files) {
    const header = `### ${f.relativePath} (${f.sizeBytes} bytes, hash ${f.hash}${f.truncated ? ", truncated" : ""})`;
    if (total + header.length + f.content.length > MAX_CONTEXT_CHARS) {
      lines.push(header, "", "… [omitted — context limit]", "");
      break;
    }
    lines.push(header, "", f.content, "");
    total += header.length + f.content.length;
  }
  return lines.join("\n");
}

export function diffContent(
  existing: string | null,
  proposed: string,
  action: "create" | "update" | "append",
): { merged: string; preview: string; isNew: boolean } {
  if (!existing || action === "create") {
    return { merged: proposed, preview: proposed, isNew: !existing };
  }
  if (action === "update") {
    return { merged: proposed, preview: proposed, isNew: false };
  }
  const merged = `${existing.trimEnd()}\n\n${proposed.trim()}\n`;
  return { merged, preview: merged, isNew: false };
}

export function findExistingFile(
  snapshot: ProjectContextSnapshot,
  relativePath: string,
): ProjectContextFile | undefined {
  const norm = relativePath.replace(/\\/g, "/");
  return snapshot.files.find((f) => f.relativePath.toLowerCase() === norm.toLowerCase());
}
