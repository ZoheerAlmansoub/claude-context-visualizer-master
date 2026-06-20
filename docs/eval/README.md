# Evaluation fixtures (roadmap D1/D4)

Reference sessions and rubrics for measuring analysis quality beyond parse success.

## Dimensions

| Dimension | What to check |
|-----------|----------------|
| Grounding | Artifacts/memory cite real turns and on-disk files |
| Path correctness | Apply paths match agent conventions (see `shared/artifact-paths.ts`) |
| Memory completeness | Drafts include overview, stack, paths, preferences |
| Tool audit | MCP findings reference tools present in transcript tool events |

## Running

1. Place anonymized session exports under `server/fixtures/eval/`.
2. Run governance pipeline in `full` mode against each fixture.
3. Score outputs with rubrics in this folder (manual or scripted).

## Automated checks

- `bun test server/governance/config.test.ts` — config drift
- `bun test server/artifacts/path-parity.test.ts` — server/web path parity
- `bun test server/validation/grounding.test.ts` — grounding score logic
- `bun test server/artifacts/apply-collector.test.ts` — apply pack collection
