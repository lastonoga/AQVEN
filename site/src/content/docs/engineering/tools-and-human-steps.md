---
title: Tools Overview
description: Call external capabilities, handle side effects, and wait for typed human decisions.
---

Use a `tool` for an external operation or a capability an agent may call. Use a `human` node when a person must supply a value before the workflow continues. Both have explicit contracts so a run trace can show what was requested and what happened.

## Define a code-backed tool

This tool reads a knowledge base. Its YAML file lives in `tools/search_articles.yaml`:

```yaml
apiVersion: "aqven/v1"
kind: "Tool"
description: "Find articles relevant to a query"
run: "@root.tools.functions:search_articles"
effect: "read"
in:
  - name: "query"
    type: "Text"
    description: "Words to search for"
    maxLength: 600
out:
  - name: "articles"
    type: "Article[]"
    description: "Matching articles"
    maxItems: 20
```

The Python function must accept the declared input and return the declared output. A `tool` node binds values into the tool:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "tool"
description: "Retrieve articles for the prepared query"
tool: "search_articles"
in:
  - name: "query"
    from: "$prepare.out.query"
```

The output is available as `$search.out.articles` if this node's ID is `search`. Changing the tool's `out` contract affects every node that reads its result.

### Side effects and retries

Set `effect` to `read`, `write`, or `external` to describe what the tool does. A write or external action should have an idempotency strategy, because durable execution can retry work after an interruption. The tool spec accepts `idempotency_key`, a list of input paths used to identify the same operation, and `secrets`, environment-backed values passed to the tool. A long-running job can use `wait` with a polling function, interval, and timeout. See the generated [Tool reference](/engineering/reference/tools/) for the exact fields and bounds.

### Use an MCP tool

An MCP-backed tool names the server and tool instead of a Python `run` function:

```yaml
apiVersion: "aqven/v1"
kind: "Tool"
description: "Look up an issue in the connected tracker"
mcp:
  server: "tracker"
  tool: "get_issue"
effect: "read"
```

An MCP tool takes its input and output schema from the server. Do not add `in`, `out`, or `wait` to this definition. A tool spec must set exactly one of `run` and `mcp`.

## Wait for a person

This complete node asks a reviewer to submit a typed `Approval` form:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "human"
description: "Review the proposed answer before sending"
form: "Approval"
assignee: "reviewer"
timeout_seconds: 14400
on_timeout:
  policy: "escalate"
  assignee: "review_manager"
  timeout_seconds: 7200
in:
  - name: "reply"
    type: "Text"
    description: "Draft the reviewer should inspect"
    from: "$draft.out.reply"
```

The run waits until the form is answered or the timeout policy acts. Policies are `fail`, `default` (with a literal `value`), and `escalate` (with another assignee and timeout). A default can keep a run moving, but it must be a safe, valid form value. DBOS supplies the durable wait and resume path. [Studio Review](/studio/human-review/) shows pending work and the submitted answer.

An agent can also require approval before specific tools through its `approval` field. See the generated [Agent reference](/engineering/reference/agents/#toolapprovalspec).
