import { homedir } from "node:os";
import { join } from "node:path";
import type { AnalyzeType } from "./types.ts";
import {
  getLlmConfigLegacy,
  getPublicLlmConfigFromStore,
  resolveModelForProvider,
} from "./llm-config-store.ts";

export type LlmConfig = ReturnType<typeof getLlmConfigLegacy>;

export function getLlmConfig(): LlmConfig {
  return getLlmConfigLegacy();
}

export function getPublicLlmConfig() {
  return getPublicLlmConfigFromStore();
}

export { resolveModelForProvider };

export const ANALYSIS_TYPES: Array<{ id: AnalyzeType; label: string; description: string }> = [
  { id: "summarize", label: "Summarize", description: "Goals, decisions, and key outcomes" },
  { id: "intent-map", label: "Intent map", description: "User intents and first principles" },
  {
    id: "experience-extract",
    label: "Experience extract",
    description: "Preferences, patterns, and anti-patterns",
  },
  { id: "session-review", label: "Session review", description: "What worked, failures, recommendations" },
];

export function defaultSkillDir(): string {
  return join(homedir(), ".cursor", "skills");
}

export function defaultRuleDir(cwd?: string): string {
  if (cwd) return join(cwd, ".cursor", "rules");
  return join(homedir(), ".cursor", "rules");
}
