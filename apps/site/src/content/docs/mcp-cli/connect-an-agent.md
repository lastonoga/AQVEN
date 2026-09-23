---
title: How to connect AQVEN as an MCP server
description: Connect a coding agent to AQVEN as an MCP server, either through the simple stdio bridge or directly over streamable HTTP.
---

## What you'll have at the end

A coding agent connected to this AQVEN project with the same 18 tools Studio's own chat calls: check
and test the project, edit a flow's structure, start and follow runs, run datasets and evals, and
preview a prompt.

## Before you start

You need:

- A working AQVEN project — see [Quickstart](/start/quickstart/) if you don't have one yet.
- An agent with an MCP client: Claude Code, Cursor, Claude Desktop, or anything else that speaks MCP.

## 1. Connect the simple way

`{{CLI_COMMAND}} mcp` doesn't implement its own tool server — it bridges stdio to AQVEN's own HTTP
server, starting a headless copy of that server in the background first if one isn't already running
for this project. You don't start anything yourself; the same command does both.

It needs to know which project to serve. It looks for `aqven.yaml` in the folder it runs in and the
folders above it, never below — so from the outer folder `{{CLI_COMMAND}} new` created, name the inner
project folder: `uv run {{CLI_COMMAND}} mcp <package>`. Without it, the command stops with
`E_PROJECT_NOT_FOUND`.

**Claude Code, in a project from `{{CLI_COMMAND}} new`.** Nothing to add: the project's `.mcp.json`
already registers `uv run {{CLI_COMMAND}} mcp <package>`. Start Claude Code in the outer folder and
approve the `aqven` server when it asks.

**Claude Code, anywhere else.** Register the server once:

```bash
claude mcp add aqven -- uv run --directory /absolute/path/to/project {{CLI_COMMAND}} mcp
```

`/absolute/path/to/project` is the folder with `aqven.yaml`. `--directory` makes the command work
from whatever folder Claude Code starts in, and the server is registered for the folder you run this
in. This is the exact command shown in Studio's own **MCP connections** panel, with the project's path
already filled in (see [How to check Studio's settings](/studio/settings/)).

**Any other agent** that starts an MCP server over stdio runs the same command — point its MCP config
at `uv` with the arguments `run`, `--directory`, `/absolute/path/to/project`, `{{CLI_COMMAND}}`, `mcp`.

### Check

Ask the connected agent to call `aqven_check`. A working connection returns a JSON result with `ok`,
`errors`, `warnings`, and a `diagnostics` list — not a connection error.

## 2. Connect directly over HTTP, if your client speaks it

Skip the stdio bridge if your MCP client already speaks streamable HTTP itself. AQVEN's server exposes
one MCP endpoint at `/mcp/` (note the trailing slash) on the same local address as Studio itself:
`http://127.0.0.1:<port>/mcp/`, loopback only.

Start the server if it isn't already running — `{{CLI_COMMAND}} serve`, `{{CLI_COMMAND}} dev` /
`{{CLI_COMMAND}} studio`, or step 1's `{{CLI_COMMAND}} mcp` all start the same server. Then read the
exact address and token from `.aqven/server.json` in the project folder:

```json
{
  "host": "127.0.0.1",
  "port": 5180,
  "token": "<random token>",
  "mcp_url": "http://127.0.0.1:5180/mcp/",
  "project_root": "/path/to/project"
}
```

Point your client at `mcp_url` and send the token as `Authorization: Bearer <token>`.

**Auth is off by default.** Unless this server was started with `--require-auth`, AQVEN does not check
that header at all — any request that reaches the port runs every tool, bearer token or not. The
address is loopback-only, so only something on the same machine can reach it, but if you do want the
check enforced, start the server with `--require-auth` and send the bearer token on every request.

## What's next

- [How to set up a coding agent outside Studio](/mcp-cli/set-up-an-agent-outside-studio/) — the setup
  prompt that makes an agent you started yourself read the project's rules and check this connection.
- [How to check and test a project as an agent](/mcp-cli/check-and-test/) — the first two tools to call
  once you're connected.
