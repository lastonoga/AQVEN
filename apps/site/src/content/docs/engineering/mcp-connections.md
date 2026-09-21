---
title: MCP Tools
description: Bring tools from a remote MCP server into an AQVEN model agent with a declared, checked boundary.
---

AQVEN has two MCP roles. This page is about an MCP server that gives **tools to a model agent**. The [Project MCP server](/engineering/project-mcp-server/) is a separate interface for a coding agent to inspect and change an AQVEN project.

Use a model-facing MCP connection when the server already owns a tool's schema and transport. Use a code-backed [tool](/engineering/tools-and-human-steps/#define-a-code-backed-tool) when the project should own the function and its input/output contract.

## Declare the server

Create `mcp/tracker.yaml`:

```yaml
apiVersion: "aqven/v1"
kind: "McpServer"
description: "Read issues from the internal tracker"
transport: "streamable_http"
url: "https://tracker.example.com/mcp"
headers:
  - name: "Authorization"
    value: "ref:env/TRACKER_TOKEN"
```

`transport` currently accepts `streamable_http`. The server address is explicit, and headers use secret references so credentials never enter source control. `schema_hash` is optional: add it when your delivery process records the tool schema that was approved for this project.

## Choose how an agent receives tools

An agent can use a server directly:

```yaml
# agents/support.yaml
apiVersion: "aqven/v1"
kind: "Agent"
description: "Investigate support requests"
model: "openai:your-model-id"
mcp_servers: ["tracker"]
```

This makes the MCP server's tools available to that agent. Restrict the server list to the capability needed by that role. A broad server can expose actions that do not belong in a particular task.

You can also select one remote tool and give it a project name:

```yaml
# tools/get_issue.yaml
apiVersion: "aqven/v1"
kind: "Tool"
description: "Read one issue from the tracker"
mcp:
  server: "tracker"
  tool: "get_issue"
effect: "read"
```

Then list `get_issue` in the agent's `tools`. This is useful when the same server offers both read and write operations and the agent should only see a small subset.

## Schema ownership changes the YAML

For a code-backed tool, AQVEN requires `run`, `in`, and `out`, because the project owns the contract. For an MCP-backed tool, the MCP server owns its schema. Set `mcp.server` and `mcp.tool`; do **not** add `run`, `in`, `out`, or `wait`.

| Tool source | Required | Prohibited | Contract comes from |
| --- | --- | --- | --- |
| Python code | `run`, `effect`, at least one `out` field | `mcp` | AQVEN project source |
| MCP server | `mcp.server`, `mcp.tool`, `effect` | `run`, `in`, `out`, `wait` | Connected MCP server |

A `tool` node still binds the values used by a declared project tool. Do not invent fields from a remote tool's documentation; inspect the connected server schema and test the call through a real project run.

## Apply approval to effects

Set `effect` to `read`, `write`, or `external` for every project tool. The label documents the expected impact and gives reviewers context. When an agent can request a sensitive tool, use its `approval` field:

```yaml
approval:
  tools: ["create_issue"]
  assignee: "support_lead"
  timeout_seconds: 1800
  on_timeout: {policy: "fail"}
```

This approval is distinct from a `human` node. It pauses a model-requested tool action; a human node asks the workflow for a typed form value. [Tool approval and human review](/engineering/tools-and-human-steps/#wait-for-a-person) explains the operational choice.

## Validate the boundary

1. Check the project files: `uv run {{CLI_COMMAND}} check .`.
2. Confirm the MCP URL and header secret are available to the backend process.
3. Use a read-only tool and a representative dataset case first.
4. Inspect the run trace in [Studio](/studio/runs/) before enabling a write or external tool.
5. Pin the declared server contract with `schema_hash` when a schema change requires review.

The generated [MCP reference](/engineering/reference/mcp/) and [Tool reference](/engineering/reference/tools/) list every accepted field and validation rule.
