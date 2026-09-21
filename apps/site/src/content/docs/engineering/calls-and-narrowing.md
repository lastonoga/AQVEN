---
title: Calls and Narrowing
description: Reuse a typed flow or validate dynamic data before continuing.
---

## Call a reusable flow

Use `call` when a piece of work deserves its own input, output, tests, and callers. Suppose a `review_answer` flow accepts `reply` and `source_text`, and returns `approved` and `reason`:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "call"
description: "Review the drafted answer against its source"
flow: "review_answer"
in:
  - name: "reply"
    from: "$draft.out.reply"
  - name: "source_text"
    from: "$input.source_text"
```

The binding names must match the called flow's input type. The call's output follows that flow's output type, so later nodes can read `$review.out.approved`. You may bind a fixed value with `value` where the called flow's input permits it. If you change the called flow's input type, check every caller; if you change its output type, check every `$review.out.*` consumer.

The called flow is checked and testable on its own. A good reason to extract it is reuse or a meaningful product boundary, rather than simply shortening the parent `flow.yaml`.

## Narrow a dynamic value

Use `narrow` when an earlier step builds flexible data, but downstream steps need a declared type:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "narrow"
description: "Validate extracted fields as an Invoice"
from: "$extract.out.fields"
to: "Invoice"
```

If the value does not satisfy `Invoice`, narrowing fails at this boundary. Afterward, downstream nodes can read fields from the narrowed output according to that type. Do not use narrowing to hide an uncertain extraction: keep the original evidence and test missing or malformed fields in a dataset.

See [Types](/engineering/types/) for the type choices and the generated [Node reference](/engineering/reference/nodes/#callnodespec) for the exact `call` and `narrow` fields.
