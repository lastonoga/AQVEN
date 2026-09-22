---
title: How to reuse a flow as a step
description: Add a call node that runs another flow as a single step, passing it typed input and getting back whatever that flow declares as its own output.
---

## When you need this

Use a `call` node when a group of steps deserves to be its own flow — reusable from more than one
place, or just substantial enough to keep out of the parent flow's own `nodes/` folder. A `call` node
runs another flow from start to finish as if it were a single step: it hands over typed input, and
whatever that flow returns becomes the node's own output.

## Steps

- Write `<stem>.node.yaml`: `node: "call"`, a `description`, `flow`, and `in`. That's the whole spec —
  there's no `out` to declare.
- `flow` names another flow by its id, which is just the name of that flow's own folder under
  `flows/`. The flow has to already exist in the project; AQVEN discovers every flow by walking
  `flows/`, so there's nothing else to register it in.
- `in` binds the called flow's input fields — a `name` plus either `from` (a reference) or `value` (a
  literal), the same field-binding shape used everywhere else in AQVEN. It has to cover every field the
  flow's own `input` type declares, no more and no fewer.
- The call node's own output is the called flow's `output` type, populated by whatever that flow's own
  `returns` bound it to. Downstream, `$<call node id>.out.<field>` reads it exactly like any other
  node's output — nothing marks it as having run a whole separate flow underneath.
- A flow can't call itself, directly or through a chain of `call` nodes — `{{CLI_COMMAND}} check`
  rejects the cycle before anything runs.

### Example

This is the [showcase](/start/quickstart/) project's `panel` node, in its `support_case` flow: instead of running one more
model itself, it hands the case summary, three reply drafts, and knowledge-base excerpts to a whole
separate flow — a panel of judges that picks the best draft. Create it yourself with:

```bash
{{CLI_COMMAND}} new my_project --template showcase
```

Unlike a `loop` or `map` node's body, the flow a `call` node runs isn't nested inside the node's own
folder — a called flow is a flow like any other, living at the top level of `flows/`, next to the flow
that calls it:

```text
flows/
  support_case/
    flow.yaml
    nodes/
      panel/
        panel.node.yaml
      ...
  judge_panel/
    flow.yaml
    nodes/
      ...
```

The showcase's own file descriptions are translated to English for this page. `panel.node.yaml`:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "call"
description: "A panel of judges picks the best reply draft"
flow: "judge_panel"
in:
- name: "summary"
  from: "$triage.out.summary"
- name: "candidates"
  from: "$drafts.out.candidates"
- name: "chunks"
  from: "$search_kb.out.chunks"
```

`judge_panel/flow.yaml`, the flow `panel` calls:

```yaml
apiVersion: "aqven/v1"
kind: "Flow"
description: "A panel of three judge families, distinct from the drafts' own authors: verdicts, agreement, a tie-break by an OpenAI model, a winner"
input: "PanelRequest"
output: "PanelOutcome"
returns:
- name: "winner"
  from: "$pick.out.winner"
- name: "verdict"
  from: "$pick.out.verdict"
```

`input: "PanelRequest"` is why `panel.node.yaml`'s `in` has exactly three fields — `summary`,
`candidates`, `chunks` — `PanelRequest`'s own three fields, no more and no fewer. `output:
"PanelOutcome"` and `returns` are why, downstream, another node can read `$panel.out.winner` and
`$panel.out.verdict`: `PanelOutcome`'s two fields, populated from whatever `pick`, the last node
`judge_panel` runs, returned. Downstream nodes read `$panel.out.winner` like any other node's output —
nothing marks it as having come from a whole separate flow underneath. The flow also declares `order`
(the sequence its own nodes run in) and `requires` (cross-node validation rules) — real fields on any
flow, just not ones this page needs to explain `call`.

## See also

- [How to call a model](/engine/llm-node/) — `tie_break`, the OpenAI judge `judge_panel`'s `decide`
  step calls in only when the panel splits.
- [How to branch into parallel steps](/engine/parallel-node/) — `judges`, which runs three judge
  models at once inside `judge_panel`.
- [How to write a step in Python](/engine/code-node/) — `aggregate` and `pick`, `judge_panel`'s two
  `code` steps.
- [How to route by a value](/engine/switch-node/) — `decide`, which only calls `tie_break` when the
  panel's judges split.
- [The engineering loop](/concepts/engineering-loop/) — what to do when a run's output isn't what you
  expected.
- [Node specifications](/reference/nodes/) — every field on `CallNodeSpec`, generated from the code.
- [Flow specification](/reference/flows/) — every field on `FlowSpec`, including `input`, `output`,
  and `returns`.
