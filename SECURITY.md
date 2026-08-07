# Security — API keys and secrets

This project talks to external LLM providers. **Never commit real API keys** to the repository.

## Where secrets belong

| Location | Purpose | Committed? |
|----------|---------|------------|
| `.env` | Local environment variables | **No** (gitignored) |
| `.cache/llm-settings.json` | Keys saved from Settings → LLM in the app | **No** (gitignored via `.cache/`) |
| `.env.example` | Template with **empty** placeholders only | Yes |

## Setup (safe)

```sh
cp .env.example .env
# Edit .env locally — never commit this file
```

Or configure keys in the app: **Settings → LLM**. Values persist to `.cache/llm-settings.json` without restart.

## Before every push

```sh
bun run check:secrets
```

Install the pre-commit hook once per clone:

```powershell
# Windows
.\scripts\install-git-hooks.ps1
```

```sh
# macOS / Linux
sh scripts/install-git-hooks.sh
```

## If keys were previously committed

If real keys appeared in `.env.example` or any tracked file on GitHub:

1. **Rotate/revoke** the exposed keys immediately in each provider's dashboard:
   - [OpenRouter](https://openrouter.ai/keys)
   - [OpenCode Zen](https://opencode.ai/auth)
   - [Anthropic](https://console.anthropic.com/)
   - [OpenAI](https://platform.openai.com/api-keys)
   - [NVIDIA NIM](https://build.nvidia.com/)
   - Others as applicable
2. Put new keys only in `.env` or the in-app LLM settings.
3. If keys were ever pushed to a public remote, treat them as compromised even after removal from the latest commit.
4. Re-clone or `git fetch --all && git reset --hard origin/main` on other machines after any history cleanup on the remote.

## Reporting

If you discover a secret in this repository, open an issue or contact the maintainer privately. Do not paste the full key in public issues.
