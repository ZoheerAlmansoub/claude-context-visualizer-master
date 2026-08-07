# Agent Session Intelligence

A **local-first** web app for **agent session analysis**: context token breakdown, user message aggregation, AI-powered analysis, skill/rule extraction, recurring problem detection, and project governance.

> **الدليل العربي الشامل:** [docs/GUIDE-ar.md](./docs/GUIDE-ar.md)

Supported transcript sources:

- **Claude Code:** `~/.claude/projects/**/*.jsonl`
- **Pi:** `~/.pi/agent/sessions/**/*.jsonl`
- **Cursor:** `~/.cursor/projects/*/agent-transcripts/*/*.jsonl`
- **OpenCode:** full transcripts from `~/.local/share/opencode/opencode.db` (SQLite, primary) or legacy `storage/message/` + `storage/part/` JSON files

All session data is read from your machine. Nothing is uploaded to a cloud service except LLM API calls you configure for Analysis/Governance.

---

## Requirements

- [Bun](https://bun.sh) — API server and web tooling
- Windows: PowerShell for `start.ps1` (optional)

---

## Quick start

```sh
bun install
cd web && bun install && cd ..

# Local secrets only — never commit .env
cp .env.example .env

# Recommended: block accidental secret commits
bun run hooks:install   # Windows: .\scripts\install-git-hooks.ps1
bun run check:secrets   # verify before push
```

### Run

**Windows:**

```powershell
.\start.ps1
```

**CLI:**

```sh
bun run dev
```

- UI: http://localhost:5173  
- API: http://localhost:5174  

---

## What the app does

### Context tab

Visualize **what fills the context window**:

- Treemap, sunburst, and bar charts
- Drill-down into heaviest buckets (user messages, tool calls, tool results, attachments, thinking)
- Headline token stats: input, output, cache read/write, compaction boundaries
- Local token estimation (`cl100k_base`) with optional calibration from API usage

Use this when context compacts too early or you need to find the largest context consumers.

### Messages tab

- Chronological **user messages** with turn numbers
- Copy one message or all (markdown or plain text)
- Post-compaction filter

Use this to review what you actually asked without wading through assistant/tool noise.

### Analysis tab (requires LLM)

Configure keys in `.env` or **Settings → LLM** (saved to `.cache/llm-settings.json`, live reload, never committed).

**19 analysis types** in six categories:

| Category | Types |
|----------|-------|
| Overview | summarize, intent map, experience extract, session review |
| Context & tokens | token audit, compaction recovery |
| Loops & tools | loop diagnosis, tool hardening, MCP tool audit |
| Artifacts & memory | artifact blueprint, memory file drafts, agent orchestration |
| Governance | project health, user AI fluency, growth plan, memory diff, rule dedup, project synthesis |
| Learning | agentic lessons |

The **Analysis Pipeline Wizard** runs a guided sequence (summarize → token audit → loop diagnosis → artifact blueprint → memory drafts) with optional **Apply Pack** at the end.

Structured types return JSON rendered as cards with copy/save actions.

### Governance tab

- Session and **project pipelines** (Quick / Standard / Full)
- Reads existing `AGENTS.md`, `CLAUDE.md`, rules, and skills from the session project
- Multi-agent artifact paths (Cursor, Claude Code, Pi, OpenCode)
- Background pipelines with cancel/resume; cache under `.cache/pipeline/`
- Optional auto-apply for high/medium confidence artifacts
- Export project playbook to `docs/governance/`

### Artifacts tab

Generate **skills**, **rules**, hooks, and sub-agent specs from session patterns. Pattern-linked templates for retry loops, tool errors, token waste, and compaction pressure. **Apply Pack** batches selected items to disk with merge support for memory files.

### Insights tab

Session-level pattern detection and project-wide recurring patterns with suggested artifact templates.

---

## LLM providers

Supported: **Anthropic**, **OpenAI**, **OpenRouter**, **OpenCode Zen**, **Groq**, **DeepSeek**, **Ollama**, **NVIDIA NIM**.

Example `.env` (local file only):

```env
ANTHROPIC_API_KEY=
OPENROUTER_API_KEY=
NVIDIA_API_KEY=
DEFAULT_LLM_PROVIDER=anthropic
DEFAULT_LLM_MODEL=claude-sonnet-4-20250514
OLLAMA_BASE_URL=http://localhost:11434
LLM_FETCH_TIMEOUT_MS=1200000
```

See [.env.example](./.env.example) for all variables.

---

## Security — API keys

**Never commit real API keys.** Use `.env` locally or in-app LLM settings.

| File | Safe to commit? |
|------|-----------------|
| `.env` | No (gitignored) |
| `.cache/` | No (gitignored) |
| `.env.example` | Yes — empty placeholders only |

```sh
bun run check:secrets      # scan tracked files
bun run hooks:install      # pre-commit hook
```

Full rotation and history purge steps: [SECURITY.md](./SECURITY.md)

---

## API reference

| Route | Description |
|-------|-------------|
| `GET /api/health` | Health check |
| `GET /api/sessions/:id/transcript` | Full session transcript |
| `GET /api/sessions/:id/user-messages` | Aggregated user messages |
| `POST /api/sessions/:id/analyze` | LLM analysis (19 types) |
| `POST /api/sessions/:id/generate-artifacts` | Skills/rules generation |
| `GET /api/sessions/:id/insights` | Session patterns |
| `GET /api/insights/recurring?project=` | Cross-session patterns |
| `GET /api/projects/:slug/context` | Project memory/rules on disk |
| `GET /api/projects/:slug/dashboard` | Project stats, patterns, schedule |
| `POST /api/sessions/:id/govern` | Session governance pipeline |
| `POST /api/projects/:slug/govern` | Project governance pipeline |
| `GET /api/governance/:pipelineId` | Poll pipeline status |
| `POST /api/artifacts/apply-pack` | Batch apply artifacts |
| `GET /api/config/llm` | Provider config (no secrets) |

---

## Project layout

```
server/     — Bun HTTP API, transcript engine, LLM, insights, governance
web/        — React + Vite frontend
scripts/    — smoke tests, secret scanning, hook installer
docs/       — roadmap, Arabic guide
.cache/     — LLM settings, pipeline cache (local, gitignored)
```

Further API and roadmap detail: [docs/AGENT-INTELLIGENCE-ROADMAP.md](./docs/AGENT-INTELLIGENCE-ROADMAP.md)

---

## Common workflows

1. **Context fills too fast** → Context → token audit → compaction recovery  
2. **Agent stuck in a loop** → Insights → loop diagnosis → tool hardening → save rule  
3. **Extract skills from a session** → Analysis wizard → Artifacts → Apply Pack  
4. **Review whole project** → Project Dashboard → Govern (Standard/Full)

---

## License

[GPL-3.0-or-later](./LICENSE)
