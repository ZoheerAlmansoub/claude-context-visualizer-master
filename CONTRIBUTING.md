# Contributing to Agent Session Intelligence

Thank you for helping improve tooling for Claude Code, Cursor, Pi, and OpenCode developers.

## Ways to contribute

- **Bug reports** — open an issue with steps to reproduce, agent type (Claude Code / Cursor / etc.), and OS
- **Feature ideas** — describe the workflow pain point, not only the UI change
- **Pull requests** — fixes, tests, docs, and transcript parser improvements are especially welcome
- **Docs** — README and [GUIDE-ar.md](./docs/GUIDE-ar.md)

## Development setup

```sh
bun install
cd web && bun install && cd ..
cp .env.example .env   # local only — never commit

bun run hooks:install  # optional: pre-commit secret scan
bun run dev            # API :5174 + UI :5173
```

Windows: `.\start.ps1`

## Before you open a PR

1. Run `bun run check:secrets` — no API keys in tracked files
2. Keep changes focused; match existing TypeScript/React style in `server/` and `web/`
3. Add or update tests when changing parsers, analysis, or governance logic (`*.test.ts`)
4. Update README or `docs/GUIDE-ar.md` if user-facing behavior changes

## Project areas

| Area | Path | Good first issues |
|------|------|-------------------|
| Transcript loaders | `server/*-loader.ts`, `server/opencode-db.ts` | New agent formats |
| Token snapshot | `server/snapshot.ts`, `web/src/components/Chart.tsx` | Chart UX, calibration |
| Analysis | `server/analysis*.ts`, `server/llm/` | Prompts, new analysis types |
| Governance | `server/governance/` | Pipeline steps, auto-apply |
| UI | `web/src/components/` | Accessibility, i18n |

## Code style

- TypeScript strict; prefer existing helpers over new abstractions
- Server: Bun native APIs, `.ts` imports with `.ts` extension where the repo already does
- Web: functional React components, CSS in `web/src/styles.css`
- Comments only for non-obvious logic

## Security

- **Never** commit `.env`, API keys, or session transcripts with private data
- See [SECURITY.md](./SECURITY.md)

## Community

- Be respectful and constructive

## License

By contributing, you agree that your contributions will be licensed under [GPL-3.0-or-later](./LICENSE).
