---
name: debugging-runs
description: "Finds why an AQVEN run, node or series attempt failed or hangs: run_get_node, paged run_events, the first failing node, infra versus counted errors, the fix per code. Use when anything fails, or a series has infra errors or a stuck variant, before any fix; never restart the server."
---

## MUST

- Never start, stop, kill or restart the project server: project modules reload on the next run.
- Prove the cause with an event from the run, not with a guess.
- Read in small pieces: `run_get_node` and `run_events` with a small `limit`, not a whole `run_get` of a long run.
- Never repeat a paid run only to see the output in another format.
- Replacing a model of the owner's set needs the owner's yes.

## Procedure

| # | Step | Exit criterion |
|---|---|---|
| 1 | Get the `run_id`: a case row of the series (`cases[].attempts[].run_id`) or `run_list` (`flow_id`, `status: "failed"`) | a `run_id` |
| 2 | Read in bounds: `run_get_node` of suspect nodes (`include_payloads: "truncated"` by default, `"full"` only for one node); `run_events` with `after_seq` and a small `limit` (up to 200; without `after_seq` it returns the tail) | every tool answer under about 10,000 characters |
| 3 | The first failing node upstream; for a `map`, the item (`item_index`); for a `parallel`, the branch (`branch_key`) | node and item named |
| 4 | Class: infrastructure (`provider_error` including a 429 that outlasted its retries, `timeout`, `MODEL_STREAM_STALLED`, `provider_key_missing`, `MODEL_FEATURE_UNSUPPORTED`, `INTERNAL`, broken code) or a counted failure (`MODEL_SCHEMA_MISMATCH`, `MODEL_RETRIES_EXHAUSTED`, `OUTPUT_SCHEMA_REJECTED`, a failed check, `truncated`, `refusal`). Above 5% infrastructure errors make a series `invalid` | the class named |
| 5 | Group the attempts by error code and by variant | counts per code and variant |
| 6 | Code → cause → fix from the table below and `references/reference/error-codes.md` | the cause proven by an event |
| 7 | Reproduce cheaply: `run_fork` from the failing node's address (optionally with another `agent` or `input`), `run_resume` for a wait, or `run_start` with `mode: "live"` on one case | one run confirms the fix |
| 8 | What stays unexplained is reported as an anomaly, with its events | the anomaly written down |

| Code or symptom | Cause | Fix |
|---|---|---|
| `truncated`, `finish_reason: length` | the output did not fit `max_tokens` | the agent's `settings.max_tokens`; output limits in the prompt |
| `OUTPUT_SCHEMA_REJECTED` | the schema is too big for the model | `designing-output-contracts` |
| `MODEL_SCHEMA_MISMATCH` although the probe passed | `tool` mode does not hold the real schema | `prompted` first, then another model |
| `MODEL_NO_STRUCTURED_OUTPUT` | the output mode does not work live | `models check --live`, pin `output.mode` |
| `MODEL_FEATURE_UNSUPPORTED` | the provider refused a feature: images (the message names them), tools, structured output | `choosing-models`; the owner's model changes only with a yes |
| `provider_error` with HTTP 429 | the upstream limited the model; its lane paused (console line `<provider:model> rate-limited — pausing Ns, parallel 8→4` from logger `aqven.models.lanes`); a series attempt runs once more at the end | provider fallbacks, `fallback_models`, `on_rate_limit`; never `rpm` |
| another call error | `output.on_error` retries by default | read the retries in the node's events |
| `CODE_NOT_FOUND` after a code edit | a reference or a generated name | `uv run aqven refs`, `uv run aqven tree`; no restart needed |
| `NOT_RUNNABLE` at a series start | a case or variant cannot run | `problems[]` names the case and the variant |
| an attempt `running` without events for ten times its neighbours' median, later `MODEL_STREAM_STALLED` | the provider hangs; a silent stream is cut after 600 s, a call longer than `limits.seconds` ends in `timeout` | the agent's `limits.seconds` to cut sooner; `fallback_models` at another provider, with the owner's yes |
| `STALE_FILE` from `flow_patch` | the file changed since you hashed it | read it again and replay the intent |

## Pitfalls

| What goes wrong | Do instead |
|---|---|
| A flag that does not exist, and a paid rerun just to get another output format | read the stored run with `run_get_node` |
| A whole `run_get` and an unpaged `run_events` of a long run flooded the context | bounded reads, step 2 |
| A node that failed in every run was explained by a guess; `run_get_node` was never called | open the node and quote its event |
| Truncation found only after the owner pointed at it | check `finish_reason` first |
| `CODE_NOT_FOUND` on every variant turned a whole series into failed runs | a one-case smoke run before a series |
| A hanging variant blamed on a slow `rpm` | the table row for an attempt `running` without events |
| Infrastructure errors of some attempts were left out of the report | report them as an anomaly with the events you have |
| A value read back different from what was just written (a key that came back empty) | report it as an anomaly with the file and the read; do not work around it |

## Tools and commands

- `aqven` MCP `run_list`, `run_get_node`, `run_events`, `run_get`, `run_fork`, `run_resume`, `run_start`,
  `series_get`.
- `uv run aqven refs <kind>:<id> <package>`, `uv run aqven tree <package>`.

## References

- `references/mcp-cli/runs.md`: every run tool and its fields. Read before the first run tool call.
- `references/concepts/finding-the-node-that-went-wrong.md`: the first failing node and cascades. Read at step 3.
- `references/studio/investigate-a-run.md`, `references/studio/read-the-dev-console.md`: what the owner sees and
  the console lines. Read when you point the owner to a run.
- `references/concepts/what-happens-when-a-model-is-called.md`: outcomes, retries and policies. Read at step 4.
- `references/reference/error-codes.md`: every run-time error code with its class and fix, generated from the
  engine. Read at step 6 for a code this skill does not name.
- `references/reference/diagnostics.md`: every `aqven check` code. Read when a run fails on something `check`
  should have caught.
