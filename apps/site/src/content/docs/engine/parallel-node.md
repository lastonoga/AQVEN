---
title: How to branch into parallel steps
description: Add a parallel node that runs several branches against the same input at once, with a join policy that decides how their results become the node's one outcome.
---

## When you need this

Use a `parallel` node whenever a step doesn't need to wait its turn — drafting a reply with several
model providers at once instead of one after another, collecting two independent approvals at the
same time, or any other case where running branches one after another would only cost time without
changing the result.

## Steps

- Write `<stem>.node.yaml`: `node: "parallel"`, a `description`, `body`, `join`, and `out`.
- `body` maps a short branch key to another node's id — any node kind, including a nested `parallel`
  or `map`. Give each branch its own file in a subdirectory named for the parallel node itself:
  `drafts/gpt.node.yaml`, `drafts/mistral.node.yaml`, and `drafts/gemini.node.yaml` sit next to
  `drafts.node.yaml`. Every branch reads from the same context any other node would — the flow's
  input, the run's context, and whatever finished earlier in the flow — nothing about running in
  parallel changes what a branch binds into its own `in`.
- `join` decides how the branches' separate results become the node's one outcome. Like any other
  policy slot in AQVEN, it's `use` (a built-in name) or `run` (your own `module:function`), plus
  `with` for whatever parameters the policy takes. Four built-ins ship:
  - `all` — every branch must succeed; the node fails the moment one does, and only succeeds once
    all of them have.
  - `any` — decided by whichever branch finishes first, success or failure; it doesn't wait for the
    rest.
  - `first_success` — waits for a success, tolerating failures from the other branches along the
    way; fails only once every branch has failed.
  - `quorum` — takes `with: {min_ok, on_error}`. It succeeds once `min_ok` branches have succeeded.
    `on_error: "fail"`, the default, fails the whole node the moment any branch fails, the same as
    `all` would. `on_error: "skip"` ignores branch failures and only fails once too few branches are
    still running to reach `min_ok`.
- `out` binds what the node returns, the same `name`/`type`/`description`/`from` shape as any other
  node's output fields. Two reference forms exist only inside a `parallel` node's `out`: `$branch.<key>`
  pulls one branch's own output by its key in `body`, and `$ok[*].<field>` projects a field across
  every branch that succeeded, as a list capped at the branch count — useful only with a join that can
  let more than one branch through, like `quorum` or `all`. With `join: all`, a `$branch.<key>`
  reference is guaranteed a value, because the node can't succeed unless that branch did; with any
  other join, the branch might never have finished, so its value is optional.

### Example

This is the [showcase](/start/quickstart/) project's `drafts` node, one of two `parallel` nodes in its `support_case` flow
(the other, `approvals`, is the `parallel` node behind [how to pause for a
person](/engine/human-node/)). Create it yourself with:

```bash
{{CLI_COMMAND}} new my_project --template showcase
```

Here's the real example, translated to English. It runs three `llm` nodes side by side — one call each to an OpenAI-family, a
Mistral-family, and a Google-family model — and only needs two of the three to come back:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "parallel"
description: "Three draft replies, one per model family"
body:
  gpt: "gpt"
  mistral: "mistral"
  gemini: "gemini"
join:
  use: "quorum"
  with:
    min_ok: 2
    on_error: "skip"
out:
  - name: "candidates"
    type: "ReplyDraft[]"
    description: "The drafts that finished successfully"
    maxItems: 3
    from: "$ok[*].reply"
```

With `min_ok: 2` and `on_error: "skip"`, one model family being down or refusing doesn't stop the
case — the node only fails once fewer than two branches can still possibly succeed. `$ok[*].reply`
then pulls the `reply` field out of every draft that made it through, as a list of two or three
`ReplyDraft`s.

Each key in `body` names a sibling `llm` node in the same directory: `gpt.node.yaml`,
`mistral.node.yaml`, and `gemini.node.yaml` are three `llm` nodes that are identical except for their
`agent` field and description — same inference, same input bindings, a different model family
answering:

```yaml
node: "llm"
agent: "gpt"
```

The other two branches set `agent` to `"mistral"` and `"gemini"` instead. The `revise` inference
behind all three returns one field, `reply: ReplyDraft`, which is exactly what `$ok[*].reply` in
`drafts.node.yaml` projects into `candidates`.

## See also

- [How to pause for a person](/engine/human-node/) — the showcase's other `parallel` node,
  `approvals`, joining with `all` instead of `quorum`.
- [How to call a model](/engine/llm-node/) — what each of `drafts`' three branches actually is.
- [Designing reliable workflows](/concepts/designing-reliable-workflows/) — when running branches in
  parallel like this actually earns its cost, and when it doesn't.
- [The engineering loop](/concepts/engineering-loop/) — what to do when a run's output isn't what you
  expected.
- [Node specifications](/reference/nodes/) — every field on `ParallelNodeSpec`, generated from the
  code.
- [Built-in policies and evaluators](/reference/built-in-policies/) — every join policy's Python
  signature, including `quorum`'s parameters.
