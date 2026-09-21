---
title: Engine
description: Write workflows as files — nodes, prompts, and the CLI that checks and runs them.
---

This is the file-based way of building an AQVEN workflow. A flow is a directory in your project — a
`flow.yaml` plus one YAML file per node — and prompts live in their own Markdown files, never inline
in the YAML. You edit these with a text editor and a terminal instead of a browser; it's the same
flow definition Studio edits visually, just from the other side.

Each node kind gets its own how-to page here. Start with [how to call a model](/engine/llm-node/) and
[how to write a step in Python](/engine/code-node/) — the two you'll use most. The other eight cover
giving an agent a tool, pausing for a person, running steps in parallel, mapping a step over a
collection, routing by a value, repeating a step with a limit, reusing a flow as a step, and narrowing
a dynamic value to a type. [How to write a prompt](/engine/prompts/) covers the Markdown files those
model calls read from.

The [`check` command](/engine/check/) validates the whole tree before any of it reaches a teammate or
a release. The CLI has more commands beyond that — generating types and editor schemas, inspecting how
a project's pieces connect, running a flow locally without a server, managing secrets, and checking
your model providers are configured.
