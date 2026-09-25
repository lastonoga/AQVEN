# AQVEN

**Discover what your AI workflow needs to work reliably.** A Python framework and a local Studio for AI
workflows. Your coding agent runs the experiments. You see the evidence and decide.

**[Documentation](https://aqvenstudio.com)** · **[Quickstart](https://aqvenstudio.com/start/quickstart/)** · **[Use cases](https://aqvenstudio.com/use-cases/)** · **[Studio](https://aqvenstudio.com/studio/)** · **[GitHub](https://github.com/lastonoga/AQVEN)**

![AQVEN Studio showing a multi-step AI workflow on one canvas](https://raw.githubusercontent.com/lastonoga/AQVEN/main/apps/site/public/images/studio/canvas.png)

AQVEN keeps an AI workflow as typed files in your repository: a flow, one file per step, prompts in
Markdown, and declared types, agents and tools. `aqven check` validates every connection and simulates
every flow before you spend a token. Studio, a local browser app in the same install, shows each run
step by step. Your coding agent works on the same files through AQVEN's MCP server, and runs experiments
whose verdicts AQVEN computes.

AQVEN is in alpha: expect changes between releases.

## What it's for

- **Find.** *"What am I missing?"* Your agent explores cases and variants you wouldn't try yourself.
- **Explain.** *"Why did this fail?"* Follow a bad answer back to the step where it started.
- **Compare.** *"What should I change?"* Models and prompts side by side, with cost and latency.
- **Confirm.** *"Can I trust this change?"* A verdict on held-out cases that is allowed to say inconclusive.
- **Build.** *"How do I keep it readable as it grows?"* Typed files in your repo, checked before a run costs a token.

## Install

You need [uv](https://docs.astral.sh/uv/getting-started/installation/). AQVEN runs on Python 3.14, and uv
fetches it for you. Studio ships inside the package: no Node.js toolchain, nothing to build.

```bash
uv tool install aqven
aqven new my_project --template minimal --provider openrouter
cd my_project
uv run aqven check my_project
```

```text
errors: 0, warnings: 0
```

`aqven new` writes the project, installs its environment and generates typed Python models. It also
prepares the project for a coding agent: `AGENTS.md`, `CLAUDE.md`, an `.mcp.json` that registers AQVEN's
MCP server, and Claude Code hooks that run `aqven check` as the agent works. `aqven check` needs no API key
and no network.

## Work with your coding agent

Start Claude Code in the project, approve the `aqven` server, and hand it a task. It builds the flow,
explores on working cases and confirms once on held-out cases; you read the first traces and make the
decisions. Open Studio next to it with `uv run aqven dev my_project`.

For Codex, Cursor or another MCP client, see
[How to set up a coding agent outside Studio](https://aqvenstudio.com/mcp-cli/set-up-an-agent-outside-studio/).

## Commands

| Command | What it does |
| --- | --- |
| `aqven new` | creates a project from a template, installs its environment and generates its models |
| `aqven check` | checks the project and simulates every flow without network or tokens |
| `aqven run` | runs a flow locally and prints run events as they happen |
| `aqven dev` | starts the project server and opens Studio in the browser |
| `aqven serve` | the project server without a browser: Studio API, engine and MCP |
| `aqven mcp` | MCP over stdio, for a coding agent outside Studio |

## Built on

[Pydantic AI](https://ai.pydantic.dev/) calls the models, [DBOS](https://www.dbos.dev/) checkpoints every
run on SQLite, the official [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk) serves and
consumes MCP, and [FastAPI](https://fastapi.tiangolo.com/) serves Studio and the API. Runs locally.

## License

AQVEN is source-available, not open source, under the AQVEN License 1.0.0, based on
[PolyForm Shield 1.0.0](https://polyformproject.org/licenses/shield/1.0.0). Use it for any purpose,
including in production and in commercial products you build with it. You may not use it to provide a
product that competes with AQVEN, and you may redistribute AQVEN itself only free of charge and for a
non-commercial purpose. Full terms: [LICENSE](https://github.com/lastonoga/AQVEN/blob/main/LICENSE).

Copyright Kirill Burkhanov.
