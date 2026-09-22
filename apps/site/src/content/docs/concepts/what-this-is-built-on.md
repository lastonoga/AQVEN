---
title: What this is built on
description: Proven components under one workflow language, not a homegrown runtime.
---

## In short

AQVEN doesn't build its own durable-execution engine, LLM client, or protocol server. For the hard
infrastructure problems — surviving a crash mid-step, calling a model, speaking the MCP protocol,
serving HTTP — it takes proven, actively maintained open-source libraries and uses them directly. On
top of that it adds exactly one thing: a fixed layer of guarantees wrapped around every model call,
the same policy everywhere in the project, not something you set up per node.

## What AQVEN takes as-is

| Library | What we take |
|---|---|
| DBOS | Step checkpointing, suspend/resume for `human` nodes, SQLite locally |
| Pydantic AI | Calling the model, structured output |
| `mcp` (the official SDK) | The MCP protocol, both as a server and as a client |
| FastAPI | The HTTP/SSE transport — one process for HTTP, MCP, and Studio |
| python-liquid | Level-2 prompt templates |

DBOS durably checkpoints each step, so a crash or restart doesn't force you to redo work that already
finished. The same mechanism lets a run suspend at a `human` node and pick back up later — hours or
days later — without holding anything in memory while it waits. Locally, all of this runs on SQLite:
no separate database to install or run.

Pydantic AI is what actually talks to a model provider, sends the request, and turns the response into
structured output your workflow can use.

The `mcp` package is the official Model Context Protocol SDK. AQVEN uses it both directions: to expose
your project as an MCP server that a coding agent can drive, and as a client to connect to external MCP
servers as a source of tools for your workflows.

FastAPI is the one process behind everything AQVEN serves: the HTTP API, the server-sent event streams
that push run and edit updates, the MCP endpoint, and the static assets Studio loads in the browser. One
process, one port — nothing separate to start or keep in sync.

python-liquid renders level-2 prompt templates, the middle tier between a plain instruction string and a
full code function. It's real Liquid syntax, so a prompt template can do the same things a Shopify theme
template can:

```liquid
Hello {{ customer.name }}, thanks for reaching out about {{ case.subject }}.
{% if case.priority == "urgent" %}This case is marked urgent — reply within the hour.{% endif %}
```

## What AQVEN adds on top

Every model call, in every node, goes through one more layer before it reaches a provider and before
its result comes back — a fixed set of guarantees sitting on top of Pydantic AI. This isn't something
you turn on per node; it's the same for every call in the project.

A call always ends in one of a small number of clear outcomes, not "whatever came back." If a provider
cuts a response short because it hit a length limit, or refuses to answer, AQVEN turns that into a
distinct, explicit result — succeeded, cut off, or refused — instead of quietly handing you a
truncated or empty answer to puzzle over.

Common types of personal data — email addresses, phone numbers, card numbers, IBANs, IP addresses — are
pattern-matched and redacted automatically out of the raw model output that ends up in error details
and traces, so debugging a failed call doesn't mean leaking sensitive content into your observability
tooling.

And every call shares the same concurrency limits and retry policy: the number of calls in flight is
capped, and a call that hits a rate limit or a transient failure — a timeout, a server error, a dropped
connection — is retried automatically with backoff, honoring the provider's own retry-after hint when it
sends one.

## How this shapes what you do

You don't wire up retry logic, concurrency limits, or PII scrubbing yourself — the guarantee layer
applies the same way to every node, whether it calls one model or picks between several. Where this
becomes concrete day to day: setting up a provider for a node to call, and configuring a `human` node
that suspends a run and waits for a person to act on it. The guarantees underneath don't change based on
either choice.

When a run gives you a result you didn't expect, [the engineering loop](/concepts/engineering-loop/) is
how you go from that unexpected result to a reproduced case, a found cause, and a verified fix.

## See also

- [The engineering loop](/concepts/engineering-loop/) — what to do when a run doesn't go the way you
  expected.
