---
title: Project MCP Server
description: Connect a coding agent to an AQVEN project for checked inspection, edits, previews, and runs.
---

AQVEN exposes a project-aware MCP bridge. It is for a coding agent working on an existing project; it is not the same thing as an MCP server that a model agent can call as a tool.

## Start the bridge

From the directory containing `aqven.yaml`:

```bash
uv run {{CLI_COMMAND}} mcp .
```

The command attaches to a running project server or starts a headless project server, then proxies its MCP tools over standard input and output. Configure your coding-agent client to launch this command in the project environment.

## What the agent can do

| Need | MCP operations |
| --- | --- |
| Understand a project | `flow_list`, `flow_get`, `catalog_list`, `catalog_get` |
| Change flow structure | `flow_patch` |
| Validate a change | `aqven_check`, `pyright_check`, `pytest_run` |
| Inspect a model request | `prompt_preview` |
| Operate a run | `run_start`, `run_get`, `run_get_node`, `run_events`, `run_resume`, `run_fork`, `run_cancel` |

The agent should read first, make a structural edit with the project-aware patch tool when appropriate, then check the project. It should preview a changed prompt and test changed Python code. The bridge instructions enforce this working order.

## Editing safely

`flow_patch` uses file-version expectations. An agent first reads the flow, then sends the expected source versions with its patch. This prevents a blind edit from overwriting a concurrent change. Use ordinary file editing for a narrow text or Python change; use a project-aware patch for a structural or cross-file change.

## Keep the two MCP roles distinct

| MCP role | Consumer | Configuration |
| --- | --- | --- |
| Project MCP bridge | Coding agent | `{{CLI_COMMAND}} mcp .` |
| Project-defined MCP server | Model agent during a workflow run | `mcp/*.yaml` and an AQVEN tool definition |

Read [MCP Tools](/engineering/mcp-tools/) for model-agent tool use and [AI Coding Agents](/engineering/ai-coding-agents/) for the full change protocol. Exact tool schemas are generated in the [MCP reference](/engineering/reference/mcp/).
