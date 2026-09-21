---
title: Inferences
description: Declare a model task, structured output, checks, examples, and presentation.
---

An `llm` node wires data into a model task. Its **inference** defines what the task accepts and returns. Its **agent** chooses the model and model settings. Keeping these separate lets you reuse the same task with another model, or use one model for several tasks.

## Define a task and its output

This complete `reply.inference.yaml` accepts a question and a tone and returns one bounded reply:

```yaml
apiVersion: "aqven/v1"
kind: "Inference"
description: "Answer a question in the requested tone"
in:
  - name: "text"
    type: "Text"
    description: "Question to answer"
    maxLength: 2000
  - name: "tone"
    type: "Tone"
    description: "Requested tone"
out:
  - name: "reply"
    type: "Text"
    description: "Answer in at most 120 words"
    maxLength: 2000
```

The neighboring `reply.prompt.md` can use `{{ text }}`, `{{ tone }}`, and `{{ output_format }}`. The output marker inserts the declared output contract. The `llm` node binds `text` and `tone` by name. If you add a required inference input, update every node that calls it; if you rename `reply`, update flow returns and downstream references.

## Choose a prompt source

The default is a neighboring prompt file. Set `prompt` when the task should use another prompt file or a Python prompt renderer:

```yaml
prompt: "shared_answer.prompt.md"
```

Changing the prompt source changes the model request, even when the input and output contracts stay the same. Preview it with `uv run {{CLI_COMMAND}} prompt preview FLOW.NODE --project .`. [Prompts](/engineering/prompts/) covers template syntax and previewing.

## Add examples

An inference can store named input/output examples:

```yaml
examples:
  - name: "short factual answer"
    in:
      text: "What is a return window?"
      tone: "friendly"
    out:
      reply: "It is the period when an item can be returned."
```

Keep examples valid against the declared types. When a real failure reveals a missing case, add it to a dataset as well so the behavior can be measured across changes. See [Datasets and evaluations](/engineering/testing-and-evaluation/).

## Check an answer before it leaves

A check runs against the inference result. The built-in `max_words` evaluator can enforce a word limit:

```yaml
checks:
  - use: "max_words"
    with:
      field: "$out.reply"
      max: 120
    on_fail: "retry"
```

`on_fail` is `retry`, `fail`, or `flag`. `retry` asks the model to try again within its retry and budget limits; `fail` stops the step; `flag` records the issue for review. Choose based on whether another model attempt could repair the problem. A code evaluator uses `run`; a model judge uses `inference` together with `agent`. These three evaluator sources are mutually exclusive. The generated [Inference reference](/engineering/reference/inference/#checkspec) lists the fields, and [built-in evaluators](/engineering/reference/built-in-policies/#evaluator) lists names and parameter types.

## Restrict an ID to the current input

A type can allow a dynamic set of IDs. For example, if the input contains retrieved articles, bind allowed IDs from that input:

```yaml
allowed_sets:
  - type: "ArticleId"
    from: "$in.articles[*].id"
    labels_from: "$in.articles[*].title"
```

This makes the model choose from IDs actually supplied for this call. The type must be declared as an `id` type with `allowed_set: "dynamic"`. Changing the input articles changes the set without changing the type file. `labels_from` supplies human-readable labels in the model context. Test an empty set and an ID the model has never seen.

## Show a readable result in Studio

Use `display` when the raw structured data is correct but hard to scan:

```yaml
display:
  output:
    template: "reply.output.display.liquid"
    variables:
      tone: "$in.tone"
```

A display formatter changes presentation, not the inference output contract. It can use exactly one of `template` and `run`; `variables` binds named values into the formatter. The generated [Display formatter reference](/engineering/reference/inference/#displayformatterspec) has the exact shape.

## Change the output shape deliberately

`out` fields support the ordinary field constraints (`maxLength`, `maxItems`, numeric bounds, pattern, and enum) plus `schema_from`, `limits`, and `value_type` for dynamic outputs. Use a fixed record whenever the fields are known at design time. Use a dynamic shape only when an earlier input supplies the field definitions, then [narrow](/engineering/calls-and-narrowing/) it before a downstream step needs a stable type. The generated [OutputField reference](/engineering/reference/fields/#outputfield) is the source for every accepted key.
