---
title: Field Bindings
description: Pass values between a flow, nodes, tools, agents, and control structures with checked paths or literals.
---

A binding gives a receiving field exactly one source: a checked value path through `from`, or a literal through `value`.

```yaml
in:
  - name: "question"
    type: "Text"
    from: "$input.question"
  - name: "max_results"
    value: 5
```

The checker rejects a binding that supplies both `from` and `value`, or neither. It also checks the source type, receiver type, and scope.

## Read from the right scope

| Path | Use it for |
| --- | --- |
| `$input.field` | Public flow input. |
| `$run.context.locale` | Run-wide date, time zone, locale, or tenant value. |
| `$node_id.out.field` | A completed top-level node output. |
| `$item` and `$index` | The current item and position inside `map`. |
| `$branch.name` | A named parallel branch result. |
| `$acc`, `$iter`, `$loop` | State in a loop. |
| `$case` | A selected dataset case. |
| `value` | A literal that belongs in the definition. |

Nested object fields, fixed list indexes, and list projection are supported where the referenced value has that shape. The generated [Fields and bindings reference](/engineering/reference/fields/) is authoritative for accepted syntax.

## Keep bindings readable

Bind one semantic value per field. If a path needs several transformations, add a code node with a typed output instead of embedding business logic into the path. Name the target after the receiving contract, then use the same name in a prompt or Python function.

## Verify after moving a field

Renaming or moving an output can invalidate a binding far from the original node. Use `{{CLI_COMMAND}} refs` to find callers and run `{{CLI_COMMAND}} check .` after the change. Dataset cases make this safer because they show the concrete values that pass through the boundary.
