---
title: Structured Output & Types
description: Field order, nesting limits, enum and union design, strict-mode tradeoffs.
---

Getting a model to return valid JSON is solved. Getting it to return *good* JSON — the right values, reasoned in
the right order, without quietly hallucinating a field it couldn't fill — is a schema design problem, and AQVEN's
type system is built around a specific set of answers to it.

## Reasoning before answer

Under constrained decoding, a model emits the fields of a schema in order, left to right, with no ability to revise
an earlier field once a later one is generated. A field placed before an answer field is a real scratchpad — the
model can reason in it before committing. A field placed *after* the answer is a postmortem: it explains a decision
the model already made, not one it's still making.

**Rule: any reasoning, evidence, or rationale field goes before the answer/label field it supports, always.** This
is why `judge_panel`'s `tie_break` inference and every `critique` inference in Lumen declare their rationale field
ahead of the verdict field in `out` — not as a style preference, but because the field order is what the model
actually reasons through.

## Depth and size

Two to three levels of nesting is the comfortable zone; four or more produces systematic errors — values land on
the wrong level, whole nested objects get skipped. AQVEN's own type kinds (`enum`, `id`, `record`, `union`, `value`)
stay flat by design: a `record` composes other named types by reference, not by inlining them, so a type's own
declaration rarely nests more than one level deep even when the composed shape is complex.

If a node's `in`/`out` is approaching a few dozen fields, that's a signal to split it into more than one extractor
node rather than widen a single schema — not a hard limit AQVEN enforces, but a pattern worth building into a
flow's shape from the start.

## Enums and discriminated unions

A closed set of values should be an `enum` type, not a free-text string with a description asking the model to
pick from a list — constraining the token space is the one schema choice that both improves accuracy and removes
an entire class of hallucinated values. Lumen's `types/enums/` folder is full of these: `CaseIntent`,
`ApprovalDecision`, `ReplyCriterion`.

When a value can be one of several *shapes*, not just one of several labels, that's a `union` type with a
discriminator — never a single object with every variant's fields made optional. An optional-everything object
invites a model to fill in fields from two variants at once. Lumen's `types/unions/case_origin.yaml` and
`case_record.yaml` are discriminated unions; each variant carries its own tag, and the tag is what a `switch` node
branches on.

There is no single enum-size ceiling, but past roughly fifty values a static enum stops being the right tool —
retrieve a short candidate list first and constrain the schema to that instead of shipping the full set on every
call.

## Required, nullable, and allowed sets

A `required` field with no nullable path forces a model to invent a value when the source data genuinely doesn't
have one. Anything that can legitimately be absent from the input must be typed so the model can say so, not
coerced into looking complete. `types/ids/` values that reference a real, bounded set of identifiers (an
`allowed_set`) work the same way at the identifier level: up to about fifty values, list them inline; past that,
the identifier moves to an indexed lookup rather than being embedded whole in every schema.

## There is no one strict schema for every provider

OpenAI, Anthropic, and Gemini support different, overlapping subsets of JSON Schema under their strict/native
structured-output modes — `oneOf` behaves differently everywhere, numeric and string constraints aren't enforced
identically, and recursion support varies. AQVEN compiles a schema per **(type × provider)** pair rather than
maintaining one portable schema and hoping every provider interprets it the same way. `output.strict` is resolved
per profile, not assumed on: an agent gets `strict: true` only when its declared output mode and the resolved
provider profile are actually compatible, otherwise AQVEN falls back rather than sending a schema the provider
would reject or silently ignore.
