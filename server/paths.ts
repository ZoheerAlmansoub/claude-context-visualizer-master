import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentKind } from "./types.ts";

const here = dirname(fileURLToPath(import.meta.url));

export type AgentConfig = {
  id: AgentKind;
  label: string;
  sessionsDir: string;
};

export const AGENT_CONFIGS: Record<AgentKind, AgentConfig> = {
  claude: {
    id: "claude",
    label: "Claude",
    sessionsDir: join(homedir(), ".claude", "projects"),
  },
  pi: {
    id: "pi",
    label: "Pi",
    sessionsDir: join(homedir(), ".pi", "agent", "sessions"),
  },
  opencode: {
    id: "opencode",
    label: "OpenCode",
    sessionsDir: join(homedir(), ".local", "share", "opencode", "storage"),
  },
  cursor: {
    id: "cursor",
    label: "Cursor",
    sessionsDir: join(homedir(), ".cursor", "projects"),
  },
};

export const CLAUDE_PROJECTS_DIR = AGENT_CONFIGS.claude.sessionsDir;

export const CACHE_DIR = join(here, "..", ".cache");

export function isAgentKind(value: string | null | undefined): value is AgentKind {
  return value === "claude" || value === "pi" || value === "opencode" || value === "cursor";
}

export function getAgentConfig(agent: AgentKind): AgentConfig {
  return AGENT_CONFIGS[agent];
}

// Project directory names are flattened paths: slashes replaced with dashes,
// and a single leading dash. e.g. "-home-user-projects-my-app".
// We decode by replacing dashes with slashes — lossy but usable as a label.
export function decodeProjectSlug(slug: string): string {
  return slug.replace(/^-/, "/").replace(/-/g, "/");
}

// Pi stores Windows paths as double-dash-delimited project slugs, e.g.
// "--D--dev-ERP-SAP--" for "D:\dev\ERP-SAP".
export function decodePiProjectSlug(slug: string): string {
  const trimmed = slug.replace(/^--/, "").replace(/--$/, "");
  const parts = trimmed.split("--").filter(Boolean);
  if (parts.length === 0) return slug;
  const [head, ...rest] = parts;
  if (head && /^[A-Za-z]$/.test(head)) {
    if (rest.length === 1) {
      const [first, ...tail] = rest[0]!.split("-");
      return tail.length > 0 ? `${head}:\\${first}\\${tail.join("-")}` : `${head}:\\${first}`;
    }
    return `${head}:\\${rest.join("\\")}`;
  }
  return parts.join("\\");
}

/** Candidate paths for a Cursor project slug (hyphens may be separators or folder names). */
export function cursorProjectPathCandidates(slug: string): string[] {
  const parts = slug.split("-");
  if (parts.length < 2 || !/^[a-z]$/i.test(parts[0]!)) {
    return [slug.replace(/-/g, "/")];
  }
  const drive = parts[0]!.toUpperCase();
  const rest = parts.slice(1);
  const candidates: string[] = [];

  if (rest.length === 1) {
    candidates.push(`${drive}:/${rest[0]}`);
  } else {
    // d-dev-claude-context-visualizer-master -> D:/dev/claude-context-visualizer-master
    candidates.push(`${drive}:/${rest[0]}/${rest.slice(1).join("-")}`);
    // e-MyDev-Hospitix-Hospitix -> E:/MyDev/Hospitix/Hospitix
    candidates.push(`${drive}:/${rest.join("/")}`);
    if (rest.length >= 3) {
      candidates.push(`${drive}:/${rest[0]}/${rest[1]}/${rest.slice(2).join("-")}`);
    }
  }
  return [...new Set(candidates)];
}

export function decodeCursorProjectSlug(slug: string): string {
  return cursorProjectPathCandidates(slug)[0] ?? slug;
}

export function decodeProjectSlugForAgent(agent: AgentKind, slug: string): string {
  if (agent === "pi") return decodePiProjectSlug(slug);
  if (agent === "cursor") return decodeCursorProjectSlug(slug);
  if (agent === "opencode") return slug;
  return decodeProjectSlug(slug);
}
