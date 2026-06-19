# Agent Session Intelligence

A local web app for **agent session analysis**: context token breakdown, user message aggregation, AI-powered analysis, skill/rule extraction, and recurring problem detection.

Supported transcript sources:

- **Claude Code:** `~/.claude/projects/**/*.jsonl`
- **Pi:** `~/.pi/agent/sessions/**/*.jsonl`
- **Cursor:** `~/.cursor/projects/*/agent-transcripts/*/*.jsonl`
- **OpenCode:** listed in UI; full transcripts when `message/`/`part/` storage exists (otherwise shows availability message)

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

Analysis types (grouped by category):

- **Overview:** summarize, intent map, experience extract, session review
- **Context & tokens:** token audit
- **Loops & tools:** loop diagnosis, tool hardening
- **Artifacts & memory:** artifact blueprint, memory file drafts, agent orchestration
- **Learning:** agentic lessons

Structured analysis types return JSON parsed into cards with copy/save actions for artifacts and memory files.

### Artifacts

Generate Cursor **skills** (`SKILL.md`) and **rules** (`.mdc`) from session patterns. Copy or save to disk.

### Insights

- Session-level pattern detection (retry loops, tool errors, token waste)
- Project-wide recurring patterns across recent sessions

## API

| Route | Description |
|-------|-------------|
| `GET /api/sessions/:id/transcript` | Full session transcript |
| `GET /api/sessions/:id/user-messages` | Aggregated user messages |
| `POST /api/sessions/:id/analyze` | LLM analysis |
| `POST /api/sessions/:id/generate-artifacts` | Skills/rules generation |
| `GET /api/sessions/:id/insights` | Session patterns |
| `GET /api/insights/recurring?project=` | Cross-session patterns |
| `GET /api/config/llm` | Provider config (no secrets) |

## Project layout

- `server/` — Bun HTTP API, transcript engine, LLM, insights
- `web/` — React + Vite frontend

## License

[GPL-3.0-or-later](./LICENSE)
