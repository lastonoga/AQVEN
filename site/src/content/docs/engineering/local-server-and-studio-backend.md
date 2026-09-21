---
title: Local Server and Studio Backend
description: Understand the local project server, file watcher, run data, Studio, REST API, and MCP boundary.
---

`uv run {{CLI_COMMAND}} dev .` starts one local project server with its backend and Studio. It watches project source files, maintains local run data, serves REST and MCP interfaces, and opens the browser UI. `serve` starts the same server without opening Studio.

The server is scoped to the selected project. Studio reads project definitions and backend data; it does not own another workflow format. Use the [HTTP API](/engineering/http-api/) or [Project MCP Server](/engineering/project-mcp-server/) when another process needs to interact with the same project.
