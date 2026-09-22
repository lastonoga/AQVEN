@AGENTS.md

The `aqven` MCP server from `.mcp.json` gives you the actions the files cannot do. Definitions are files, so read
them with Read, Grep and Glob and edit prompts and single fields with Edit and Write; there is no tool that lists or
fetches the project for you, on purpose.

| What you want | Tool |
|---|---|
| Structural or cross-file edit | `flow_patch` |
| Check after every edit | `aqven_check`; for code also `pyright_check` and `pytest_run` |
| See what a prompt really sends | `prompt_preview` |
| Run and watch | `run_start`, then `run_get` and `run_events`; also `run_list`, `run_get_node`, `run_resume`, `run_fork`, `run_cancel` |
| Datasets and evals | `dataset_batch_start`, `dataset_batch_get`, `eval_run_start`, `eval_run_get`, `eval_gate` |

`flow_patch` takes `expects[{path, file_hash}]`: `"sha256-"` plus the sha256 of the current bytes of every file the
operations touch. Compute it yourself from the file you just read.

The hooks in `.claude/settings.json` run `aqven check --static` after each file edit and the full `aqven check`
(static plus the simulated runs) when you stop, and hand you their diagnostics.

`aqven check` is the gate of this project: static rules plus a simulated run of every flow with generated
values. The scenario tests in `tests/` replay recorded real-model runs on top of it.
