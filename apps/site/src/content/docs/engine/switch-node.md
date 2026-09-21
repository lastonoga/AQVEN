---
title: How to route by a value
description: Add a switch node that runs a different node, binds a different value, or both, for each possible value of an enum or a discriminated union, with every value covered and no default case.
---

# How to route by a value

## When you need this

Use a `switch` node whenever a step's next move depends on a value you already have — the kind of a
support case, whether a panel of judges agreed or split, any value backed by an enum or a discriminated
union. Each case can run its own node, bind a value directly with no node at all, or both. There's no
default: every value the switch can see needs its own case.

## Steps

- Write `<stem>.node.yaml`: `node: "switch"`, a `description`, `on`, `cases`, and `out`.
- `on` is a reference to the value being switched on. It has to resolve to an enum or a discriminated
  union — anything looser, including an untyped value with no fixed set of possibilities, fails the
  node before the flow ever runs.
- `cases` is a map from each value `on` can take to what runs for it. The keys have to match exactly:
  every value needs a case, and a case naming a value `on` can't take fails the node the same way a
  missing one does. There's no wildcard or fallback case.
- Each case sets `node` (a sibling node to run), `bind` (fields set directly, no node at all), or both —
  a case needs at least one. `bind` entries are a `name` plus either `from` (a reference) or `value` (a
  literal), the same shape as a field binding anywhere else in AQVEN.
  - A case with only `node` needs that node's own output to already match `out`, field for field.
  - A case with only `bind` needs it to cover every field `out` declares, no more and no fewer.
  - A case with both runs its node first, then `bind` can reach into what that node returned —
    `$<node local id>.out...` — alongside anything else already in scope.
- Inside a case — its `bind`, and any node it runs — `$case` is `on`'s value narrowed to that one case.
  For a discriminated union, that's the matching variant's own fields; for an enum, it's just that one
  value. `$case` doesn't exist anywhere outside a switch's cases, the same way `$item` only exists
  inside a `map` node's body.
- `out` declares what the node returns: `name`, `type`, `description` for each field, with no `from`.
  The value comes from whichever case actually ran, not from the switch node itself.

### Example

This is the showcase project's `route` node in its `support_case` flow: it picks how a case gets
resolved based on what kind of case it is. Create it yourself with:

```bash
{{CLI_COMMAND}} new my_project --template showcase
```

Its file lives at `flows/support_case/nodes/route/route.node.yaml`. The showcase is written for a
Russian-market storefront, so its descriptions are in Russian; the file below is translated to English
for this page:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "switch"
description: "Routes the case by kind: a defect is resolved by an agent, delivery and questions get a fixed decision"
on: "$to_record.out"
cases:
  defect:
    node: "resolve"
    bind:
    - name: "resolution"
      from: "$resolve.out.resolution"
  delivery:
    bind:
    - name: "resolution"
      value:
        action: "reship"
        summary: "Reshipping the order at the store's expense"
        credit: null
        policy: null
  question:
    bind:
    - name: "resolution"
      value:
        action: "advice"
        summary: "An answer from the knowledge base, no compensation"
        credit: null
        policy: null
out:
- name: "resolution"
  type: "Resolution"
  description: "The decision reached for the case"
```

`on: "$to_record.out"` reads the output of an earlier node, `to_record`, which narrows the raw request
down to `CaseRecord` — a discriminated union with three variants: `defect`, `delivery`, `question`, each
shaped differently. That's exactly the three keys `cases` has to cover.

`delivery` and `question` set no `node` at all — they just bind `resolution` to a fixed value, so a
delivery problem and a plain question both get resolved without ever calling a model. `defect` runs
`resolve`, an `llm` node, then binds `resolution` from what it returned. `Resolution` carries an
`action`, a `summary`, an optional `credit`, and the policy it was decided under; the two fixed cases
leave `credit` and `policy` null since there's no per-case policy behind an always-the-same decision.

`resolve.node.yaml`, the node `defect` runs, is where `$case` shows up:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "llm"
description: "An agent resolves the defect case: the order, prior contacts, policy from a subagent, credit with approval"
agent: "resolver"
in:
- name: "customer"
  from: "$input.customer"
- name: "order_id"
  from: "$case.order_id"
- name: "symptom"
  from: "$case.symptom"
- name: "purchased_on"
  from: "$case.purchased_on"
- name: "safety_risk"
  from: "$case.safety_risk"
- name: "intake_extra"
  from: "$triage.out.intake_extra"
- name: "policies"
  from: "$search_kb.out.policies"
```

Because this node only ever runs inside the `defect` case, `$case` here is `on` narrowed to the
`defect` variant of `CaseRecord` — so `$case.order_id`, `$case.symptom`, `$case.purchased_on`, and
`$case.safety_risk` are exactly that variant's own fields. Had `delivery` or `question` run a node of
their own, `$case` inside it would resolve to their variant's fields instead — `damage` and
`carrier_ref` for `delivery`, `topic` for `question` — not `defect`'s.

## See also

- [How to call a model](/engine/llm-node/) — what `resolve`, the `defect` case's node, actually is.
- [How to run a step over a collection](/engine/map-node/) — `$item` and `$index`, a map body's own
  reference forms, the same way `$case` belongs only to a switch's cases.
- [How to branch into parallel steps](/engine/parallel-node/) — every branch runs, instead of one case
  out of several.
- [The engineering loop](/concepts/engineering-loop/) — what to do when a run's output isn't what you
  expected.
- [Node specifications](/reference/nodes/) — every field on `SwitchNodeSpec` and `SwitchCase`, generated
  from the code.
- [Type specifications](/reference/types/) — how a discriminated union like `CaseRecord` is declared.
