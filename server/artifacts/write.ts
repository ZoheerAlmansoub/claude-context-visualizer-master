import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve, sep } from "node:path";
import { diffContent, resolveUnderRoot } from "../project-context.ts";

const ALLOWED_EXT = /\.(md|mdc|json)$/i;

function expandHome(path: string): string {
  if (path.startsWith("~/")) return resolve(homedir(), path.slice(2));
  if (path === "~") return homedir();
  return path;
}

export function resolveWritePath(
  targetPath: string,
  projectRoot?: string,
): string {
  const expanded = expandHome(targetPath.trim());
  if (expanded.includes("..")) throw new Error("Path traversal not allowed");

  if (expanded.startsWith("/") || /^[A-Za-z]:[\\/]/.test(expanded)) {
    return resolve(expanded);
  }

  if (projectRoot) {
    return resolveUnderRoot(projectRoot, expanded);
  }

  return resolve(expanded);
}

export function isAllowedWritePath(resolved: string): boolean {
  const home = resolve(process.env.HOME || process.env.USERPROFILE || homedir());
  if (ALLOWED_EXT.test(resolved)) {
    if (resolved.startsWith(home)) return true;
    if (resolved.includes(`${sep}.cursor${sep}`)) return true;
    if (resolved.includes(`${sep}.claude${sep}`)) return true;
    if (resolved.includes(`${sep}.pi${sep}`)) return true;
    if (resolved.includes(`${sep}.opencode${sep}`)) return true;
    if (resolved.endsWith(`${sep}AGENTS.md`) || resolved.endsWith(`${sep}CLAUDE.md`)) return true;
    if (resolved.includes(`${sep}docs${sep}`)) return true;
  }
  return false;
}

export async function writeArtifactFile(
  targetPath: string,
  content: string,
  opts: { projectRoot?: string } = {},
): Promise<{ path: string; bytes: number }> {
  const resolved = resolveWritePath(targetPath, opts.projectRoot);
  if (!isAllowedWritePath(resolved)) {
    throw new Error("Path must be under home, project docs, or agent config directories");
  }
  await mkdir(dirname(resolved), { recursive: true });
  await writeFile(resolved, content, "utf8");
  return { path: resolved, bytes: Buffer.byteLength(content, "utf8") };
}

export async function writeWithMerge(opts: {
  targetPath: string;
  content: string;
  action: "create" | "update" | "append";
  projectRoot?: string;
}): Promise<{ path: string; merged: string; isNew: boolean }> {
  const resolved = resolveWritePath(opts.targetPath, opts.projectRoot);
  let existing: string | null = null;
  try {
    existing = await readFile(resolved, "utf8");
  } catch {}

  const { merged, isNew } = diffContent(existing, opts.content, opts.action);
  await writeArtifactFile(resolved, merged, { projectRoot: opts.projectRoot });
  return { path: resolved, merged, isNew };
}

export type ApplyPackItem = {
  path: string;
  content: string;
  action?: "create" | "update" | "append";
  selected?: boolean;
};

export async function applyArtifactPack(
  items: ApplyPackItem[],
  projectRoot?: string,
): Promise<Array<{ path: string; ok: boolean; error?: string }>> {
  const results: Array<{ path: string; ok: boolean; error?: string }> = [];
  for (const item of items) {
    if (item.selected === false) continue;
    try {
      if (item.action && item.action !== "create") {
        await writeWithMerge({
          targetPath: item.path,
          content: item.content,
          action: item.action,
          projectRoot,
        });
      } else {
        await writeArtifactFile(item.path, item.content, { projectRoot });
      }
      results.push({ path: item.path, ok: true });
    } catch (err) {
      results.push({
        path: item.path,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}
