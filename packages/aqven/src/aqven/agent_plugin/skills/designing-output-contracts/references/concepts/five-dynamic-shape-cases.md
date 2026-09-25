# Five cases of dynamic input and output shape

The five ways a node's input or output shape can vary at run time, from an allowed-set of values to a fully dynamic schema, and the rule for picking the least dynamic one that solves the task.

## Contents

- [In short](#in-short)
- [The five cases, in order](#the-five-cases-in-order)
- [What each step up costs you](#what-each-step-up-costs-you)
- [Case 4 in the showcase: triage's intake_extra](#case-4-in-the-showcase-triages-intake_extra)
- [How this shapes what you do](#how-this-shapes-what-you-do)
- [See also](#see-also)

## In short

A node's fields don't have to be fixed the moment you write the flow — AQVEN gives you five different
ways to let shape vary at run time, each trading away a different static guarantee for more
flexibility. They form a ladder: take the least dynamic case that solves the task, because every step
up costs you something a fully static field would have given you for free.

## The five cases, in order

1. **Only the values vary.** The structure is fixed and known when you write the flow; only which value
   fills it — an id, a code, a choice from a fixed set — depends on data. Declare an allowed-set. The
   field itself stays ordinarily typed.
2. **Which of several known-in-advance structural variants applies.** You know every shape the value
   could take; you just don't know which one until run time. Model it as a discriminated union and route
   on it with a `switch` node — see How to route by a value for the mechanism.
   Every variant is still visible to the compiler; nothing is left unchecked.
3. **A set of fields given by configuration, all the same kind of value.** The *names* of the fields
   aren't fixed, but every one of them holds the same kind of thing — a set of settings, a set of labeled
   scores. Unroll it into a list of `{key, value}` rows instead of naming each field, with an allowed-set
   constraining which keys are legal. The list itself keeps a fixed shape; only the keys inside it vary.
4. **A static core plus one open-ended extension.** Most of the node's output is fixed and known; exactly
   one part of it depends on data you only have at run time. Keep every other field ordinarily typed and
   declare just that one field `Dynamic`. The core keeps every static guarantee; only the one extension
   gives it up.
5. **The whole shape is unknown ahead of time.** Not one field of several — the entire output. The whole
   value is declared `Dynamic`, its real schema built from data at run time, bounded by limits so it can't
   grow without bound, and turned back into a typed value later with a `narrow` node once the flow knows
   which type actually applies. [How to handle a shape you don't know in advance](../engine/dynamic-shape.md)
   documents this case start to finish, with its own worked example — this page doesn't repeat it.

Cases 1 through 3 never touch the `Dynamic` type at all — they get you real dynamism while every field
stays ordinarily typed. Only cases 4 and 5 use `Dynamic`, and AQVEN enforces the same rule on both:
nowhere in the project can you reach into a `Dynamic` value by field name — not in a `switch` condition,
not in a prompt template variable, not in an ordinarily typed binding. That's what actually forces a
`narrow` node or whole-value consumption at cases 4 and 5. It isn't a style convention; it's checked.

## What each step up costs you

Moving from case 1 toward case 5 isn't free. Every `Dynamic` field gives up guarantees that an
ordinarily typed field gets automatically:

- **Static type-checking between nodes.** A normal field lets AQVEN catch a binding to a field that
  doesn't exist, or of the wrong type, before any run happens. A `Dynamic` field can't be checked that
  way — there's no fixed set of names to check a binding against.
- **Template-usage checking.** A prompt that references a normal field by name gets that reference
  checked against the field's real type. A `Dynamic` value can only be dropped into a prompt whole; a
  typo in a field name inside it isn't something a check can catch, because there's no fixed field list
  to check it against.
- **A stable schema hash.** An ordinary inference's output schema is identical on every run, so its hash
  is stable too — useful for caching and for comparing runs. A `Dynamic` output's schema is rebuilt from
  whatever data resolves at call time, so its hash moves with the data.
- **The provider's structured-output grammar cache.** A model provider that supports structured output
  compiles a grammar for a schema once and reuses it across calls. A schema that can be different on
  every call can't reuse that cache — every call pays the compile cost again.

Forbidding dynamism entirely would keep all four guarantees everywhere, but it has its own cost: without
a `Dynamic` type, there's no way to express a node whose real fields genuinely depend on data you only
have once the flow is running — a marketplace's own intake form, a case record whose shape depends on
which kind of case it turns out to be. Cases 4 and 5 exist for exactly that, and the choice between them
is how much of the node's output actually needs to give up the guarantees above.

## Case 4 in the showcase: triage's intake_extra

The showcase project's `support_case` flow has a real case 4. Its `triage` inference's `out:` block ends
like this — two of its four static fields shown, the rest collapsed:

```yaml
out:
- name: "summary"
  type: "Text"
- name: "safety_risk"
  type: "Bool"
- name: "intake_extra"
  type: "Dynamic"
  schema_from: "$in.intake_fields"
  limits:
    max_fields: 10
    max_depth: 1
    max_text_length: 200
    max_items: 5
```

`summary` and `safety_risk` stand in for `triage`'s four ordinarily typed output fields — checked,
bindable, referenceable by name, same as any other field in the project. `intake_extra` is the one
exception: its schema is built from `intake_fields`, one of `triage`'s own inputs — a list of field
descriptions computed earlier in the flow from context the flow doesn't have until run time. `limits`
bounds how big that shape is allowed to get, whatever it turns out to be.

Nothing downstream ever narrows `intake_extra` to a fixed type — later nodes take it in as `Dynamic`
too and use it whole. That's the shape of case 4: the fields that can stay static do, and the one field
that can't get those guarantees is exactly as open-ended as it needs to be, no more.

Case 5 looks different in one important way: there, the *entire* output is unknown ahead of time, not
one field alongside several fixed ones, and a later `narrow` node is what turns the whole thing back
into a typed value once the flow knows which type applies. That's the `case_form`/`extract` pair walked
in full on [How to handle a shape you don't know in advance](../engine/dynamic-shape.md).

## How this shapes what you do

- Before reaching for `Dynamic`, check whether an allowed-set (case 1), a discriminated union with a
  `switch` (case 2), or unrolled `{key, value}` rows (case 3) already covers what you need — each keeps
  every field ordinarily typed and every guarantee `aqven check` can give you.
- An allowed-set only becomes a real constrained choice for the model up to 50 values: AQVEN rewrites
  the schema so the model can literally only pick one of the values you gave it. Past 50, the model
  isn't restricted to your list anymore — it can return anything that fits the field's own type. AQVEN
  still checks the answer against the full set afterward and retries on a bad pick, but that catches the
  mistake after the fact instead of preventing it. For a genuinely large candidate set — hundreds or
  thousands of ids — narrow it to the relevant candidates yourself, with your own retrieval or
  filtering, before the call, instead of handing the model the whole list.
- Reach for case 4 the moment most of a node's output is fixed and only one genuinely open-ended part
  depends on data. Don't widen the whole output to `Dynamic` because one field needs it — keep the rest
  ordinarily typed.
- Reach for case 5 only when the whole shape, not a part of it, is unknown ahead of time — and plan for
  how the value comes back to being typed, whether that's a `narrow` node or, like `intake_extra`,
  deliberately consuming it as `Dynamic` all the way through.
- Whichever case you land on, a `Dynamic` field's real schema is only exercised by `aqven check`'s
  simulation pass, not by the static pass alone — see How to check a project before
  committing for what each pass actually verifies.

## See also

- [How to handle a shape you don't know in advance](../engine/dynamic-shape.md) — case 5's mechanics in
  full: declaring a field `Dynamic`, building its schema from data, and reading it back.
- How to narrow a dynamic value to a type — turning a `Dynamic` value into an
  ordinarily typed one.
- How to route by a value — case 2's mechanism.
- How to check a project before committing — what static checking and simulation each
  verify for a `Dynamic` field.
- Ten kinds of nodes — `narrow` alongside the other nine node kinds.
