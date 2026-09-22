---
title: How to connect an external MCP server
description: Register a remote MCP server in aqven.yaml and give its tools to an agent, either the whole server or one named tool at a time.
---

## When you need this

Use this when an agent needs tools that already live behind someone else's MCP server — a helpdesk, a
CRM, an internal API your team already exposed over MCP — instead of tools you write yourself. This is
the opposite direction from [How to connect AQVEN as an MCP server](/mcp-cli/connect-an-agent/): that
page connects a coding agent *to* AQVEN, so it can read and edit your project. This page connects AQVEN
*out* to someone else's MCP server, so one of your own agents can call its tools.

## Steps

- Declare the server in its own file, `mcp/<server_id>.yaml`: `kind: "McpServer"`, a `description`, a
  `url`, and `transport: "streamable_http"`. That's the only transport an external server supports —
  there's no stdio option here, unlike AQVEN's own MCP server, which offers a stdio bridge alongside HTTP.
- If the server needs authentication, add `headers`: a list of `{name, value}` pairs, where `value` is a
  `ref:env/NAME` pointing at the environment variable holding the credential, the same secret format used
  everywhere else in the project. A header is the only way to authenticate to an external server — there's
  no OAuth flow and no client-certificate option.
- Attach the server to an agent one of two ways:
  - **The whole server**: add its id to the agent's own `mcp_servers` list. The agent gets every tool the
    server exposes, without listing them one by one.
  - **One tool**: write a `tools/<tool_id>.yaml` file whose source is `mcp: {server, tool}` instead of
    `run`, naming the server and the exact remote tool to wrap. That file becomes an ordinary project
    tool, added to an agent's `tools` list the same way as a tool backed by your own code. [How to give an
    agent a tool](/engine/tool-node/) covers the rest of a tool's contract; the one thing specific to an
    MCP-sourced tool is that it skips `in`, `out`, and `wait` entirely, because the remote server supplies
    its own schema, and it can't be the target of a `tool` node — only an agent's `tools` list, so the
    model calls it directly.
- Nothing in the project checks that the remote server's tool schema still matches what you expect — `aqven
  check` validates the shape of your YAML, not the live server on the other end of the URL.

### Example

The showcase project's `helpdesk` server, `mcp/helpdesk.yaml`, uses one URL and one bearer token:

```yaml
apiVersion: "aqven/v1"
kind: "McpServer"
description: "Lumen helpdesk MCP server: past tickets and reply macros"
transport: "streamable_http"
url: "https://helpdesk.lumen.example/mcp"
headers:
- name: "Authorization"
  value: "ref:env/LUMEN_HELPDESK_TOKEN"
```

The project attaches it both ways at once. The `researcher` agent takes the whole server:

```yaml
mcp_servers:
- "helpdesk"
```

and `tools/find_tickets.yaml` wraps one specific remote tool from that same server:

```yaml
apiVersion: "aqven/v1"
kind: "Tool"
description: "Look up a customer's past helpdesk tickets"
mcp:
  server: "helpdesk"
  tool: "search_tickets"
effect: "read"
```

which the `resolver` agent then lists in its own `tools`, right next to tools backed by its own code:

```yaml
tools:
- "lookup_order"
- "issue_store_credit"
- "find_tickets"
```

## See also

- [How to connect AQVEN as an MCP server](/mcp-cli/connect-an-agent/) — the other direction: a coding
  agent connecting to AQVEN itself.
- [How to give an agent a tool](/engine/tool-node/) — the full shape of a `Tool` file and how a `tool`
  node binds values into one, for tools backed by your own code.
- [How to set a secret for a provider, tool, or MCP server](/integrations/secrets-and-environment/) — how
  to set the environment variable a header's `ref:env/NAME` points at.
- [How to manage secrets](/engine/secrets/) — confirming a declared header secret is actually set, without
  ever printing its value.
- [MCP servers reference](/reference/mcp/) — every field on `McpServerSpec`, generated from the code.
