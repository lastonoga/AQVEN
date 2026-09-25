#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
evals="$repo/evals/agent-skills"
inputs="$repo/build/eval-inputs"
target="$repo/build/eval-plugin-triggers"
claude="$repo/.venv/lib/python3.14/site-packages/claude_agent_sdk/_bundled/claude"
model="claude-haiku-4-5"

build_only=false
if [ "${1:-}" = "--build-only" ]; then
  build_only=true
  shift
fi

cd "$repo"
nice -n 15 uv run --frozen python "$evals/triggers/check_triggers.py"
nice -n 15 uv run --frozen python "$evals/host_block.py" --out "$inputs/host-block.md"
nice -n 15 uv run --frozen python tools/build_eval_plugin.py \
  --suite triggers \
  --host-block "$inputs/host-block.md" \
  --package "." \
  --project-root "the current working directory"

if [ "$build_only" = true ]; then
  exit 0
fi

env -u CLAUDECODE -u CLAUDE_CODE_SESSION_ID -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_EXECPATH -u CLAUDE_PID \
  nice -n 15 "$claude" plugin eval "$target" \
  --ablation none \
  --trust-plugin \
  --no-publish \
  -j 2 \
  --model "$model" \
  --judge-model "$model" \
  --max-cost-usd 5 \
  --json "$target/results.json" \
  "$@"
