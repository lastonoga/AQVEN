---
title: How to constrain a field's values
description: Every in and out field can carry length, range, pattern, and choice constraints that a model's answer must actually obey — one small example per constraint, plus what happens when one is broken.
---

## When you need this

Every field you declare in an Inference or Tool file's `in:` or `out:` — and every field a deterministic
node like `switch` or `human` declares in its own `out:` — can carry a handful of optional constraints on
top of `type` and `description`. These aren't documentation for a person reading the YAML: for an `llm`
node's output fields, they become part of the real contract the model's answer has to satisfy, and a
violation gets sent back to the model to fix automatically, not silently accepted.

There are six of them. Each one only applies to certain types, and `{{CLI_COMMAND}} check` rejects a
constraint on a field it doesn't apply to.

## `maxLength` — cap how long a `Text` field can be

```yaml
- name: "summary"
  type: "Text"
  description: "A one-paragraph summary of the case"
  maxLength: 600
```

## `pattern` — require a `Text` field to match a regular expression

```yaml
- name: "order_id"
  type: "Text"
  description: "The order number, in the form ORD-000000"
  pattern: "^ORD-\\d{6}$"
```

## `enum` — restrict a `Text` field to a fixed list of values you write yourself

```yaml
- name: "priority"
  type: "Text"
  description: "How urgent the case is"
  enum: ["low", "normal", "high"]
```

This isn't a hint the model can ignore — it becomes a real closed choice. The field can only ever come
back as one of the listed strings.

## `minimum` and `maximum` — bound an `Int` or `Float` field, inclusive on both ends

```yaml
- name: "confidence"
  type: "Float"
  description: "How sure the model is, from 0 to 1"
  minimum: 0
  maximum: 1
```

## `maxItems` — cap how many items a list field can return

```yaml
- name: "chunks"
  type: "KbChunk[]"
  description: "The matched article chunks"
  maxItems: 80
```

This works on a list of any item type — `Text[]`, `Int[]`, or a list of a record type all take `maxItems`
the same way; the cap is on the list, not on what's inside it.

## There's no minimum length or minimum count

You can cap a `Text` field's length or a list's item count, but you can't require a minimum of either —
there's no `minLength` or `minItems` to write. That's not a gap in this page; the field grammar doesn't
have them. If a field genuinely can't be empty, say so in its `description` — the model reads that, but
nothing in the schema itself enforces a floor.

## A constraint only applies to the right type

| Constraint | Valid on |
| --- | --- |
| `maxLength`, `pattern`, `enum` | `Text` |
| `minimum`, `maximum` | `Int`, `Float` |
| `maxItems` | any list (`T[]`) |

Put `maxLength` on an `Int` field, or `minimum` on a `Text` field, and the project fails to check — a
build-breaking error, before the flow ever runs, not a warning you can ignore.

## Every list or plain-text output field needs one

This part isn't optional if you want the project to check clean: every `out:` field that's a list needs
`maxItems`, and every plain `Text` output field needs either `maxLength` or `enum`. So a list field can't
come back with an unbounded number of items, and a block of free text can't come back an unbounded
length. This is why [how to call a model](/engine/llm-node/)'s worked example has a constraint on every
single field in its `out:` — that's not extra rigor its author added, it's what `{{CLI_COMMAND}} check`
requires. Input fields (`in:`) don't carry this requirement — only what the model has to answer for does.

## What happens when a constraint is broken

Two things, both real:

1. The model is told about the limit up front, in plain language, as part of the instructions it's given
   for the call.
2. If it answers outside the limit anyway, AQVEN doesn't accept the answer. The violation is sent back to
   the model as a correction request, and it tries again — up to the agent's own retry limit (the
   `retries` setting on the Agent file).

One exception: `pattern` doesn't get spelled out in that plain-language limits summary the way the others
do. It's still enforced, and a mismatch still triggers a retry — the model just isn't told the exact
regular expression up front. If a pattern is easy to get wrong, describe the expected shape in the
field's own `description` too, since that text does reach the prompt.

## Optional fields and lists: `?` and `[]`

A type name can carry two suffixes, and only in this order:

- `T[]` — a required list of `T`.
- `T?` — an optional (nullable) `T`.
- `T[]?` — an optional list: the whole list can be absent, but if it's present, every item in it is a
  real `T`.

`T?[]` (a list where individual items can be absent) and `T[][]` (a list of lists) are both rejected.
Optionality and list-ness each apply once, to the outside of the type — never to individual items, and
never nested.

## A list you write vs. a list the project already knows

`enum` is for a small, fixed set of values you're willing to type directly into the YAML — a status, a
category, a handful of routes. For a choice that comes from data your project already has — existing
order IDs, product codes, anything too large or too dynamic to hand-write into a field declaration —
that's a different, more advanced mechanism: an allowed-set, bound to a project-declared id type rather
than written as a literal list. [Five cases of dynamic input and output shape](/concepts/five-dynamic-shape-cases/)
covers it as its first case. They look similar from the model's point of view, but are declared
differently — `enum` is what you reach for first, and it covers most cases.

## See also

- [How to call a model](/engine/llm-node/) — the worked example where every `out` field carries one of
  these constraints.
- [Fields and bindings](/reference/fields/) — the generated reference for every field keyword, including
  the ones this page doesn't cover (`from`, `value`, `schema_from`).
- [Five cases of dynamic input and output shape](/concepts/five-dynamic-shape-cases/) — allowed-sets, and
  what to reach for when a field's shape isn't fixed enough to give it an ordinary type at all.
- [What happens to media before a model sees it](/concepts/what-happens-to-media-before-a-model-sees-it/)
  — why `Image`, `Audio`, `Video` and `Document` have none of the constraints on this page.
- [How to handle a shape you don't know in advance](/engine/dynamic-shape/) — the `Dynamic` type, for when
  the whole output shape, not just one field's value, depends on data.
- [What this is built on](/concepts/what-this-is-built-on/) — the retry and guarantee layer that enforces
  these constraints on every call.
