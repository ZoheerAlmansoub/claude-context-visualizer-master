# Agent Session Intelligence

A local web app for **agent session analysis**: context token breakdown, user message aggregation, AI-powered analysis, skill/rule extraction, and recurring problem detection.

Supported transcript sources:

- **Claude Code:** `~/.claude/projects/**/*.jsonl`
- **Pi:** `~/.pi/agent/sessions/**/*.jsonl`
- **Cursor:** `~/.cursor/projects/*/agent-transcripts/*/*.jsonl`
- **OpenCode:** full transcripts from `~/.local/share/opencode/opencode.db` (SQLite, primary) or legacy `storage/message/` + `storage/part/` JSON files

## Requirements

- [Bun](https://bun.sh) — API server and web build

## Setup

```sh
bun install
cd web && bun install && cd ..
cp .env.example .env   # optional: add LLM API keys for Analysis tab
```

## Run

### Windows

```powershell
.\start.ps1
```

Starts API (port 5174) and Vite (port 5173). Open http://localhost:5173

### Bun CLI

```sh
bun run dev
```

## Features

### Context (original)

- Token breakdown: system, messages, tool calls, tool results, attachments
- Treemap / sunburst / bar charts
- Drill-down into heaviest items

### Messages

- Chronological user messages with turn numbers
- Copy single message, all messages (markdown or plain)
- Post-compaction filter

### Analysis (requires LLM)

Configure in `.env` or **Settings → LLM** in the app:

```
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
OPENROUTER_API_KEY=...
OPENCODE_ZEN_API_KEY=...
GROQ_API_KEY=...
DEEPSEEK_API_KEY=...
NVIDIA_API_KEY=...
OLLAMA_BASE_URL=http://localhost:11434
DEFAULT_LLM_PROVIDER=openrouter
```

Supported providers: **Anthropic**, **OpenAI**, **OpenRouter**, **OpenCode Zen**, **Groq**, **DeepSeek**, **Ollama**, **NVIDIA NIM**.

Analysis types (19 total, grouped by category):

- **Overview:** summarize, intent map, experience extract, session review
- **Context & tokens:** token audit, compaction recovery
- **Loops & tools:** loop diagnosis, tool hardening, MCP tool audit
- **Artifacts & memory:** artifact blueprint, memory file drafts, agent orchestration
- **Governance:** project health report, user AI fluency, growth plan, memory diff, rule dedup, project synthesis
- **Learning:** agentic lessons

Structured analysis types return JSON parsed into cards with copy/save actions for artifacts and memory files. The **Analysis Pipeline Wizard** runs a guided sequence (summarize → token audit → loop diagnosis → artifact blueprint → memory drafts) with optional Apply Pack at the end.

### Governance

- **Governance tab:** project context from disk, cross-session patterns, session/project pipelines (Quick / Standard / Full)
- **Project Dashboard tab:** session stats, recurring patterns, scheduled refresh eligibility, one-click project govern
- Reads existing `AGENTS.md`, `CLAUDE.md`, rules, and skills from the session project (multi-candidate Cursor path resolution)
- Multi-agent artifact paths (Cursor, Claude Code, Pi, OpenCode)
- Background pipelines with cancel/resume; incremental JSON cache under `.cache/pipeline/`
- Optional **auto-apply** for high/medium confidence artifacts after pipeline completion
- Export project playbook to `docs/governance/`

### Artifacts

Generate agent **skills**, **rules**, hooks, and sub-agent specs from session patterns. Pattern-linked templates suggest artifacts for retry loops, tool errors, token waste, and compaction pressure. Paths adapt to the active agent (not Cursor-only). Copy or save to disk with merge support for memory files. **Apply Pack** batches selected items to disk from analysis cards or governance output.

### Insights

- Session-level pattern detection (retry loops, tool errors, token waste)
- Project-wide recurring patterns across recent sessions with suggested artifact templates

## API

| Route | Description |
|-------|-------------|
| `GET /api/sessions/:id/transcript` | Full session transcript |
| `GET /api/sessions/:id/user-messages` | Aggregated user messages |
| `POST /api/sessions/:id/analyze` | LLM analysis (19 types) |
| `POST /api/sessions/:id/generate-artifacts` | Skills/rules generation |
| `GET /api/sessions/:id/insights` | Session patterns |
| `GET /api/insights/recurring?project=` | Cross-session patterns |
| `GET /api/projects/:slug/context` | Project memory/rules on disk |
| `GET /api/projects/:slug/context/summary` | Compact project context for UI badge |
| `GET /api/projects/:slug/dashboard` | Project stats, patterns, schedule eligibility |
| `GET /api/projects/:slug/govern/eligible` | Whether scheduled project govern should run |
| `POST /api/sessions/:id/govern` | Session governance pipeline (`mode`, `autoApply`) |
| `POST /api/projects/:slug/govern` | Project governance pipeline |
| `GET /api/governance/:pipelineId` | Poll pipeline status and steps |
| `POST /api/governance/:pipelineId/cancel` | Cancel running pipeline |
| `POST /api/governance/:pipelineId/resume` | Resume cancelled/errored pipeline |
| `GET /api/projects/:slug/playbook` | Export governance playbook |
| `POST /api/artifacts/apply-pack` | Batch apply artifacts with merge |
| `GET /api/config/llm` | Provider config (no secrets) |

## Project layout

- `server/` — Bun HTTP API, transcript engine, LLM, insights
- `web/` — React + Vite frontend
- `docs/AGENT-INTELLIGENCE-ROADMAP.md` — gap closure plan, OpenCode spec, API reference

## License

[GPL-3.0-or-later](./LICENSE)
