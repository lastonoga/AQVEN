# How big an output schema can get

A provider builds your output schema into a state machine before the model writes a token. Nesting, list lengths, enums and string lengths multiply its size, and past a limit the call fails. How to keep outputs small, how the failures look, and when prompted mode helps.

## Contents

- [In short](#in-short)
- [What makes the space grow](#what-makes-the-space-grow)
- [How the failure looks](#how-the-failure-looks)
- [Tool mode and prompted mode](#tool-mode-and-prompted-mode)
- [An example: three ways to shrink one output](#an-example-three-ways-to-shrink-one-output)
- [How this shapes what you do](#how-this-shapes-what-you-do)
- [See also](#see-also)

## In short

When an `llm` node asks for structured output in `tool` or `native` mode, the provider compiles your
output schema into a grammar that steers the model token by token. Every nested object, every list item,
every enum value and every character a string may hold adds states to that grammar, and they multiply.
Past the provider's limit the request is refused before the model answers (`OUTPUT_SCHEMA_REJECTED`).
Below the limit, the model may still accept the schema and fill it wrong (`MODEL_SCHEMA_MISMATCH`). Keep
outputs flat and bounded, and probe each model's real limits with `aqven models shapes --live`.
When a schema still fails, the options are `prompted` mode, a smaller type, or the work split across fields or
calls. Each has its own cost, so compare them on the cases that failed.

## What makes the space grow

| Part of the schema | Why the space grows | What to do instead |
|---|---|---|
| a list of objects | every item repeats the whole item schema, up to `maxItems` times | the smallest `maxItems` the consumer needs |
| nesting | each level wraps every state below it | flat records; nest only what the consumer reads as a unit |
| an enum | every value is a branch | a small closed set; a large set of codes goes to a lookup step |
| `maxLength` on `Text` | a longer string has more positions to track | the length the consumer shows or stores, not "enough for anything" |
| optional fields and unions | every alternative is a branch | required fields; a union only where the shapes really differ |

The factors multiply. A catalogue page with twelve products and up to thirty attributes each is 360
readings in one answer, and each reading carries its own enum and its own string.

A closed vocabulary inside a list multiplies the same way. A list of up to 15 topic tags for a support
ticket, each chosen from 60 values, asks for 60 branches at each of 15 positions, on top of the rest of
the record. Some providers refuse that before the model runs, with provider text such as "too many
states for serving" (`OUTPUT_SCHEMA_REJECTED`). Three options avoid the refusal, and none is right by default:

| Option | What changes | What it costs |
|---|---|---|
| `prompted` mode | the schema goes into the prompt as text and AQVEN validates the answer, so the provider builds no grammar (see [Tool mode and prompted mode](#tool-mode-and-prompted-mode)) | a broken answer is repaired by another paid call; nothing constrains the model while it writes |
| a smaller type | only the values the consumer's decision needs, a lower `maxItems` | the values you drop are gone for every consumer |
| the list split across fields or calls | one field or one call per group of values, or a yes or no per group | more fields or more calls; each call sees only its group, and a yes or no per group tends to raise false alarms |

Offer the options that fit and measure the one you pick.

`output.strict: false` does not help: the schema still goes to the provider, and the provider still
builds it. Check the fix with one call on the case that failed before you run every variant again.

`aqven check` already refuses an output that has no bound at all. An output list without
`maxItems`, or an output `Text` without `maxLength` or `enum`, is `E_OUTPUT_UNBOUNDED`. A bounded schema
can still be too big for one model. Only a real request tells you.

## How the failure looks

| What you see | What it means | Next step |
|---|---|---|
| `OUTPUT_SCHEMA_REJECTED`, with provider text such as "too many states for serving", "schema is too complex", "maximum nesting depth" or "compiled grammar is too large" | the provider refused to build the schema, and the model never ran | shrink the schema, split the step, or use `prompted` mode. A retry to the same model gets the same refusal |
| OpenRouter says "no endpoints found that can handle the requested parameters" in `tool` or `native` mode | no upstream provider of that model accepts the request with this schema | `prompted` mode, or another model |
| through OpenRouter, the same node fails on some calls and passes on others | calls went to different upstream providers, and only some of them accept the schema | set `require_parameters: true` and a provider order in the agent's `settings.provider_options` |
| `MODEL_SCHEMA_MISMATCH` such as "Field required" or "Extra inputs are not permitted", ending in `MODEL_RETRIES_EXHAUSTED` | the model accepted the schema and lost track of it | a shallower schema for this model, `prompted` mode, or another model |

A series counts all of these as the model's failure, not as an infrastructure error. See
How a series decides.

When you pin one upstream provider, that provider's rate limits have no way out. Give the agent
`fallback_models` as well.

## Tool mode and prompted mode

The agent's `output.mode` decides who holds the model to the schema:

| Mode | Who enforces the schema | Trade-off |
|---|---|---|
| `tool`, `native` | the provider constrains the answer while the model writes it | the provider's limits on schema size apply |
| `prompted` | the schema goes into the prompt as text, and AQVEN validates the answer | no provider limit on size; a broken answer goes back to the model for repair within `output.retries`, and each repair is a paid call |
| `auto` | resolved per model | `aqven check` reports the choice as `W_OUTPUT_MODE_RESOLVED`; pin it |

`aqven models check <agent> --project <package> --live` tries every mode on a small schema and
reports which modes each model supports. A small probe that passes does not prove your real schema works.
The number that does is `schema_valid_first_try` in a series: the share of attempts whose first answer
fit the schema, before any repair.

For example, three candidate models read groups of product attributes from catalogue pages. Every
model passes its probe in `tool` mode, because the probe's schema is small. On real pages, one model fails
again and again on the largest group with `MODEL_SCHEMA_MISMATCH: presence: Field required`. Run the same
experiment with that agent in `prompted` mode and compare three numbers: `schema_valid_first_try`, the share
of complete answers, and the cost. Fewer repairs can make `prompted` cheaper as well as more reliable, but only
the series shows it for your schema.

## An example: three ways to shrink one output

One call that returns every product on a catalogue page, each with every attribute, holds the whole
page in one answer: twelve products and thirty attributes are 360 readings. Three designs make it smaller, and
each is a candidate to measure, not the fix:

| Design | What the model holds per call | What it costs |
|---|---|---|
| the same call in `prompted` mode | all 360 readings, with no grammar | repairs are paid calls; a long answer is still easy to break |
| attributes asked in groups, one field or one call per group | one group's readings | more calls; each call sees only its group |
| a `map` over the products, one call per product | one product's readings | calls × products; each call loses what the page shares, such as a table header or a footnote |

For the `map` design, the item type stays small, and the evidence string is only as long as a person reads:

```yaml
apiVersion: "aqven/v1"
kind: "Type"
type: "record"
description: "The attributes read for one product on a catalogue page"
fields:
- name: "product"
  type: "Text"
  description: "The key of the product, as given in the input"
  maxLength: 40
- name: "attributes"
  type: "AttributeReading[]"
  description: "One reading per attribute asked about for this product"
  maxItems: 8
```

The model holds 8 readings per call instead of 360. Each call is cheaper to repair and a failure names one
product, at twelve calls per page instead of one. Put the designs side by side as a `use` factor on the node,
or a `flow` factor on a `call` slot, and compare completeness, `schema_valid_first_try` and cost.

## How this shapes what you do

- Design an output from the decision its consumer makes. Use the fewest fields, flat records, small
  enums, and `maxItems` and `maxLength` everywhere.
- Before you build around a nested or large output, run `aqven models shapes <agent> --project
  <package> --live`. Run it for the agent's model and for every model in `fallback_models`. Each probe is a
  billed request.
- State the limits in the prompt text as well. A model that is never told about a 200-character cap
  breaks it. That is a gap in the prompt, not in the model.
- When a schema that passed its probe fails on real inputs, the options are `prompted` mode, a smaller
  schema and another model. Try one on the failing case, then compare `schema_valid_first_try` in a series.
- When a large enum inside a list is refused, the options are `prompted`, a smaller type and a split.
  `strict: false` does not help. Confirm the chosen option with one call on the failing case.
- When the shape of the answer depends on the input, pick the least dynamic of the
  [five cases of dynamic shape](five-dynamic-shape-cases.md).

## See also

- [How to find a model's real structural limits](../engine/check-shapes.md): the probe and its report.
- [How to check your model providers are configured](../engine/check-providers.md): which output modes a model
  supports.
- [How to constrain a field's values](../engine/field-constraints.md): `maxLength`, `maxItems`, `enum` and the
  rest.
- What happens when a model is called: outcomes and the
  repair retry.
- [Answer, refusal and unknown are different states](answer-refusal-and-unknown.md): what the
  fields of an answer should mean.
