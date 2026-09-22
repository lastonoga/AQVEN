---
title: Reference
description: Generated field-by-field reference for every YAML kind, CLI command, and diagnostic code.
---

Every page here is generated directly from AQVEN's real Python types and CLI — not hand-written, so it
never drifts from what the code actually accepts. If a how-to page shows you *how* to do something,
the matching reference page here is where you check the exact field list, type, and default.

A few starting points: [node specifications](/reference/nodes/) and [agent specification](/reference/agents/)
cover the YAML kinds you'll open most; [CLI](/reference/cli/) lists every `{{CLI_COMMAND}}` command;
[diagnostics and error codes](/reference/diagnostics/) explains what a failed `{{CLI_COMMAND}} check`
is telling you.

Two pages both mention "MCP" for opposite reasons — [MCP servers](/reference/mcp/) is the YAML spec for
declaring a server *AQVEN calls out to* (an external MCP server your tools reach), while
[project MCP tool reference](/reference/project-mcp-tools/) lists the tools *AQVEN itself exposes* to an
agent connecting to your project.
