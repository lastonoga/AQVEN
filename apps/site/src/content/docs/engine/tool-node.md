---
title: How to give an agent a tool
description: Add a tool node that runs a piece of code you wrote, with a typed contract, its own secrets, and an optional wait for a long-running job.
---

## When you need this

Use a `tool` node whenever a step needs to reach outside the flow itself: call an internal API, hit a
paid service, write to an external system, or start a job that takes longer than one request and wait
for it to finish. A `code` node's function is always synchronous plain Python; the moment a step needs
`async`, a network call, or a wait, it's a `tool` node instead.

## Steps

- Write the tool's contract in its own file, `tools/<tool_id>.yaml`: `kind: "Tool"`, a `description`,
  an `effect` (`read`, `write`, or `external`), and exactly one source — `run`, a reference to your own
  async Python function, or `mcp: {server, tool}`, a tool from an external MCP server already
  registered in the project.
- For a `run` tool, declare `in` and `out` on the tool file itself: `in` — the fields your function
  takes, each with a `name`, `type`, and `description` — and `out` — the fields it returns, at least
  one. A tool has no separate node-level contract; the node just binds values into the fields the tool
  already declares.
- Write the function. Its first parameter is `ToolContext`, imported from `aqven.runtime` — an HTTP
  client, your declared secrets, and, for a write or external tool, an idempotency key AQVEN derives
  for you — followed by one parameter per `in` field, same names, same order. Return a record built
  from the `out` fields.
- If the call needs a credential, declare it under `secrets` — a name plus a reference to an
  environment variable — and read it back inside the function through the tool context instead of the
  process environment directly.
- If a write or external tool must not double-run on a retry, add `idempotency_key`: the `in` field
  names AQVEN hashes into a key it hands your function, so a retried call and the original share one.
- If the call starts a job instead of returning its result right away, add `wait`: a `poll` function
  reference plus `interval_seconds` and `timeout_seconds`. The node keeps polling until the job reports
  done or failed, or the timeout passes.
- An `mcp`-sourced tool skips `in`, `out`, and `wait` entirely — the server supplies its own schema. It
  also can't be the target of a `tool` node: give it to an agent's own `tools` list instead, so the
  model calls it directly during an `llm` node. [How to connect an external MCP
  server](/integrations/external-mcp-servers/) covers the rest of that setup.
- Write the node file, `<stem>.node.yaml`: `node: "tool"`, a `description`, `tool` (the tool's id), and
  `in` — the bindings that pull values from the flow's input or earlier nodes into the fields the tool
  declares.
- A `run` tool's reference accepts the same shorthand a `code` node's `run` does: a bare function name
  resolves to the `.py` file next to the tool's own YAML file. Grouping several tool functions in one
  shared file and pointing `run` at it explicitly works too — both are just a reference to
  `module:function`.

### Example

This is the showcase project's `search_kb` node, one of three `tool` nodes in its `support_case` flow.
Create it yourself with:

```bash
{{CLI_COMMAND}} new my_project --template showcase
```

Its node file lives at `flows/support_case/nodes/search_kb/search_kb.node.yaml`. The showcase is
written for a Russian-market storefront, so its descriptions are in Russian; the file below is
translated to English for this page. It carries no contract of its own, only a `tool` reference and
bindings:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "tool"
description: "Finds knowledge-base chunks and store policies for the case"
tool: "search_kb"
in:
  - name: "query"
    from: "$triage.out.summary"
  - name: "category"
    from: "$triage.out.category"
  - name: "locale"
    from: "$input.customer.locale"
  - name: "tenant"
    from: "$run.context.tenant_id"
```

`in` bindings read from three places here: `$triage.out.*` pulls from the `triage` node earlier in the
flow, `$input.customer.locale` pulls straight from the flow's own input, and `$run.context.tenant_id`
pulls from the run's context — a value the flow declares it needs from the caller, not from any node.

Its tool lives at `tools/search_kb.yaml` and declares the typed contract plus how it runs:

```yaml
apiVersion: "aqven/v1"
kind: "Tool"
description: "Search knowledge-base chunks and service policies by what the case is about"
run: "@root.tools.functions:search_kb"
effect: "read"
secrets:
  - name: "kb_token"
    ref: "ref:env/LUMEN_KB_TOKEN"
in:
  - name: "query"
    type: "Text"
    description: "The search query: a short summary of the case"
    maxLength: 600
  - name: "category"
    type: "ProductCategory"
    description: "The product category to filter articles by"
  - name: "locale"
    type: "Locale"
    description: "The articles' language"
  - name: "tenant"
    type: "TenantId"
    description: "The tenant whose knowledge base this searches"
out:
  - name: "chunks"
    type: "KbChunk[]"
    description: "The matched article chunks"
    maxItems: 80
  - name: "policies"
    type: "Policy[]"
    description: "The applicable service policies"
    maxItems: 20
```

`search_kb`, in `tools/functions.py`, matches that contract: a tool context first, then `query`,
`category`, `locale`, `tenant` in the same order, returning the generated `SearchKbOut` record:

```python
async def search_kb(
    ctx: ToolContext,
    query: Annotated[str, StringConstraints(max_length=600)],
    category: ProductCategory,
    locale: Locale,
    tenant: TenantId,
) -> SearchKbOut:
    response = await ctx.http.get(
        KB_SEARCH_URL,
        params={"query": query, "category": category, "locale": locale, "tenant": tenant},
        headers=_bearer(ctx.secret("kb_token")),
    )
    response.raise_for_status()
    return SearchKbOut.model_validate_json(response.content)
```

`ctx.secret("kb_token")` reads the value AQVEN resolved for the `kb_token` secret declared on the tool
— the actual token never appears in the YAML, only a reference to where it lives.

The showcase's other two `tool` nodes, `clip` and `voice`, call tools that return media instead of
text, and `clip`'s tool also declares `wait`, because rendering a video takes longer than one request.

## See also

- [How to write a step in Python](/engine/code-node/) — the node kind for deterministic logic that
  never leaves the process.
- [How to connect an external MCP server](/integrations/external-mcp-servers/) — registering a server
  and giving its tools to an agent.
- [The engineering loop](/concepts/engineering-loop/) — what to do when a run's output isn't what you
  expected.
- [Node specifications](/reference/nodes/) — every field on `ToolNodeSpec`, generated from the code.
- [Tool specification](/reference/tools/) — every field on `ToolSpec`, including `wait` and
  `idempotency_key`.
