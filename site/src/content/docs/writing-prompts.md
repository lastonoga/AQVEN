---
title: Writing Prompts
description: Prompt levels, the Liquid template rules, output format, variants, and message blocks.
---

The prompt of an inference is a Markdown file next to it (`<inference>.prompt.md`) — never a string inside YAML.

## Three levels

| Level | What's in `prompt` | Who writes the text |
|---|---|---|
| 1. Instruction | Plain text, no variables | The engine appends inputs and the output format itself |
| 2. Template | A Liquid template with variables, conditions, fragments, variants | You — the usual case |
| 3. Code | A function returning a rendered prompt | You, for prompts a template can't express |

Level 2 is a small, deliberately narrow subset of Liquid: `if`/`elsif`/`else`, `case`/`when`, `for`, `include`,
`comment`, `#`, and `message`. **Filters aren't allowed** — formatting belongs in a `code` node, so what the
model reads is what the data actually is, not a reformatted version of it.

```liquid
Decide on this refund request for order {{ order.order_id }}.
{% if order.receipt %}Check the amount and date against the attached photo.{% endif %}
Policies:
{% for policy in policies %}- {{ policy.id }}: {{ policy.text }}
{% endfor %}
{{ output_format }}
```

## What the renderer checks for you

- Every variable must be a declared input of the inference (`E_PROMPT_VARIABLE_UNDECLARED`), and every declared
  input must actually appear in the template (`E_PROMPT_INPUT_UNUSED`) — the contract and the text can't drift
  apart.
- `{{ output_format }}` must appear exactly once (`E_PROMPT_OUTPUT_FORMAT`). It renders the output fields with
  their descriptions and the allowed values of any id types — see
  [Structured Output & Types](/structured-output-and-types/) for why that field order matters.
- `{% message system %}`, `{% message user %}` and `{% message assistant %}` split the prompt into a
  conversation; without one, the whole text is a single user message.
- `{% include "fragments/brand_voice" %}` inlines a fragment. Fragments are static text — a variable inside one
  is an error, because a fragment has no contract of its own.
- `{% for %}` only iterates a declared array input; `{% case %}` over an enum must cover every value
  (`E_PROMPT_CASE_NOT_EXHAUSTIVE`).
- Media inputs (`Image`, `Audio`, `Video`, `Document`) are sent as message parts, not rendered as text — use them
  only inside a condition (`{% if photo %}`). Rendering one directly is `E_PROMPT_MEDIA_RENDERED`.

## Variants

A variant slot swaps a piece of text based on a value:

```yaml
variants:
  tone:
    on: "$in.mood"
    cases:
      calm: "calm"
      warm: "warm"
```

The files live at `<inference>.variants/<slot>/<case>.md`; the prompt prints `{{ variants.tone }}`. A value with
no matching case needs a `default`, or the run fails. Variants are for wording that changes with the data — a
branch that changes what the flow *does* belongs in a `switch` node, not a variant.

## What to actually write

- Put the stable instruction — role, standing rules — in the agent's `instructions`; put the per-call work in
  the prompt. The instruction is shared by every inference that agent runs.
- Give the model the data, not a description of the data. Wrap free text in a tag
  (`<question>{{ text }}</question>`) so the boundary is unambiguous.
- Don't repeat the output schema in prose — `{{ output_format }}` already states the fields, the allowed values
  and every bound; a second, hand-written copy is what drifts out of sync.
- Say what to do when the data is missing or contradictory, or the model invents a rule for you.
- One instruction per sentence, no "either... or...", and keep the order of the steps the same as the order of
  the output fields.

## Reading what you actually sent

```
aqven prompt preview support_case.reply --project src/lumen
aqven prompt preview support_case.reply --input case.json --variant tone=warm
```

This prints the exact instructions, every message with fragments and variants already rendered, the
attachments, the tools offered, and the output contract. Read it after every prompt edit — most prompt bugs are
visible here in one second: a placeholder that stayed literal, an input that never reaches the text, a variant
that never switches. Never use a real model call to find out whether a prompt is wired correctly; that's what
this is for.
