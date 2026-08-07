# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-08-07

### Added

- Local web UI for agent session analysis (Context, Messages, Analysis, Governance, Artifacts, Insights)
- Transcript support: Claude Code, Cursor, Pi, OpenCode (SQLite + JSONL)
- Context token visualization (treemap, sunburst, bar) with drill-down
- 19 LLM analysis types and Analysis Pipeline Wizard
- Governance pipelines (Quick / Standard / Full) with cancel, resume, and Apply Pack
- Multi-provider LLM configuration (Anthropic, OpenAI, OpenRouter, OpenCode Zen, Groq, DeepSeek, Ollama, NVIDIA NIM)
- Arabic user guide (`docs/GUIDE-ar.md`)
- Secret scanning script and pre-commit hook support
- 130+ unit tests across server modules

### Security

- API keys restricted to `.env` and `.cache/` (gitignored)
- Documented key rotation in `SECURITY.md`

[0.1.0]: https://github.com/ZoheerAlmansoub/agent-session-intelligence/releases/tag/v0.1.0
