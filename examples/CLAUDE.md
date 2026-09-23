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
| Try one dataset case | `run_start` with `dataset_item_id: "<dataset_id>/<case_name>"` |
| Measure an experiment | write `experiments/<id>/experiment.yaml` and `aqven_check` it, then `series_start` on `dev` and `series_get` with `wait_seconds`; `series_cancel` stops one; run `holdout` once, for the deciding series |
| Look at a few named cases | `series_start` with `look: {flow_id, dataset_id, case_names}`: no verdict, no finding |
| What the project already knows | read `FINDINGS.md` at the module root and `experiments/<id>/findings/`; never edit them |

`flow_patch` takes `expects[{path, file_hash}]`: `"sha256-"` plus the sha256 of the current bytes of every file the
operations touch. Compute it yourself from the file you just read.

Quote a series verdict exactly as `series_get` returns it in `verdict.text`. A series whose estimate is above the
project spend cap waits in `awaiting_approval`: only a person approves it, in Studio or with
`POST /api/series/<series_id>/approve`; there is no tool for that.

The hooks in `.claude/settings.json` run `aqven check --static` after each file edit and the full `aqven check`
(static plus the simulated runs) when you stop, and hand you their diagnostics.

`aqven check` is the gate of this project: static rules plus a simulated run of every flow with generated
values. The scenario tests in `tests/` replay recorded real-model runs on top of it.
