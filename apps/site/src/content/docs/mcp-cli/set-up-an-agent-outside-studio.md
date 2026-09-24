---
title: How to set up a coding agent outside Studio
description: Register AQVEN's MCP server and paste one setup prompt into Claude Code, Codex, or any MCP client you start yourself, so it reads the project's rules and connects the way Studio's chat does.
---

## When you need this

Studio's [chat panel](/studio/chat/) prepares its agent before your first message. It starts the agent in
the project folder, adds the project's `AGENTS.md`, `CLAUDE.md` and `FINDINGS.md` to the agent's
instructions, connects the `aqven` MCP server, and blocks reads of `.env` files and `.aqven/server.json`.

An agent you start yourself — in a terminal, an editor, or a desktop app — gets only what its own client
picks up. Use this page when you'd rather work in that agent directly: register the server once, paste one
prompt, and the agent sets itself up the same way Studio's chat is set up.

## What your agent picks up without help

| | Claude Code | Codex | Any other MCP client |
|---|---|---|---|
| Project rules | `CLAUDE.md`, which pulls in `AGENTS.md` | `AGENTS.md` only, not `CLAUDE.md` | depends on the client |
| `aqven` MCP server | from `.mcp.json`, once you approve it | not from `.mcp.json` — register it in step 1 | register it in step 1 |
| Check after every edit | hooks in `.claude/settings.json` run `{{CLI_COMMAND}} check` | none — the prompt asks for it | none — the prompt asks for it |

`{{CLI_COMMAND}} new` writes `AGENTS.md`, `CLAUDE.md`, `.mcp.json` and `.claude/` into every project it
creates. A project set up any other way may be missing them, and then the prompt below has less to read.

## Before you start

You need:

- A project created with `{{CLI_COMMAND}} new` — see [Quickstart](/start/quickstart/).
- `uv` on your `PATH`: the MCP server runs as `uv run {{CLI_COMMAND}} mcp`.
- The project root: the folder with `pyproject.toml`, `AGENTS.md` and `CLAUDE.md`. The AQVEN module sits
  one level down, in the folder with `aqven.yaml`. Below, `<package>` stands for that folder's name.

`{{CLI_COMMAND}} mcp` looks for `aqven.yaml` only in the folder it starts in and above it, so from the
project root it needs `<package>` as its argument.

## 1. Register the MCP server before the session starts

Claude Code and Codex both load MCP servers only when a session starts. Register the server first, or the
agent can do nothing but ask you to restart.

**Claude Code.** Nothing to register: `.mcp.json` at the project root already declares `aqven`. Start
`claude` in the project root and approve the `aqven` server when Claude Code asks. `/mcp` shows whether it
connected.

**Codex.** Add the server to the project's own `.codex/config.toml`. Codex reads a project config only in a
folder you've marked as trusted.

```toml
[mcp_servers.aqven]
command = "uv"
args = ["run", "{{CLI_COMMAND}}", "mcp", "<package>"]
required = true
```

`required = true` makes the session fail to start when the server can't come up, instead of quietly
starting without it — the same setting Studio uses when it runs Codex. Start `codex` in the project root;
`/mcp` lists the servers that connected. `codex mcp add aqven -- uv run {{CLI_COMMAND}} mcp <package>`
registers the same server, but in your global `~/.codex/config.toml`, so Codex then tries to start it in
every folder, not just this project.

**Any other client** — Cursor, Claude Desktop, anything else that starts MCP servers over stdio. Register a
server named `aqven` that runs this command:

```bash
uv run --directory /absolute/path/to/project {{CLI_COMMAND}} mcp <package>
```

`--directory` makes `uv` switch to the project root first, so the command works whatever folder the client
starts it in. If your client speaks streamable HTTP instead of stdio, see
[How to connect AQVEN as an MCP server](/mcp-cli/connect-an-agent/).

## 2. Paste the setup prompt

Start a new session in the project root and send this as its first message. The agent finds the module,
reads the rules, checks the server, and reports back before it touches anything.

```text
This folder is an AQVEN project. Before any task, set yourself up the way AQVEN Studio sets up its own chat agent.

1. Find the project. This folder should hold pyproject.toml, AGENTS.md and CLAUDE.md. The AQVEN module is the folder that contains aqven.yaml, usually one level below this one; call its path <package>. Every {{CLI_COMMAND}} command takes that folder as its path. If you find no aqven.yaml here or below, stop and ask me where the project is.

2. Read the rules. Read AGENTS.md and CLAUDE.md in full, even if your client already loaded one of them. Treat both as binding instructions for this whole session. Where they disagree with a habit of yours, follow the files. Then read FINDINGS.md in <package> if it exists: it is what this project already knows from its experiments, and you never edit it.

3. Connect the aqven MCP server. Look for its tools: aqven_check, flow_patch, prompt_preview, run_start, series_start.
   - If you have them, call aqven_check and go to step 4.
   - If you don't, the server is not connected. Do what applies to you, then stop:
     - Claude Code: .mcp.json already declares the server. Ask me to approve it with /mcp and restart the session.
     - Codex: write this to .codex/config.toml in this folder, then ask me to restart the session:
         [mcp_servers.aqven]
         command = "uv"
         args = ["run", "{{CLI_COMMAND}}", "mcp", "<package>"]
         required = true
     - Any other client: ask me to register a stdio server named aqven that runs `uv run {{CLI_COMMAND}} mcp <package>` in this folder, then restart the session.
   Don't work around a missing server. Without it you may read files and run `uv run {{CLI_COMMAND}} check <package>`, but never make a structural or cross-file change by hand: renaming or moving an entity, and adding or removing a node, go through flow_patch only.

4. Keep secrets out of the conversation. Never print the contents of a .env file or of .aqven/server.json. To see which keys are set, run `uv run {{CLI_COMMAND}} secrets <package>`; it shows masked values only.

5. Report, then wait. Reply with the rule files you read, whether the aqven MCP server is connected, and what aqven_check returned: its errors and warnings, or "clean". Then wait for my task. From then on, run aqven_check after every change, and never finish while it reports an error.
```

The prompt repeats what Studio does for its own agent, and it doesn't replace the rules: everything about
how to build and change this project stays in `AGENTS.md` and `CLAUDE.md`, which step 2 makes the agent
read.

### Check

The agent's first reply names both rule files, says the `aqven` server is connected, and quotes the result
of `aqven_check` — `ok`, `errors`, `warnings` and the `diagnostics` list. If it says the server isn't
connected instead, do what it asked in step 3, restart the session, and paste the prompt again.

## What's next

- [How to read a project's structure as an agent](/mcp-cli/read-project-structure/) — where the files live
  once the agent is connected.
- [How to check and test a project as an agent](/mcp-cli/check-and-test/) — the tools the agent runs after
  every change.
- [How an agent takes a task to a reliable flow](/mcp-cli/research-loop/) — what to hand the agent next,
  and the rounds it runs.
