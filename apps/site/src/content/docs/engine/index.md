---
title: Engine
description: Write workflows as files — nodes, prompts, and the CLI that checks and runs them.
---

This is the file-based way of building an AQVEN workflow. A flow is a directory in your project — a
`flow.yaml` plus one YAML file per node — and prompts live in their own Markdown files, never inline
in the YAML. You edit these with a text editor and a terminal instead of a browser; it's the same
flow definition Studio edits visually, just from the other side.

The sidebar groups this area into three parts. **Node kinds** is one how-to page per kind of step.
Start with [how to call a model](/engine/llm-node/) and [how to write a step in Python](/engine/code-node/)
— the two you'll use most. The other eight cover giving an agent a tool, pausing for a person, running
steps in parallel, mapping a step over a collection, routing by a value, repeating a step with a limit,
reusing a flow as a step, and narrowing a dynamic value to a type.

**Prompts & data shape** covers the three things every node's inputs and outputs lean on:
[how to write a prompt](/engine/prompts/) (the Markdown files a model call reads from),
[how to constrain a field's values](/engine/field-constraints/) (length, range, pattern, and choice
limits a model's answer has to obey), and
[how to handle a shape you don't know in advance](/engine/dynamic-shape/) (for a field whose type isn't
fixed until run time).

**CLI tooling** is everything you run from a terminal instead of Studio. The [`check`
command](/engine/check/) validates the whole tree before any of it reaches a teammate or a release. The
rest cover generating types and editor schemas, inspecting how a project's pieces connect, running a
flow locally without a server, managing secrets, and checking your model providers are configured.
