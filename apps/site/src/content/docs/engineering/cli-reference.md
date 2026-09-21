---
title: CLI Reference
description: Current commands and their main purpose.
---

Run these commands from a project environment with the current `{{CLI_COMMAND}}` CLI. For exact flags, use `uv run {{CLI_COMMAND}} COMMAND --help`.

| Command | Purpose |
| --- | --- |
| `new PATH` | Create a `minimal` or `showcase` project. |
| `check PATH` | Validate and simulate a project; `--static` skips simulation. |
| `generate PATH` | Regenerate Pydantic models from YAML definitions. |
| `schema PATH` | Write editor JSON Schemas into `.aqven/schema/`. |
| `tree PATH` | List entities and source paths. |
| `refs KIND:ID PATH` | Find an entity and its references. |
| `run FLOW --input FILE` | Run a flow locally and print events. |
| `dev [PATH]` / `studio [PATH]` | Start the local project server and open Studio. |
| `serve [PATH]` | Start the server without opening a browser. |
| `mcp [PATH]` | Expose the project MCP bridge over stdio. |
| `models check` | Inspect model and output-mode compatibility. |
| `prompt preview FLOW.NODE` | Render a model request without calling a provider. |
| `eval PATH --eval ID` | Run a defined evaluation. |
| `secrets` | Manage project secrets through the CLI. |

The CLI parser also lists `fmt`, `plan`, `build`, and `optimize`, but those commands currently return “not implemented.” Do not add them to scripts yet. [Quickstart](/engineering/quickstart/) shows the shortest working sequence.
