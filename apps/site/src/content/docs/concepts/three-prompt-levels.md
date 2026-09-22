---
title: Three prompt levels
description: When to reach for a plain prompt, a Liquid template, or a Python function, and what each one gives up in exchange for what it gains.
---

## In short

A prompt file can be plain text, a Liquid template, or a Python function, and AQVEN picks the level from
what the file actually contains — you never declare it. Each step up buys more expressive power and
gives up some of what the level below it checks for you automatically. Stay at the lowest level that
does the job: it's the one with the most guarantees.

## Level 1: plain text is enough until wording has to change

If a prompt says the same thing on every run — no branching, no list to walk, no field that's sometimes
there and sometimes not — plain text is the right level. AQVEN writes the inputs and the output contract
into the call for you, so there's nothing to get wrong on that front, and there's no template syntax that
could fail to parse.

## Level 2: branch on an input, with a checked safety net

The moment wording needs to change based on an input's value — a field that's only sometimes present, an
enum that changes which paragraph applies, a list you need to walk one line at a time — reach for a
Liquid template instead of plain text. The payoff isn't just the branching itself: every condition, loop,
and case in the template is checked before a run ever happens, against the same field types the rest of
the project uses.

The [showcase](/start/quickstart/) project's `triage` node is a real case of this escalation. Its inputs include four optional
attachments — a photo, a voice note, a video, an invoice — and the prompt only mentions each one when it's
actually there:

```liquid
{% if photo %}
Attached: describe what's visible in it, and check it against the text of the message.
{% endif %}
{% if voice_note %}
Attached: a voice note. Weigh what it says the same as the text.
{% endif %}
```

That presence check is what pushes the file from level 1 to level 2 — nothing here needed a numeric
comparison or a lookup table, just a plain `{% if %}` on a field that's sometimes null.

## Level 2's ceiling: what it won't let you write

The same checking that makes level 2 safe also bounds what it can express, and the bound is strict:

- No filters at all — the allow-list is empty. Any reshaping of a value happens in code before the
  template renders it, not inline in the prompt.
- `{% if %}` can only compare a field against an enum value, `true`, `false`, or `nil` — never a number.
  Write `{% if wait_days > 3 %}` and the check fails before the prompt ever reaches a model, pointing you
  at deriving a `Bool` field for the threshold instead, computed once in code rather than re-evaluated as
  a magic number inside the template.
- `{% for %}` can't nest, and it can only walk a field declared as an array with a size limit. An
  unbounded list, or a loop inside a loop, is rejected the same way.
- `{% case %}` has to cover every value of the enum it switches on, and it can't fall back on a catch-all
  `{% else %}`. Add a new value to the enum later, and every `{% case %}` that switches on it stops
  passing until you add the matching branch.

Every one of these is a compile-time guarantee, not a runtime nicety: a template that violates them never
gets as far as calling a model.

## Level 3: a Python function, and what it gives up

Once a prompt needs something level 2 can't express by construction — a numeric threshold, string
post-processing, a lookup table keyed on more than a bare enum — write the prompt as a Python function
instead. Nothing about what the function can do is restricted the way a template is: it's ordinary code.

That freedom has a real cost. Level 1 and level 2 are checked against the actual field types and shapes
declared for the node; a level-3 function is checked only for its signature and return type. Whether it
reads every input it's given, or returns something that makes sense for the case at hand, isn't checked
at all — a function that ignores half its arguments or always returns the same text passes the same way
a correct one does.

The showcase project's `illustrate` node is the one prompt in the whole project written as a function,
and it's worth noting why: its logic is a lookup table keyed on a plain product-category enum, the same
shape of decision a level-2 `{% case %}` handles directly. It reaches level 3 by choice, because the
lookup reads more naturally as a Python dictionary than as a template, not because level 2 was
insufficient for it.

## How this shapes what you do

Start writing a new prompt as plain text, and only reach for a template once the wording itself needs to
branch — you don't pick a level up front, what you write decides it. If check rejects a numeric
comparison, an unbounded loop, or a non-exhaustive `{% case %}` in a template, treat that as it telling
you what level 2 can't guarantee about that piece of logic, not as an obstacle to route around: either
reshape the value in code so the template only has to branch on the result, or move the whole prompt to
level 3.

Moving to level 3 trades away the checks that catch a broken prompt before a run — from that point on, a
function that quietly ignores an input or returns nonsense is your own bug to catch, not something
`{{CLI_COMMAND}} check` will find for you.

## See also

- [How to write a prompt](/engine/prompts/) — file naming, how AQVEN detects the level, the
  `{% message %}` tag, `{% include %}`, and the exact function signature a level-3 prompt returns.
- [What this is built on](/concepts/what-this-is-built-on/) — the library that renders level 2 templates.
- [How to call a model](/engine/llm-node/) — the node kind that calls the prompt you write.
- [How to check a project before committing](/engine/check/) — what running check actually validates,
  prompts included.
- [What happens when a model is called](/concepts/what-happens-when-a-model-is-called/) — the guarantees
  around the call itself, once the prompt has rendered.
- [Five cases of dynamic input and output shape](/concepts/five-dynamic-shape-cases/) — what an input or output field looks
  like when its shape isn't fixed at design time.
