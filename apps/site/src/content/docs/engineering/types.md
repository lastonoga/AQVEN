---
title: Types and Structured Output
description: Model records, choices, variants, identifiers, and constrained values.
---

Types describe data entering and leaving flows, nodes, tools, and inferences. Source files live in `types/`; `{{CLI_COMMAND}} generate` turns them into Pydantic models for Python and structured model output. Name types for the business meaning of their values, not for a provider or prompt version.

## Record: named fields

Use a `record` when one value always has the same named fields. This complete `types/records/question.yaml` defines a request:

```yaml
apiVersion: "aqven/v1"
kind: "Type"
type: "record"
description: "A question and the tone of its answer"
fields:
  - name: "text"
    type: "Text"
    description: "Question text"
    maxLength: 2000
  - name: "tone"
    type: "Tone"
    description: "Requested tone"
```

Adding a required field changes every caller that constructs `Question`. Changing `maxLength` changes both validation and the contract shown to a model. If a field can be absent, use an optional type such as `Text?`, and define what `null` means.

## Enum: a closed choice

Use an `enum` for a small, stable set of labels:

```yaml
apiVersion: "aqven/v1"
kind: "Type"
type: "enum"
description: "Allowed answer tones"
values:
  - value: "friendly"
    description: "Warm and informal"
  - value: "formal"
    description: "Polite and businesslike"
```

Adding a value can affect `switch` cases, prompts, and downstream code. Renaming one is a data migration for stored cases and runs, not just a spelling change.

## Union: variants with different fields

Use a discriminated `union` when the shape differs by case. This source has a `kind` discriminator:

```yaml
apiVersion: "aqven/v1"
kind: "Type"
type: "union"
description: "Where a request came from"
discriminator: "kind"
variants:
  - name: "web"
    description: "Submitted on a website"
    fields:
      - name: "page"
        type: "Text"
        description: "Page where the request started"
        maxLength: 200
  - name: "email"
    description: "Received by email"
    fields:
      - name: "sender"
        type: "Text"
        description: "Sender address"
        maxLength: 320
```

A `web` value has `page`; an `email` value has `sender`. A downstream step should branch on `kind` before using a variant-only field. Adding a new variant means updating every branch that assumes the list is exhaustive.

## ID: validated identity

Use an `id` when a string identifies an entity and must follow a format:

```yaml
apiVersion: "aqven/v1"
kind: "Type"
type: "id"
description: "Article identifier"
pattern: "^ART-[0-9]{6}$"
maxLength: 10
allowed_set: "dynamic"
code_format: "identity"
```

`pattern` and `maxLength` reject malformed IDs. With `allowed_set: "dynamic"`, an inference can restrict an answer to IDs supplied in its current input using `allowed_sets`. This is useful for citations or selected records: the model can choose only from the retrieved items. See [Inferences](/engineering/inferences/#restrict-an-id-to-the-current-input).

## Value: a constrained scalar

Use a `value` when a scalar has a business range:

```yaml
apiVersion: "aqven/v1"
kind: "Type"
type: "value"
description: "Quality score from zero to one"
base: "Float"
minimum: 0
maximum: 1
```

`base` is one of `Text`, `Int`, `Float`, `Bool`, `Date`, or `DateTime`. Changing the range changes which historical values can still validate. For ordinary fields, the same constraints can be placed on a field declaration without creating a separate named type.

## Lists, optional values, and built-ins

Type references can express a list (`Article[]`) or an optional value (`Image?`). Use `maxItems` for lists and `maxLength` for text when the product has a real bound. Built-in scalar, context, media, and dynamic types are listed in the generated [Accepted values](/engineering/reference/accepted-values/) and [Media reference](/engineering/reference/media/).

After editing type YAML:

```bash
uv run {{CLI_COMMAND}} generate .
uv run {{CLI_COMMAND}} check .
```

Generated `types.py` is output; edit the YAML source. The generated [Type reference](/engineering/reference/types/) and [Fields reference](/engineering/reference/fields/) list every supported key and constraint.
