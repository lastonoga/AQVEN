---
title: Parallel and Map
description: Run a fixed set of branches or process a data-driven list.
---

Both nodes perform concurrent work, but they answer different questions. Use `parallel` when you know the branches while designing the workflow. Use `map` when the input determines how many items need work.

## Run named branches with `parallel`

Suppose two independently configured agents draft an answer. This complete node waits for both and collects their replies:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "parallel"
description: "Draft two independent answers"
body:
  primary: "draft_primary"
  alternative: "draft_alternative"
join:
  use: "all"
out:
  - name: "primary"
    type: "Reply"
    description: "Primary draft"
    from: "$branch.primary"
  - name: "alternative"
    type: "Reply"
    description: "Alternative draft"
    from: "$branch.alternative"
```

The two child nodes live below the `parallel` node. Each can use a different agent or implement a different strategy. `all` waits for both; a failed branch makes the combined step fail. If the product can continue with fewer results, use another join policy and make the output type reflect that choice.

### Require a quorum

When three reviewers are available but two successful answers are sufficient, change the join and output binding:

```yaml
join:
  use: "quorum"
  with:
    min_ok: 2
    on_error: "skip"
out:
  - name: "replies"
    type: "Reply[]"
    description: "Replies from successful branches"
    maxItems: 3
    from: "$ok[*].reply"
```

This changes the result from two named fields to a list of successful replies. Consumers must handle a list and cannot assume that a particular reviewer succeeded. The built-in join choices are `all`, `any`, `first_success`, and `quorum`; see [Policies](/engineering/reference/policies/) and the [Node reference](/engineering/reference/nodes/#parallelnodespec).

## Process an input list with `map`

Suppose `prepare` returns a list of documents. A `map` runs one `extract` child per document:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "map"
description: "Extract a result from each document"
over: "$prepare.out.documents"
body: "extract"
concurrency: 4
on_item_error:
  use: "fail"
out:
  - name: "results"
    type: "Extraction[]"
    description: "One extraction per input document"
    maxItems: 20
    from: "$ok"
```

The child reads its current document through `$item`. It can also read `$index`. For example, an LLM child may bind `document` from `$item` and `position` from `$index`. `concurrency` controls the maximum active items and accepts 1 through 256. Omitting it uses the runtime default.

With `on_item_error: {use: "fail"}`, one failed item fails the map. Switching to `skip` lets successful items continue, so the output list may be shorter than the input. A `default` policy can supply a replacement value. Choose based on what a caller can safely accept, then test an empty list and a failed item. The map contract and policy field shapes are in the generated [Node reference](/engineering/reference/nodes/#mapnodespec).

## Inspect the results

In [Studio Runs](/studio/runs/), inspect each branch or item, its input, and its outcome. A single combined success status cannot tell you whether a quorum skipped a branch or a map dropped an item.
