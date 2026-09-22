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

Run `{{CLI_COMMAND}} mcp` from the project folder. It doesn't implement its own tool server — it
bridges stdio to AQVEN's own HTTP server, starting a headless copy of that server in the background
first if one isn't already running for this project. You don't start anything yourself; the same
command does both.

For Claude Code, the concrete command is:

```bash
claude mcp add --scope project aqven -- uv run aqven mcp
```

This is the exact command shown in Studio's own **MCP connections** panel (see
[How to check Studio's settings](/studio/settings/)). Run it once from the project folder in an
ordinary terminal, and that Claude Code session gets the same 18 tools Studio's chat already calls.

Any other agent that starts an MCP server over stdio can use `{{CLI_COMMAND}} mcp` the same way —
point its MCP config at that command, run from the project folder.

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

[How to check and test a project as an agent](/mcp-cli/check-and-test/) — the first two tools to call
once you're connected.
