---
title: Switch
description: Run one branch from a decision and produce one stable output shape.
---

Use `switch` when the same flow input can require different paths. A classification result may be safe to use directly when it is clear, but need a second model when it is uncertain.

## A complete switch node

Assume `classify` returns `decision` (`clear` or `uncertain`) and `category`. The `escalate` child returns a refined `category`.

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "switch"
description: "Use the first category when clear; otherwise escalate"
on: "$classify.out.decision"
cases:
  clear:
    bind:
      - name: "category"
        from: "$classify.out.category"
      - name: "route"
        value: "direct"
  uncertain:
    node: "escalate"
    bind:
      - name: "category"
        from: "$escalate.out.category"
      - name: "route"
        value: "reviewed"
out:
  - name: "category"
    type: "Category"
    description: "Selected category"
  - name: "route"
    type: "Route"
    description: "Path that selected the category"
```

Put `escalate.node.yaml` beneath the switch node's directory. Do not add `escalate` to the flow's top-level `order`; it runs only for the `uncertain` case. The switch itself appears in `order` after `classify`.

The `on` reference selects a case by its value. The `out` declaration is the common shape consumed by downstream nodes. Each case above binds both fields, so `$route.out.category` and `$route.out.route` have the same types whichever path ran.

## Bind without running a child

The `clear` case only has `bind`, so it returns existing data without another call. This saves work when the first classification is sufficient. A case must set `node`, `bind`, or both.

## Run a child without a bind

If a child already produces the complete switch output, a case can name only that child:

```yaml
cases:
  uncertain:
    node: "escalate"
```

Use this form only when the child's output matches the switch's declared `out` fields. Explicit `bind` is useful when field names differ, only some child fields should leave the branch, or you want to add a literal such as `route`.

## Changing cases changes behavior

Adding a new value to the decision enum requires a matching case. Renaming a case key changes which value selects it. Changing a branch's binding changes the data that later nodes see; changing `out` changes the contract for every downstream `$route.out.*` reference. Run `{{CLI_COMMAND}} check .` after any of these edits and include dataset cases for each path. [Studio Canvas](/studio/canvas/) shows the structure; [Runs](/studio/runs/) shows which branch executed.

All accepted fields and the `SwitchCase` shape are in the generated [Node reference](/engineering/reference/nodes/#switchnodespec).
