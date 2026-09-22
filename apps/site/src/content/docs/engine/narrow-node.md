---
title: How to narrow a dynamic value to a type
description: Add a narrow node that validates a Dynamic value against one real record or union type, turning an open-ended blob into ordinary typed fields.
---

## When you need this

Use a `narrow` node when a value in your flow is declared `Dynamic` — its shape wasn't fixed in
advance — but by this point in the flow you know, or can check, exactly which real type it has to be.
`narrow` validates the value against that type and hands back an ordinary typed value: every node
downstream reads named fields instead of an open-ended blob.

## Steps

- Write `<stem>.node.yaml`: `node: "narrow"`, a `description`, `from`, and `to`. That's the whole
  spec — there's no `in` or `out` to declare.
- `from` is a reference to the `Dynamic` value being narrowed. It has to resolve to something whose
  declared type is literally `Dynamic` — `{{CLI_COMMAND}} check` rejects a `narrow` node pointed at a
  value that's already typed.
- `to` names a record or union type from the project's own type registry, not a built-in scalar.
  `{{CLI_COMMAND}} check` rejects a `to` that isn't a real record or union type.
- At run time, AQVEN validates the value against `to`'s fields, the same rules any other typed field
  follows. If the value doesn't fit, the node fails instead of passing something malformed further
  down the flow.
- The node's own output is the narrowed value itself — downstream, `$<narrow node id>.out` reads it
  directly, not `$<narrow node id>.out.<field>`.

### Example

This is the [showcase](/start/quickstart/) project's `to_record` node, in its `support_case` flow: it narrows the case
record an earlier `loop` node filled in — declared `Dynamic` there because its shape depends on which
kind of case it turns out to be — down to `CaseRecord`, a discriminated union with three variants:
`defect`, `delivery`, `question`. Create it yourself with:

```bash
{{CLI_COMMAND}} new my_project --template showcase
```

Here's the real file, translated to English:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "narrow"
description: "Narrows the record down to a static case type by its kind"
from: "$record.out.record"
to: "CaseRecord"
```

Narrowing turns `$record.out.record` — an untyped `Dynamic` reference — into a plain `CaseRecord`
value: everywhere downstream, `$to_record.out` reads as an ordinary typed field, the same as if it had
never been `Dynamic` at all.

## See also

- [How to handle a shape you don't know in advance](/engine/dynamic-shape/) — the rest of the
  `Dynamic` story: why `record`'s output needed this in the first place, and the other ways AQVEN
  handles a shape that isn't fixed.
- [How to repeat a step with a limit](/engine/loop-node/) — `record`, the `loop` node whose `Dynamic`
  output this example narrows.
- [How to route by a value](/engine/switch-node/) — `route`, which switches on `to_record`'s narrowed
  output right after this node runs.
- [The engineering loop](/concepts/engineering-loop/) — what to do when a run's output isn't what you
  expected.
- [Node specifications](/reference/nodes/) — every field on `NarrowNodeSpec`, generated from the code.
- [Type specifications](/reference/types/) — how a discriminated union like `CaseRecord` is declared.
