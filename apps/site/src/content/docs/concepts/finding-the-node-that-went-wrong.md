---
title: How to find the node where a workflow went wrong
description: Every step execution has a 4-field address, not just a node name, because the same node can run more than once inside one run.
---

## In short

A node's name alone doesn't tell you which run of it you're looking at, because a parallel branch, a
loop pass, or a map item can all run the same node more than once inside a single run. AQVEN addresses
every step execution with four fields — which node, which branch, which loop pass, which list item —
so "the second draft's output" or "pass two of the record check" is one specific execution you can
point at, not a name that could mean any of several runs.

## The four fields

Every execution's address has:

- **`node_id`** — which node ran. Always set.
- **`branch_key`** — which branch of a `parallel` or a matched `switch` case it ran on.
- **`iteration`** — which pass of a `loop` it was, counted from 0.
- **`item_index`** — which item of a `map` it was processing.

The last three are optional, and most executions only ever have one of them set — a plain node with no
`parallel`, `loop`, `map`, or `switch` around it has all three `null`. What makes the address 4 fields
instead of just a node name is exactly this: a node inside a branch, a loop, or a map can execute many
times in one run, and each of those executions needs its own identity, with its own input, output, and
checks, distinct from every other execution of that same node.

## What each construct sets

Each control node sets exactly one of the three optional fields on the executions it runs:

- **`parallel`** sets `branch_key` to the branch's key — the same key that names the branch in the
  node's definition.
- **`loop`** sets `iteration` to the pass number, starting at 0, for every node in its body, every pass.
- **`map`** sets `item_index` to the item's position in the list it's running over.
- **`switch`** also sets `branch_key`, for the one node inline in whichever case matched. `branch_key`
  isn't a `parallel`-only idea — it means "which branch of a decision," and both `parallel` and `switch`
  make that kind of decision, just differently.

## A container's own execution doesn't carry its children's field

The `parallel`, `loop`, `map`, or `switch` node itself is one execution too, and it doesn't carry the
field it's about to hand to the nodes inside it. A `loop` node's own execution has `iteration: null` —
only the executions of the nodes in its body get `iteration: 0`, `1`, `2`, and so on, one value per pass.
The same holds for `parallel`'s `branch_key` and `map`'s `item_index`: the container is addressed like
any other single node, and the field it sets only shows up once you step inside it.

## Nesting composes

Put a `loop` inside a `parallel` branch, or a `map` inside a `loop`, and the fields from every level you
crossed to reach a node all end up on that node's address together. A step inside a loop inside a
parallel branch carries both `branch_key` (from the branch it's on) and `iteration` (from the pass it's
in) — neither one replaces the other. That's what makes an address a real coordinate for "how did I get
here," not just a flag for the innermost construct.

## Which retry isn't part of the address

If an execution fails and AQVEN retries it, that retry is still the same execution — same `node_id`,
same `branch_key`, `iteration`, and `item_index` as before. Which attempt actually ran is tracked
separately, as its own field, not folded into the address. That's deliberate: the address answers "which
run of the workflow reached this node, on which branch, pass, or item" — a question that doesn't change
when a retry happens — while "which attempt" answers a different question, about what happened once
you're already looking at that one execution.

## Example

AQVEN's example project drafts a reply to a customer with three model providers running side by side,
in a `parallel` node called `drafts`, and separately fills in a case record with a `loop` node called
`record` that checks it against business rules pass by pass.

If the Mistral-family branch of `drafts` is the one that came back wrong, its execution is addressed as:

```json
{ "node_id": "drafts__mistral", "branch_key": "mistral", "iteration": null, "item_index": null }
```

If the second pass of `record`'s validation step is the one that missed a rule, its execution is
addressed as:

```json
{ "node_id": "record__validate", "branch_key": null, "iteration": 1, "item_index": null }
```

Same node kind, same field names, two different fields set — because one execution ran on a branch and
the other ran on a loop pass.

## How this shapes what you do

This is the address behind every "find the exact call that produced a bad result" question. In Studio,
[investigating a run](/studio/investigate-a-run/) shows this same address under the title of whatever
cell you click in a node's matrix — that's how a click on "pass two" or "the Mistral branch" turns into
one specific execution with its own input, prompt, output, and checks. Calling AQVEN as an agent,
[the `run_*` tools](/mcp-cli/runs/) take this same 4-field address as an argument: `run_get_node` reads
one execution by it, and `run_fork` replays a run up to it and re-runs everything from there. Either
way, it's the same four fields, because it's the same thing being pointed at.

## See also

- [The engineering loop](/concepts/engineering-loop/) — why every execution needs its own address, and
  where finding one fits between understanding a flow and testing a fix.
- [How to investigate a run](/studio/investigate-a-run/) — clicking through a run's matrix to one
  execution's address, input, prompt, output, and checks.
- [How to branch into parallel steps](/engine/parallel-node/) — what a `parallel` node is and how its
  branches are defined.
- [How to repeat a step with a limit](/engine/loop-node/) — what a `loop` node is and how its passes
  work.
- [How to run a step over a collection](/engine/map-node/) — what a `map` node is and how its items are
  defined.
- [How to start and follow runs as an agent](/mcp-cli/runs/) — `run_get_node` and `run_fork`, which take
  this address as an argument.
