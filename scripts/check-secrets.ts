/**
 * Scans tracked/staged files for likely API keys and secrets.
 * Exit 1 if any match is found (for CI and pre-commit hooks).
 *
 * Usage:
 *   bun scripts/check-secrets.ts           # scan all git-tracked files
 *   bun scripts/check-secrets.ts --staged  # scan git index only (pre-commit)
 */

import { $ } from "bun";
import { readFileSync } from "node:fs";

const STAGED = process.argv.includes("--staged");

/** Known safe placeholders used in tests and docs. */
const ALLOWLIST = new Set([
  "test-key-12345678",
  "__UNCHANGED__",
  "your-api-key-here",
  "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
]);

type Rule = { name: string; pattern: RegExp; minLength?: number };

const RULES: Rule[] = [
  { name: "OpenRouter key", pattern: /sk-or-v1-[a-zA-Z0-9]{20,}/g },
  { name: "OpenAI key", pattern: /sk-[a-zA-Z0-9]{20,}/g, minLength: 24 },
  { name: "Anthropic key", pattern: /sk-ant-[a-zA-Z0-9_-]{20,}/g },
  { name: "NVIDIA NIM key", pattern: /nvapi-[a-zA-Z0-9_-]{20,}/g },
  { name: "GitHub PAT", pattern: /ghp_[a-zA-Z0-9]{36,}/g },
  { name: "GitHub OAuth", pattern: /gho_[a-zA-Z0-9]{36,}/g },
  { name: "AWS access key", pattern: /AKIA[0-9A-Z]{16}/g },
  { name: "Google API key", pattern: /AIza[0-9A-Za-z_-]{35}/g },
  { name: "Bearer token assignment", pattern: /Bearer\s+[a-zA-Z0-9._-]{24,}/g },
];

/** Env var lines that must stay empty in committed files. */
const ENV_KEY_VARS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "OPENCODE_ZEN_API_KEY",
  "OPENCODE_API_KEY",
  "GROQ_API_KEY",
  "DEEPSEEK_API_KEY",
  "NVIDIA_API_KEY",
];

type Finding = { file: string; line: number; rule: string; excerpt: string };

function mask(value: string): string {
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function isAllowlisted(match: string): boolean {
  if (ALLOWLIST.has(match)) return true;
  if (/^x+$/i.test(match.replace(/^sk-/, ""))) return true;
  return false;
}

function scanContent(file: string, content: string): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNo = i + 1;

    for (const rule of RULES) {
      rule.pattern.lastIndex = 0;
      for (const m of line.matchAll(rule.pattern)) {
        const value = m[0];
        if (isAllowlisted(value)) continue;
        if (rule.minLength != null && value.length < rule.minLength) continue;
        // OpenAI pattern also matches OpenRouter/sk-ant — dedupe via rule order
        if (rule.name === "OpenAI key" && (value.startsWith("sk-or-") || value.startsWith("sk-ant-"))) {
          continue;
        }
        findings.push({
          file,
          line: lineNo,
          rule: rule.name,
          excerpt: line.trim().slice(0, 120),
        });
      }
    }

    if (file.endsWith(".env.example") || file.endsWith(".env.example.txt")) {
      for (const varName of ENV_KEY_VARS) {
        const re = new RegExp(`^\\s*${varName}\\s*=\\s*(.+?)\\s*(#.*)?$`);
        const m = line.match(re);
        if (!m) continue;
        const val = m[1]!.replace(/^["']|["']$/g, "").trim();
        if (val.length > 0 && !isAllowlisted(val)) {
          findings.push({
            file,
            line: lineNo,
            rule: `${varName} must be empty in .env.example`,
            excerpt: `${varName}=${mask(val)}`,
          });
        }
      }
    }
  }

  return findings;
}

async function listFiles(): Promise<string[]> {
  if (STAGED) {
    const result = await $`git diff --cached --name-only --diff-filter=ACM`.quiet();
    return result.text().trim().split(/\r?\n/).filter(Boolean);
  }
  const result = await $`git ls-files`.quiet();
  return result.text().trim().split(/\r?\n/).filter(Boolean);
}

async function main(): Promise<void> {
  const files = await listFiles();
  const allFindings: Finding[] = [];

  for (const file of files) {
    if (file.startsWith("scripts/check-secrets.ts")) continue;
    try {
      const content = readFileSync(file, "utf8");
      allFindings.push(...scanContent(file, content));
    } catch {
      // binary or missing — skip
    }
  }

  if (allFindings.length === 0) {
    console.log(`✓ No secrets detected (${files.length} file(s) scanned${STAGED ? ", staged only" : ""}).`);
    process.exit(0);
  }

  console.error(`✗ Found ${allFindings.length} potential secret(s):\n`);
  for (const f of allFindings) {
    console.error(`  ${f.file}:${f.line} [${f.rule}]`);
    console.error(`    ${f.excerpt}\n`);
  }
  console.error("Remove secrets before committing. Use .env locally (gitignored) for real keys.");
  console.error("See SECURITY.md for rotation steps if keys were previously committed.");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
