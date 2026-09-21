---
title: Loops
description: Repeat a bounded sequence and select the result to return.
---

Use a `loop` when a result can be improved by repeating a known sequence, such as revising an answer and scoring it. A loop always has a maximum number of iterations; a stop policy can end it sooner.

## A complete revise-and-score loop

Assume an earlier `draft` node returns a `reply`. The loop has two children: `revise` produces a new reply, and `critique` produces a score.

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "loop"
description: "Revise a draft until it is good enough or stops improving"
body:
  - "revise"
  - "critique"
init:
  revise:
    - name: "previous"
      from: "$draft.out.reply"
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
    type: "Reply"
    description: "Reply from the selected iteration"
    from: "$iter.revise.out.reply"
  - name: "score"
    type: "Score"
    description: "Score of the selected reply"
    from: "$iter.critique.out.score"
  - name: "iterations"
    type: "Int"
    description: "Number of iterations executed"
    from: "$loop.iterations"
```

`init` supplies the first `previous` value. In later iterations, the `revise` child can read the prior result from `$acc.revise.out.reply`; it can also read the prior critique from `$acc.critique.out`. The `critique` child reads the current revision from `$revise.out.reply`.

The `stop` policies decide when no more iterations are needed. `select` decides which completed iteration supplies `$iter.*` in `out`. Here `best` returns the highest-scoring iteration; changing it to `last` returns the final iteration even if an earlier answer scored better. Removing `stop` runs up to `max_iter` every time. `max_iter` accepts 1 through 50.

## When to use a simpler flow

If a second pass has no measured benefit, use a single `llm` node. A loop can multiply model requests, cost, and latency. Compare a one-pass baseline with a loop on a dataset that includes easy cases, hard cases, and cases where the critique is wrong. [Testing and evaluation](/engineering/testing-and-evaluation/) shows the measurement path.

The complete field shapes for `init`, `stop`, `select`, and `out` are in the generated [Node reference](/engineering/reference/nodes/#loopnodespec) and [Policy reference](/engineering/reference/policies/).
