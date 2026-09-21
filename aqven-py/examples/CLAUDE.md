@AGENTS.md

The `aqven` MCP server from `.mcp.json` provides the project tools: `flow_list` and `flow_get` to read the plan,
`flow_patch` for structural edits, `aqven_check` after every edit, `prompt_preview` after every prompt edit,
`pyright_check` and `pytest_run` for code, `run_start`, `run_get` and `run_events` to run a flow.

The hooks in `.claude/settings.json` run `aqven check --static` after each file edit and the full `aqven check`
(static plus the simulated runs) when you stop, and hand you their diagnostics.

`aqven check` is the gate of this project: static rules plus a simulated run of every flow with generated
values. The scenario tests in `tests/` replay recorded real-model runs on top of it.
