# CLI commands

Generated command registry from the AQVEN Python package.

The command names and help text below come from `aqven.cli.COMMANDS`. Use `uv run aqven COMMAND --help` for the parser flags in the installed version.

| Command | Help | Availability |
| --- | --- | --- |
| `aqven new` | create a project from a template, install its environment with uv sync and generate its models | Available |
| `aqven check` | check the project statically and simulate every flow without network or tokens | Available |
| `aqven generate` | generate Pydantic models of all types and inference inputs and outputs into types.py | Available |
| `aqven schema` | write JSON Schema of definition models to .aqven/schema/ for the editor | Available |
| `aqven tree` | all module entities by kind with file paths | Available |
| `aqven refs` | where an entity is defined, what references it and what it references | Available |
| `aqven fmt` | format YAML canonically | Pending |
| `aqven plan` | semantic diff against a release and gate status | Pending |
| `aqven build` | build the module wheel with IR | Pending |
| `aqven run` | run a flow locally without a server and print run events as they appear | Available |
| `aqven dev` | start the project server, watch project files and open Studio in the browser | Available |
| `aqven studio` | alias of dev: start the project server, watch project files and open Studio in the browser | Available |
| `aqven serve` | project server without a browser: Studio API, engine and MCP | Available |
| `aqven mcp` | MCP over stdio: connects to the project server or starts it in the background without a browser | Available |
| `aqven models` | model providers of the project | Available |
| `aqven secrets` | every secret the project declares, where it comes from and whether it is set | Available |
| `aqven prompt` | prompts of llm nodes | Available |
| `aqven series` | run a series of an experiment on the project server and wait for its verdict | Available |
| `aqven skills` | the aqven skills and agent rules of a project for Claude Code and Codex outside Studio | Available |
| `aqven hook` | answer one Claude Code hook event read from stdin with reminders for the agent; it never blocks a tool call; hooks: reminders, compaction | Available |

Pending commands are registered for future use but return `not implemented`; do not put them in automation. How to check a project before committing shows a working command sequence.
