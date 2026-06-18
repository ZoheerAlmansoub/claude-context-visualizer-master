# Agent Session Intelligence

A small local web app that shows **what's filling the context window** of local
agent sessions — system prompt vs. messages vs. tool calls vs. tool results vs.
attachments — so you can see what to trim.

It reads existing session transcripts (read-only) and renders a per-session breakdown
as a treemap, sunburst, or stacked bar, with a drill-down into the individual heaviest
items.

Supported sources:

- Claude Code: `~/.claude/projects/**/*.jsonl`
- Pi: `~/.pi/agent/sessions/**/*.jsonl`
- OpenCode: visible in the UI, but full snapshots are disabled when only
  `~/.local/share/opencode/storage/session_diff/*.json` patch files are available.

## Requirements

- [Bun](https://bun.sh) — used for both the API server and the web build.

## Setup

```sh
bun install
cd web && bun install && cd ..
```

## Run

### Windows (recommended)

Double-click [`start.bat`](start.bat) or run:

```powershell
.\start.ps1
```

This installs dependencies if needed, starts the API (port 5174) and the Vite
dev server (port 5173), opens <http://localhost:5173>, and keeps both processes
running until you press Ctrl+C.

### Bun CLI

```sh
bun run dev
```

Starts the API (port 5174) and the Vite dev server (port 5173) — open
<http://localhost:5173>. The dev server proxies `/api` to the backend.

To build the frontend for production: `bun run build:web` (outputs `web/dist`); run the
API with `bun run start`.

## How it works

- The **headline total** comes straight from the `usage` field of the latest assistant
  turn — ground truth from the API.
- Messages, tool calls, tool results, and attachments are tokenized locally with
  `js-tiktoken` (`cl100k_base`). Claude counts are calibrated toward Claude's BPE;
  other agents use the local tokenizer directly. Counts are approximate; proportions
  are accurate.
- The **system prompt + tool schemas** can't be read from the transcript, so they're
  shown as the residual: `realTotal − Σ(identified buckets)`.
- If a session has been compacted, only content after the latest compaction boundary is
  counted when the agent transcript exposes that boundary.
- Snapshots are cached under `.cache/<agent>/<sessionId>.json`, keyed by the source
  file's mtime; each session has a Refresh button to recompute.

## Project layout

- `server/` — Bun HTTP API: reads/parses JSONL, tokenizes, computes the snapshot.
- `web/` — React + Vite frontend (ECharts for the visualizations).

## License

[GPL-3.0-or-later](./LICENSE)
