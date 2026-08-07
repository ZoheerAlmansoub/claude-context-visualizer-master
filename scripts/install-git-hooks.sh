#!/usr/bin/env sh
# Installs repo-local git hooks from .githooks/
set -e
cd "$(dirname "$0")/.."
git config core.hooksPath .githooks
echo "Git hooks installed (core.hooksPath = .githooks)"
echo "Pre-commit will run: bun scripts/check-secrets.ts --staged"
