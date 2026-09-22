---
title: How to repeat a step with a limit
description: Add a loop node that runs the same sequence of steps pass after pass, stopping on a policy or a hard cap, then picks which pass's output the node returns.
---

## When you need this

Use a `loop` node whenever a step needs another look at its own result — filling in a record and
checking it against rules, redrafting something until it clears a check, refining an answer pass by
pass. A `loop` node runs the same short sequence of steps more than once, until a policy says to stop
or a hard cap is reached, then hands back whichever pass's results a second policy picks.

## Steps

- Write `<stem>.node.yaml`: `node: "loop"`, a `description`, `body`, `max_iter`, `select`, and `out`.
  `init` and `stop` are both optional.
- `body` is an ordered list of sibling node ids — files that live in the same directory as the loop
  node itself, the same way a `map` node's single body node does. Every pass runs all of them, in that
  order, once each.
- `max_iter` is the hard cap on passes, from 1 to 50. Whatever else is set, the loop never runs more
  passes than this.
- `stop` is a list of policies, checked once every pass finishes. Each entry is `use` (a built-in name)
  or `run` (your own `module:function`), plus `with` for whatever parameters it takes — the same policy
  shape used everywhere else in AQVEN. Two built-ins ship: `threshold` stops once a numeric path crosses
  a `gte` or `lte` bound, and `stagnation` stops once a numeric path stops improving by at least
  `min_delta` over a `window` of passes. The first policy in the list that says stop, stops the loop.
  Leave `stop` unset and the loop always runs to `max_iter` every time, even on a pass that already
  stopped improving — worth setting explicitly whenever you have a real signal to stop on, the way
  `polish` below does with two.
- `select` picks which pass's results the node actually returns, once the loop has stopped for any
  reason. Same shape as `stop`. Two built-ins ship: `last` always picks the most recent pass, and
  `best`, given a `path`, picks the pass with the highest value there.
- `init` binds values into a body node's input, but only before the very first pass — for seeding
  something a later pass will read back that doesn't exist yet on pass one. Its keys are the same
  sibling ids `body` uses.
- Inside a body node, `$acc.<sibling id>.out.<field>` reads that sibling's own output from the pass
  before this one — `null` on the first pass, since there's no pass before it yet. A body node never
  sees the pass it's currently running, only the one before it.
- `out` binds what the loop node returns. `$iter.<sibling id>.out.<field>` reads from the pass `select`
  picked, which isn't necessarily the last one that ran. `$loop.iterations` is how many passes ran in
  total, and `$loop.stop_reason` is `"policy"`, `"max_iter"`, or `"budget"` — which of the three actually
  ended the loop.

### Example

This is the [showcase](/start/quickstart/) project's `polish` node in its `support_case` flow: it takes the winning draft a
`call` node chose earlier in the flow, revises it, has a second model critique the revision, and repeats
until the critique's score clears a threshold or stops improving, up to three passes. Create it yourself
with:

```bash
{{CLI_COMMAND}} new my_project --template showcase
```

It sits next to its two body nodes, `revise.node.yaml` and `critique.node.yaml`, shown below. AQVEN
qualifies each body node's own id with the loop's —
`polish__revise`, `polish__critique` — so they stay distinct from any other `revise` or `critique`
elsewhere in the project, the same way any nested node's id is qualified by its container.

Here's the real file:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "loop"
description: "Polishes the winning draft: revises it against the critique until the score clears a threshold or stops improving"
body:
- "revise"
- "critique"
init:
  revise:
  - name: "previous"
    from: "$panel.out.winner"
max_iter: 3
stop:
- use: "threshold"
  with:
    path: "$iter.critique.out.score"
    gte: 0.85
- use: "stagnation"
  with:
    path: "$iter.critique.out.score"
    window: 1
    min_delta: 0.02
select:
  use: "best"
  with:
    path: "$iter.critique.out.score"
out:
- name: "reply"
  type: "ReplyDraft"
  description: "The best reply by the critic's score"
  from: "$iter.revise.out.reply"
- name: "score"
  type: "Score"
  description: "The critic's score for the best reply"
  from: "$iter.critique.out.score"
- name: "iterations"
  type: "Int"
  description: "How many revision passes ran"
  from: "$loop.iterations"
```

`init` seeds `revise`'s own `previous` input before pass one, since it has nothing to read there
otherwise: `$acc.revise.out.reply` is `null` until a pass has actually run, so without `init` the first
revision would have no draft to start from.

`body` runs `revise` then `critique`, in that order, every pass. `stop` is a list of two built-in
policies, checked in order once a pass finishes: `threshold` stops the loop once `critique`'s `score`
for that pass reaches `0.85`, and `stagnation` stops it once that same score goes a full `window` of `1`
pass without improving by at least `0.02`. Whichever policy in the list says stop first, stops the loop.
`select: use: "best"` then picks the pass with the highest `score` at that same path — not necessarily
the last one that ran, which is why `out.reply` reads from `$iter.revise.out.reply` for whichever pass
`select` picked, not just the final pass.

`revise`, the first body node, is an ordinary `llm` node that redrafts the reply using the previous
pass's draft and the critique that followed it. `critique`, the second body node, is another `llm`
node — using a different model family so the critic isn't grading its own work — that scores the
redraft and lists any blocking issues.

## See also

- [How to call a model](/engine/llm-node/) — what `revise` and `critique`, this loop's two body nodes,
  actually are.
- [How to run a step over a collection](/engine/map-node/) — the other node kind whose body has its own
  reference form, `$item` and `$index` instead of `$acc`.
- [Designing reliable workflows](/concepts/designing-reliable-workflows/) — when a `loop` critic like
  `critique`/`revise` here actually earns its cost, and why it needs a real `stop` policy.
- [The engineering loop](/concepts/engineering-loop/) — what to do when a run's output isn't what you
  expected.
- [From a bad answer to a verified fix](/start/engineering-loop-walkthrough/) — tracing a real wrong
  answer through `record`, the showcase's other loop node, pass by pass.
- [Node specifications](/reference/nodes/) — every field on `LoopNodeSpec`, generated from the code.
- [Built-in policies and evaluators](/reference/built-in-policies/) — every `stop` and `select` policy's
  Python signature.
