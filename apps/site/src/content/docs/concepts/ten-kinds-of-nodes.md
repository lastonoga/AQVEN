---
title: Ten kinds of nodes
description: Every node in an AQVEN flow is one of exactly ten kinds, each with its own how-to page.
---

# Ten kinds of nodes

## In short

Every node in an AQVEN flow is one of exactly ten kinds, set by its `node: "<kind>"` field. Seven kinds
do something themselves — call a model, run your code, reach outside the flow, wait on a person, route
by a value, reuse another flow, or narrow a dynamic value to a type. Three — `parallel`, `map`, and
`loop` — run other nodes as their body instead. This page is the map: one line per kind, linking to the
how-to that covers it in full.

## The ten kinds

- **`llm`** — calls a model through a typed inference. [How to call a model](/engine/llm-node/); for
  what's actually three separate files behind one `llm` node, see
  [Agent, Inference, and the llm node](/concepts/agent-inference-and-the-llm-node/).
- **`code`** — runs a plain Python function you wrote. [How to write a step in Python](/engine/code-node/).
- **`tool`** — gives an agent a tool that reaches outside the flow: an internal API, a paid service, a
  long-running job. [How to give an agent a tool](/engine/tool-node/).
- **`human`** — pauses the run and waits for a person to submit a typed answer.
  [How to pause for a person](/engine/human-node/).
- **`parallel`** — branches into several nodes run against the same input at once.
  [How to branch into parallel steps](/engine/parallel-node/).
- **`map`** — runs one body node once per item in a collection.
  [How to run a step over a collection](/engine/map-node/).
- **`switch`** — routes by a value: a different case, a different node, or both, for every possible
  value of an enum or a union. [How to route by a value](/engine/switch-node/).
- **`loop`** — repeats a step with a limit, one body pass after another, until a policy or a cap stops
  it. [How to repeat a step with a limit](/engine/loop-node/).
- **`call`** — reuses a flow as a step, running it start to finish as if it were one node.
  [How to reuse a flow as a step](/engine/call-node/).
- **`narrow`** — narrows a dynamic value to a type, turning an open-ended value into ordinary typed
  fields. [How to narrow a dynamic value to a type](/engine/narrow-node/).

Three of these run other nodes as their body, not just data: `parallel` runs branches at once, `map`
runs one body node per item, and `loop` repeats a body pass after pass. The other seven do their own
work directly — nothing else runs inside them.

## How this shapes what you do

Picking a node kind is the first decision for a new step, before you fill in anything inside it. When a
step needs more than one thing to happen, the kind you reach for depends on the shape of the repetition:
a fixed, known-at-design-time set of branches is `parallel`; a list whose length you don't know until
the flow runs is `map`; the same steps run again until something changes is `loop`. They aren't
interchangeable ways of saying "do this more than once" — each covers a different shape.

When a step seems to need two things at once — call an external service and then reshape its result,
say — that's usually two nodes, not one: a `tool` node for the call, a `code` node right after it for
the reshaping, rather than looking for extra fields on a single node kind to do both.

If you're not sure which kind a step needs, the one-line list above is the index — follow the link to
the matching how-to for the field list and a worked example.

## See also

- [Agent, Inference, and the llm node](/concepts/agent-inference-and-the-llm-node/) — what's actually
  behind one `llm` node.
- [Files as source of truth](/concepts/files-as-source-of-truth/) — how a node's files sit on disk,
  and how a nested body node (a `parallel` branch, a `map` or `loop` body) is named.
- [Engine](/engine/) — the how-to section all ten node kinds live in.
