---
title: How to run a step over a collection
description: Add a map node that runs one node once per item in a list, with a concurrency cap and a policy for what happens when one item fails.
---

# How to run a step over a collection

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
- `out` binds what the node returns, the same `name`/`type`/`description`/`from` shape as any other
  node's output fields. Two reference forms exist only inside a `map` node's `out`: `$ok` is the list of
  every item that finished successfully (a defaulted item counts as successful), in list order, and
  `$failed` is the list of items that failed, each as `{index, code, message}`. Neither is available
  in the map node's own body — they only exist once every item is done.

### Example

This is the showcase project's `vote` node in its `support_case` flow: three independent votes on the
customer's intent, one per perspective, using a cheap model. Create it yourself with:

```bash
{{CLI_COMMAND}} new my_project --template showcase
```

Its file lives at `flows/support_case/nodes/vote/vote.node.yaml`. The showcase is written for a
Russian-market storefront, so its descriptions are in Russian; the file below is translated to English
for this page:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "map"
description: "Three independent votes on intent from a cheap open model, one per perspective"
over: "$prepare.out.perspectives"
body: "ballot"
concurrency: 3
on_item_error:
  use: "skip"
out:
- name: "ballots"
  type: "IntentBallot[]"
  description: "Votes that finished successfully"
  maxItems: 3
  from: "$ok"
```

`prepare`, an earlier `code` node, outputs `perspectives`, a list of up to three `VotePerspective`
values (`words`, `evidence`, `risk`). With `concurrency: 3`, all three votes fire at once. `skip` means
one perspective's vote failing — a refusal, a timeout — doesn't take the case down; the node still
succeeds with however many votes made it through, from zero up to three.

`ballot.node.yaml`, the body, is an ordinary `llm` node. It binds `$item` — the perspective for this
particular run — alongside the case data every vote needs:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "llm"
description: "One vote on the case's intent, from a single perspective"
agent: "llama"
in:
- name: "summary"
  from: "$triage.out.summary"
- name: "observations"
  from: "$triage.out.observations"
- name: "safety_risk"
  from: "$triage.out.safety_risk"
- name: "perspective"
  from: "$item"
```

Each vote returns one `IntentBallot`: a rationale, the intent it picked, and a confidence score. Back
in `vote.node.yaml`, `$ok` collects the `IntentBallot` from every vote that succeeded into `ballots` —
that's the whole item, since `ballot` returns a single record rather than several output fields. A
later `code` node reads `$vote.out.ballots` to tally the votes into one final intent.

## See also

- [How to branch into parallel steps](/engine/parallel-node/) — fixed branches that all run at once,
  instead of one body node run per list item.
- [How to call a model](/engine/llm-node/) — what `ballot`, the map's body, actually is.
- [The engineering loop](/concepts/engineering-loop/) — what to do when a run's output isn't what you
  expected.
- [Node specifications](/reference/nodes/) — every field on `MapNodeSpec`, generated from the code.
- [Built-in policies and evaluators](/reference/built-in-policies/) — every `on_item_error` policy's
  Python signature, including `default`'s parameters.
