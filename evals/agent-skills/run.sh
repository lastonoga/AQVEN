#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
evals="$repo/evals/agent-skills"
inputs="$repo/build/eval-inputs"
claude="$repo/.venv/lib/python3.14/site-packages/claude_agent_sdk/_bundled/claude"
setups="${SKILL_EVAL_SETUPS:-eval-plugin eval-plugin-core eval-plugin-template}"
model="claude-haiku-4-5"

build_only=false
if [ "${1:-}" = "--build-only" ]; then
  build_only=true
  shift
fi

cd "$repo"
nice -n 15 uv run --frozen python "$evals/fixtures/make_fixture.py"
nice -n 15 uv run "$evals/fixtures/make_images.py"
nice -n 15 uv run --frozen python "$evals/mcp_tools.py" --check
nice -n 15 uv run --frozen python "$evals/check_mocks.py"
nice -n 15 uv run --frozen python "$evals/host_block.py" --out "$inputs/host-block.md"
nice -n 15 uv run --frozen python tools/build_eval_plugin.py \
  --host-block "$inputs/host-block.md" \
  --template "$evals/baseline/AGENTS.md.tmpl" \
  --package "." \
  --project-root "the current working directory"

if [ "$build_only" = true ]; then
  exit 0
fi

ablation_of() {
  if [ "$1" = "eval-plugin" ]; then
    echo "with-without"
  else
    echo "none"
  fi
}

status=0
for setup in $setups; do
  target="$repo/build/$setup"
  env -u CLAUDECODE -u CLAUDE_CODE_SESSION_ID -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_EXECPATH -u CLAUDE_PID \
    nice -n 15 "$claude" plugin eval "$target" \
    --ablation "$(ablation_of "$setup")" \
    --scaffold \
    --allow-tools Write Edit Bash \
    --trust-plugin \
    --no-publish \
    -j 2 \
    --model "$model" \
    --judge-model "$model" \
    --max-cost-usd 20 \
    --json "$target/results.json" \
    "$@" || status=$?
done
exit "$status"
