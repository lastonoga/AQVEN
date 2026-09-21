---
title: How to read a workflow's graph
description: Open a flow's canvas or its node list to see every step, how they connect, and what each one is configured to do.
---

# How to read a workflow's graph

## When you need this

Use this whenever you want to see what's actually in a flow before you dig into one step — how many
nodes it has, how they depend on each other, where the loops and branches are, or what a specific node's
prompt or schema looks like. Studio has two screens for this, reading the same underlying node data:
the canvas, a visual graph you navigate by clicking nodes, and the node list, a flat list you scan top
to bottom. Pick whichever matches how you're already looking at the problem.

## Steps

- Open a flow and you're on its canvas (the screen Studio lands you on — see
  [your first workflow](/studio/first-workflow/)). Every node is a card. An ordinary step is a small
  card with a colored bar for its kind, the node's kind tag and name, a subtitle (the agent and
  inference for an `llm` node, the function name for a `code` or `tool` node), a dot if it has an
  unresolved problem, and small counts of its inputs and outputs. A `loop`, `switch`, `parallel`, or
  `map` node is drawn as a larger container card holding its member nodes, tagged with how many members
  it has.
- Read the edges: a solid arrow is an ordinary dependency between two nodes; a dashed line looping back
  is a `loop` node's repeat edge. A floating legend (top right) and a zoom control (bottom left) sit
  over the graph without covering it. Cards aren't draggable and nothing here is editable — clicking is
  the only interaction, and it selects a node rather than moving it.
- Click any card to open the node inspector, a panel that slides in from the right without covering the
  canvas. It has up to six tabs: `definition`, `input`, `prompt`, `output`, `config` (labeled `agent`
  instead when the node has agent settings), `problems` — though `prompt` only appears if the node has
  one, and `problems` only if it has any.
- Flip the formatted/raw switch near the top of the inspector to change every section on the current tab
  from a human-readable view to the same data as raw JSON, and back. It's the same node data either way,
  just two ways of reading it — useful when the readable view hides a field you need to see exactly as
  written.
- Switch to the node list, at the same flow, when you'd rather scan every node than click through the
  graph one dependency at a time. It's a flat list on the left, indented to show which container a node
  belongs to, with a detail panel on the right for whichever node you click.
- The node list's detail panel isn't the canvas inspector reused — it's a separate part of Studio, built
  for scanning rather than navigating. It shows the same node, but with a different tab set:
  `definition`, `prompt`, `schemas`, `problems`, and no separate `input`, `output`, or `config` tabs.
  Its `definition` tab folds in what the canvas splits across `input` and `output` — the node's
  bindings, its declared outputs, and its upstream and downstream links, all in one place. `schemas`
  covers the node's input, output, and form JSON schemas together, one section each.

### Example

In the showcase project's `support_case` flow, the `triage` node is an `llm` step with one upstream node
(`prepare`) and about a dozen downstream nodes that read its output. On the canvas, its card is tagged
`llm`, subtitled `gemini · triage` — its agent and inference id. Click it and the inspector opens on
`definition`, showing its description and that single upstream link to `prepare`; switch to `prompt` to
read the actual prompt text, formatted or as raw JSON. Open the same flow's node list and click `triage`
there instead: the tabs read `definition`, `prompt`, `schemas`, `problems`, but the `prompt` tab shows
the identical text, because both screens read it from the same file.

## See also

- [How to call a model](/engine/llm-node/), [How to write a step in Python](/engine/code-node/),
  [How to reuse a flow as a step](/engine/call-node/), [How to give an agent a tool](/engine/tool-node/),
  [How to pause for a person](/engine/human-node/), [How to route by a value](/engine/switch-node/),
  [How to repeat a step with a limit](/engine/loop-node/),
  [How to run a step over a collection](/engine/map-node/),
  [How to branch into parallel steps](/engine/parallel-node/), and
  [How to narrow a dynamic value to a type](/engine/narrow-node/) — each teaches the fields the
  inspector's tabs are showing you.
- [Node specifications](/reference/nodes/) — the full generated field reference behind every tab.
