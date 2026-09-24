---
title: How to run a step over a collection
description: Add a map node that runs one node once per item in a list, with a concurrency cap and a policy for what happens when one item fails.
---

## When you need this

Use a `map` node whenever a step needs to run once per item in a list you don't know the size of
ahead of time — a vote from each of several perspectives, one lookup per line item, a check per
attachment. A `parallel` node's branches are fixed at design time, one file per branch; a `map` node
has a single body node that runs once per list item, however many items there turn out to be.

## Steps

- Write `<stem>.node.yaml`: `node: "map"`, a `description`, `over`, `body`, `on_item_error`, and `out`.
  `concurrency` is optional.
- `over` is a reference to the list to run over — typically another node's output, like
  `$prepare.out.perspectives`. It has to resolve to a list; anything else fails the node.
- `body` names one sibling node, in a subdirectory named for the map node itself: a node `vote` with
  body `"ballot"` keeps `ballot.node.yaml` in `vote/` next to `vote.node.yaml`. That node runs once per
  item. Inside it, `$item` binds the current item and `$index` its position — both are available only
  inside a map's body, the same way `$item` isn't available anywhere else.
- `concurrency` caps how many items run at once. Leave it unset and every item starts at once, limited
  only by how many items there are; set it to hold the number of simultaneous calls down, for example
  to a model provider's rate limit.
- `on_item_error` decides what one item's failure does to the rest of the run. Like any other policy
  slot in AQVEN, it's `use` (a built-in name) or `run` (your own `module:function`), plus `with` for
  whatever parameters the policy takes. Three built-ins ship:
  - `skip` — the failed item is dropped; every other item keeps running, and the node still succeeds.
  - `fail` — the first item failure fails the whole node immediately.
  - `default`, with `with: {value: ...}` — the failed item is replaced by that fallback value, so the
    node still succeeds with every item accounted for.

  When the policy skips or replaces an item, the run records that decision as a `map_item_recovered` event,
  and the run page shows it: the map's header gets a "replaced" or "skipped" mark naming the policy, and a
  replaced item's output shows the value that went on in its place, labeled as not a model answer.
- `out` binds what the node returns, the same `name`/`type`/`description`/`from` shape as any other
  node's output fields. Two reference forms exist only inside a `map` node's `out`: `$ok` is the list of
  every item that finished successfully (a defaulted item counts as successful), in list order, and
  `$failed` is the list of items that failed, each as `{index, code, message}`. Neither is available
  in the map node's own body — they only exist once every item is done.

### Example

The [showcase](/start/quickstart/) project's own `map` node, `vote` in `support_case`, binds three of an earlier node's
outputs into its body alongside the item it's mapping over. Here's a small, self-contained `map` node
instead, checked clean with `aqven check`: it reads its list straight off the flow's own input, so
there's nothing upstream to explain.

`each.node.yaml`, in `flows/digest/nodes/each/`:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "map"
description: "Summarizes each ticket in the batch"
over: "$input.tickets"
body: "summarize"
concurrency: 4
on_item_error:
  use: "skip"
out:
- name: "summaries"
  type: "Text[]"
  description: "Summaries, in ticket order"
  maxItems: 20
  maxLength: 200
  from: "$ok[*].summary"
- name: "failures"
  type: "MapItemError[]"
  description: "Tickets that failed to summarize"
  maxItems: 20
  from: "$failed"
```

`over: "$input.tickets"` is the flow's own input list, one item per ticket — no other node's output to
track down. With `concurrency: 4`, up to four tickets summarize at once; `on_item_error: {use: "skip"}`
means one bad ticket doesn't take the rest down. `out` uses both reference forms a `map` node's `out`
gets: `$ok[*].summary` collects the `summary` field from every ticket that succeeded, in order, and
`$failed` collects the ones that didn't, each as `{index, code, message}` — `MapItemError`, a built-in
type.

`summarize.node.yaml`, the body, sits next to `each.node.yaml` in the same directory, qualified to the
id `digest.each__summarize`. It's an ordinary `code` node — a `map` node's body can be any node kind,
not just `llm`:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "code"
description: "Summarizes one ticket to its first 200 characters"
run: "summarize"
in:
- name: "ticket"
  type: "Text"
  description: "The ticket text for this item"
  maxLength: 2000
  from: "$item"
out:
- name: "summary"
  type: "Text"
  description: "The ticket's summary"
  maxLength: 200
```

`from: "$item"` binds the current ticket — the same reference form the showcase's own `ballot.node.yaml`
uses inside `vote`, just without another node's output bound alongside it. `summarize.py`, next to this
file, returns `summary` truncated to 200 characters; nothing about the function itself is specific to
running inside a `map` node.

## See also

- [How to branch into parallel steps](/engine/parallel-node/) — fixed branches that all run at once,
  instead of one body node run per list item.
- [How to write a step in Python](/engine/code-node/) — what `summarize`, this example's body, actually
  is.
- [The engineering loop](/concepts/engineering-loop/) — what to do when a run's output isn't what you
  expected.
- [Node specifications](/reference/nodes/) — every field on `MapNodeSpec`, generated from the code.
- [Built-in policies and evaluators](/reference/built-in-policies/) — every `on_item_error` policy's
  Python signature, including `default`'s parameters.
