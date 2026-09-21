---
title: Types and Structured Output
description: Model records, choices, variants, identifiers, constrained values, and media as typed data.
---

Types describe data entering and leaving flows, nodes, tools, and inferences. Source files live in `types/`; `{{CLI_COMMAND}} generate` turns them into Pydantic models for Python and structured model output. Name types for the business meaning of their values, not for a provider or prompt version.

There are six kinds. Reach for the first one that fits:

| Kind | Use it for | Example below |
| --- | --- | --- |
| `record` | A value with fixed named fields | `CustomerRequest` |
| `enum` | A small, stable set of labels | `IssueSeverity` |
| `union` | A shape that differs by case | `RequestOrigin` |
| `id` | A string that identifies an entity | `OrderId`, `KbChunkId` |
| `value` | A scalar with a business range | `ConfidenceScore` |
| built-in | Text, numbers, dates, context, and media | `Text`, `Int`, `TimeZone`, `Image` |

## Anatomy of a type file

Every type file, whatever kind it declares, starts with the same two lines and one required key:

```yaml
apiVersion: "aqven/v1"
kind: "Type"
type: "record"                  # record | enum | union | id | value — picks the rest of this file's shape
description: "..."               # required, at least 1 character — see below
pii: "none"                      # optional: none (default) | pii | sensitive
```

| Key | Required | Valid values | What it actually does |
| --- | --- | --- | --- |
| `apiVersion` | yes | `"aqven/v1"` | Always this literal string. Lets the format change later without breaking old files. |
| `kind` | yes | `"Type"` | Marks this file as a type, as opposed to a `Flow`, `Node`, `Tool`, or `Agent` file. |
| `type` | yes | `record`, `enum`, `union`, `id`, `value` | Picks which of the six kinds this file is. Every other key on this page depends on it. |
| `description` | yes | any non-empty text | Compiles into the generated Pydantic model as `Field(description=...)`. This is not a code comment: when this type is a model's output, the description is part of what the model reads to decide what value to produce. A vague description produces vague or wrong values. |
| `pii` | no | `none` (default), `pii`, `sensitive` | Classifies the data this type can carry, for data-handling and logging policy. Most business types stay `none`; mark a type `pii` or `sensitive` when it can carry a real person's personal data. |

The file's name on disk (`types/records/customer_request.yaml`) is just a path — it has no `id` field and isn't itself referenced from other files. What *is* referenced is the **type name**, a separate identifier explained next.

## Anatomy of a field

A `record`'s `fields:` and a `union` variant's `fields:` both use the same field declaration. This is the piece of the whole system you'll write the most, so every key matters:

```yaml
fields:
  - name: "order_id"              # required — the field's key, used everywhere this value is addressed
    type: "OrderId?"               # required — a type reference: see below
    description: "..."             # required, at least 1 character — see below
    maxLength: 12                  # optional constraint, only where it applies
```

| Key | Required | Valid values | What it actually does |
| --- | --- | --- | --- |
| `name` | yes | lowercase, starts with a letter, then letters/digits/`_`, up to 63 characters (`order_id`, not `OrderID` or `order-id`) | This is the field's address everywhere else in the project: a binding reads it as `$node.out.order_id`, a Liquid prompt reads it as `{{ order_id }}`, and generated Python exposes it as the same keyword argument. Renaming a field breaks every place that addresses it by that name. |
| `type` | yes | a **type reference** — see the table below | Says what value this field holds: a built-in scalar, a named type from `types/`, or media. |
| `description` | yes | any non-empty text | Same rule as a type's own `description`: it becomes `Field(description=...)` on the generated model, and it's what the model reads when this field is part of a structured output it must produce. |
| `maxLength` | no | integer ≥ 0 | Caps a `Text` value's length. **Only valid on `Text`** — see the constraint matrix below. |
| `maxItems` | no | integer ≥ 0 | Caps how many items a list (`Type[]`) can hold. Valid on any list, whatever its item type. |
| `minimum` / `maximum` | no | number | Bounds a value. **Only valid on `Int` and `Float`** — not on `Date`, `DateTime`, or `Bool`. |
| `pattern` | no | a regular expression | The value must match it. **Only valid on `Text`.** |
| `enum` | no | a list of at least one string | Restricts this one field to a closed list of literal values, without creating a separate named `enum` type. **Only valid on `Text`.** Use this when the choice only matters in this one place; use a named `enum` type (below) when the same choice recurs across several fields or flows. |

Putting a constraint on a type it doesn't apply to — `pattern` on an `Int`, say — is not a style mistake the compiler lets slide: `{{CLI_COMMAND}} check` rejects it with `E_TYPE_CONSTRAINT_MISMATCH`. The full matrix of what's valid where is its own section below.

### Type references: what can go in `type:`

A type reference is a PascalCase name (`Text`, `OrderId`, `CustomerRequest` — starting with a capital letter, up to 63 characters), optionally followed by one or both of these suffixes, **in this exact order**:

| Reference | Meaning |
| --- | --- |
| `Text` | required, single value |
| `Text?` | optional — the value can be `null` |
| `Text[]` | required list — the list itself is required, and every item in it is required |
| `Text[]?` | optional list — the list itself can be `null`, but if present every item is required |

Two forms the compiler rejects outright: `Text?[]` (list of optional items — there's no way to make one item in a list optional; leave it out instead) and `Text[][]` (a nested list). If you need "a list where an item can be absent," model that as a smaller record with an optional field, not as a list of optionals.

The name before the suffix is either a built-in (`Text`, `Int`, `Float`, `Bool`, `Date`, `DateTime`, or a media type — see below) or a type you defined yourself in `types/`. A type file has no `name` key of its own — its PascalCase reference name is derived from its filename: `types/records/customer_request.yaml` becomes `CustomerRequest`, `types/ids/order_id.yaml` becomes `OrderId`. Renaming the file renames the type everywhere it's referenced.

## Record: named fields

Use a `record` when one value always has the same named fields. It compiles to a generated Pydantic `BaseModel` subclass — one Python class per record type, one constructor argument per field. This complete `types/records/customer_request.yaml` defines an inbound support request:

```yaml
apiVersion: "aqven/v1"
kind: "Type"
type: "record"
description: "A customer request awaiting triage"
fields:
  - name: "subject"
    type: "Text"
    description: "One-line summary the customer wrote"
    maxLength: 200
  - name: "body"
    type: "Text"
    description: "Full request text"
    maxLength: 4000
  - name: "severity"
    type: "IssueSeverity"
    description: "Customer-reported urgency"
  - name: "order_id"
    type: "OrderId?"
    description: "Related order, if the customer mentioned one"
```

Adding a required field changes every caller that constructs `CustomerRequest`. Changing `maxLength` changes both validation and the contract shown to a model. If a field can be absent, use an optional type such as `OrderId?`, and define what `null` means — here, "the customer did not mention an order."

## Enum: a closed choice

Use an `enum` for a small, stable set of labels. It compiles to `Literal["low", "normal", "urgent"]`, not a Python `enum.Enum` — the exact same mechanism an inline field `enum:` constraint and an allowed set (below) both use, just fed from a named list instead of an inline one or a run's actual data:

```yaml
apiVersion: "aqven/v1"
kind: "Type"
type: "enum"
description: "How urgently a request needs a response"
values:
  - value: "low"
    description: "Can wait for the next business day"
  - value: "normal"
    description: "Standard queue"
  - value: "urgent"
    description: "Service is impaired; respond within the hour"
```

Adding a value can affect `switch` cases, prompts, and downstream code — a routing node with one branch per `IssueSeverity` value needs a new branch, or an explicit default, the day `critical` is added. Renaming a value is a data migration for stored cases and runs, not just a spelling change.

## Union: variants with different fields

Use a discriminated `union` when the shape differs by case. It compiles to a Pydantic discriminated union: each variant becomes its own generated `BaseModel` subclass, with an extra field — named after `discriminator:` — added automatically and typed `Literal["web_form"]` or `Literal["marketplace"]`. Pydantic reads that one field first to decide which variant model validates the rest of the value; a single-variant union skips the Union wrapper and resolves straight to that one model. This source has a `kind` discriminator:

```yaml
apiVersion: "aqven/v1"
kind: "Type"
type: "union"
description: "Where a request came from"
discriminator: "kind"
variants:
  - name: "web_form"
    description: "Submitted through the support form"
    fields:
      - name: "page_url"
        type: "Text"
        description: "Page the customer was on"
        maxLength: 300
  - name: "marketplace"
    description: "Received through a third-party marketplace"
    fields:
      - name: "platform"
        type: "Text"
        description: "Marketplace name"
        maxLength: 60
      - name: "listing_id"
        type: "Text"
        description: "Marketplace listing reference"
        maxLength: 60
```

A `web_form` value has `page_url`; a `marketplace` value has `platform` and `listing_id`. A downstream step should branch on `kind` before using a variant-only field — a reply-drafting prompt that assumes every request has `page_url` breaks the moment a marketplace request arrives. Adding a new variant means updating every branch that assumes the current list is exhaustive; the compiler's `requires` rules (see [Flows](/engineering/flows/#require-a-design-invariant)) can enforce that.

## ID: validated identity

Use an `id` when a string identifies an entity and must follow a format. It compiles to plain `str` when neither `pattern` nor `maxLength` is set, or `Annotated[str, Field(pattern=..., max_length=...)]` when either is — there's no separate "ID" class in the generated code, just a constrained string:

```yaml
apiVersion: "aqven/v1"
kind: "Type"
type: "id"
description: "Order identifier"
pattern: "^ORD-[0-9]{8}$"
maxLength: 12
allowed_set: "none"
code_format: "identity"
```

| Key | Required | Valid values | What it actually does |
| --- | --- | --- | --- |
| `pattern` | no | a regular expression | Rejects a malformed ID before it's ever used — `ORD-1` fails, `ORD-00000042` passes. |
| `maxLength` | no | integer ≥ 1 | A second, simpler length bound. `pattern` and `maxLength` are independent; use either or both. |
| `allowed_set` | no | `"none"` (default) or `"dynamic"` | `"none"` means any string matching `pattern`/`maxLength` is accepted. `"dynamic"` means this ID can additionally be restricted, at the inference that uses it, to only the values actually available for that run — covered next. |
| `code_format` | no | `"identity"`, `"prefixed_ordinal"`, or unset | Reserved for how a value of this ID type is auto-generated by tooling. Its exact behavior isn't settled yet — treat it as informational until the generated reference documents it. |

`pattern` and `maxLength` catch a malformed ID — one with the wrong shape. They cannot catch a well-formed ID that simply doesn't exist, or doesn't belong in this particular answer. That's what `allowed_set: "dynamic"` is for.

## Allowed sets: restrict a model to real values

An ID declared with `allowed_set: "dynamic"` unlocks a stronger guarantee than `pattern` alone: an inference can restrict a model's answer to only the IDs present in *its own current input*. The model isn't just prevented from writing a malformed ID — it's prevented from inventing one, even a perfectly well-formed, plausible-looking one that was never actually offered to it.

This is the mechanism behind reliable citations. Say a node retrieves knowledge-base passages and asks a model to write an answer that cites which passage supported each claim.

### Declare the ID type

```yaml
# types/ids/kb_chunk_id.yaml
apiVersion: "aqven/v1"
kind: "Type"
type: "id"
description: "Knowledge-base passage identifier"
pattern: "^kb_[0-9]{4}$"
allowed_set: "dynamic"
```

`allowed_set: "dynamic"` is what makes `KbChunkId` eligible to be restricted later — it doesn't restrict anything by itself. Without it, `allowed_sets` on an inference cannot reference this type.

### Bind the set on the inference that uses it

```yaml
# inference.yaml
in:
  - name: "chunks"
    type: "KbChunk[]"
    description: "Retrieved passages available to cite"
    maxItems: 50
out:
  - name: "reply"
    type: "AnswerWithCitations"
allowed_sets:
  - type: "KbChunkId"
    from: "$in.chunks[*].chunk_id"
    labels_from: "$in.chunks[*].title"
```

| Key | Required | What it does |
| --- | --- | --- |
| `type` | yes | Which `dynamic` ID type this entry restricts — here, every `KbChunkId` the model produces anywhere in the output. |
| `from` | yes | A binding path collecting the actual allowed values for *this run*. `$in.chunks[*].chunk_id` means "the `chunk_id` of every item in the `chunks` input" — not a fixed list maintained anywhere, it's recomputed from the real input every time the inference runs. |
| `labels_from` | no | A parallel path giving each allowed value a human-readable label the model sees alongside the raw ID, without needing the full passage text in context. |

### What the model actually sees

An allowed set compiles into the same kind of closed-choice (`Literal[...]`) constraint used by an inline field `enum:`. Concretely: if `$in.chunks` holds five passages, the model's structured-output schema for that call allows exactly those five `chunk_id` values for this run — no more, no fewer — each shown with its `labels_from` label if one was supplied. By default, up to 50 values can be offered this way in one set; a retrieval step returning more than that needs to narrow its results first.

Matching is case-insensitive, so `kb_0042` and `KB_0042` resolve to the same allowed value — useful when a value passes through a step that happens to change its casing.

### When the model picks something outside the set

A citation pointing at an ID outside the allowed set fails validation before it ever reaches a customer — the same place any other structured-output validation failure is caught. The error doesn't just say "invalid value": it names the closest real values in the set (by string similarity), so the failure is diagnosable from the error message alone rather than requiring a trip back to the raw retrieved data.

See [Restrict an ID to the current input](/engineering/inferences/#restrict-an-id-to-the-current-input) for the same feature from the inference-authoring side, including how to test an empty set and a value the model has never seen.

## Value: a constrained scalar

Use a `value` when a scalar has a business range. It compiles to exactly its `base`'s own Python type (`str`, `int`, `float`, and so on from the scalar table below) carrying that `base`'s own constraints — a `value` isn't a distinct kind of thing in the generated code, it's identical to declaring a field of that scalar type directly, just under a name you can reuse in several places:

```yaml
apiVersion: "aqven/v1"
kind: "Type"
type: "value"
description: "Model confidence that the routing decision is correct"
base: "Float"
minimum: 0
maximum: 1
```

`base` is one of `Text`, `Int`, `Float`, `Bool`, `Date`, or `DateTime`. A `value` only accepts the constraints valid for its chosen `base` — the same matrix that applies to an ordinary field, below — so a `Float` value can carry `minimum`/`maximum` but not `pattern`, and a `Text` value can carry `maxLength`/`pattern`/`enum` but not `minimum`/`maximum`. Changing the range changes which historical values can still validate — narrowing `maximum` from `1` to `0.99` invalidates any stored run where a node returned exactly `1.0`. For a field used in only one place, the same constraints can be written directly on the field declaration instead of naming a separate type.

## Constraints: which one applies to which type

`maxLength`, `maxItems`, `minimum`, `maximum`, `pattern`, and `enum` are not universally available — each applies to exactly one base type, and only lists get `maxItems`. This is enforced by `{{CLI_COMMAND}} check`, not just convention: using one on the wrong base fails the build with [`E_TYPE_CONSTRAINT_MISMATCH`](/engineering/reference/diagnostics/).

| Base type | Constraints it accepts |
| --- | --- |
| `Text` | `maxLength`, `pattern`, `enum` |
| `Int` | `minimum`, `maximum` |
| `Float` | `minimum`, `maximum` |
| `Bool` | none |
| `Date` | none |
| `DateTime` | none |
| a media type (`Image`, `Audio`, `Video`, `Document`) | none |
| a named type you defined (`record`, `enum`, `union`, another `id`) | none — that type's own file is where its shape and limits live |
| any of the above as a list, `Type[]` | adds `maxItems` on top of whatever the item type itself accepts |

One consequence of this table is a rule the compiler also enforces separately: an output field whose type resolves to `Text` — directly, or through a `value` with `base: "Text"` — must carry either `maxLength` or `enum`, or `{{CLI_COMMAND}} check` reports [`E_OUTPUT_UNBOUNDED`](/engineering/reference/diagnostics/). Every other built-in is inherently bounded (an `Int` can't be infinitely long the way a `Text` can), so only `Text` output needs an explicit bound. A `Text[]` list needs `maxItems` for the same reason.

## Built-in types

**What a type reference actually compiles to.** `{{CLI_COMMAND}} generate` turns every type file into a [Pydantic](https://docs.pydantic.dev/) model — Pydantic is the Python library AQVEN uses to validate data and build the JSON schema a model's structured output must satisfy. Every built-in name (`Text`, `Int`, `Image`, and so on) is not just a label: it maps to one specific Python type, always the same one, wherever it's used. That mapping is the actual contract — what follows is the complete list, not a representative sample.

### Scalars

| Type | Python type | Constraints it accepts | Example JSON value |
| --- | --- | --- | --- |
| `Text` | `str` | `maxLength`, `pattern`, `enum` | `"Order arrived damaged"` |
| `Int` | `int` | `minimum`, `maximum` | `42` |
| `Float` | `float` | `minimum`, `maximum` | `0.87` |
| `Bool` | `bool` | none | `true` |
| `Date` | Python's `datetime.date` | none | `"2026-09-21"` (ISO 8601 calendar date) |
| `DateTime` | Python's `datetime.datetime` | none | `"2026-09-21T14:30:00Z"` (ISO 8601 with time and offset) |

`Date` and `DateTime` accept no constraint keys at all — not even `minimum`/`maximum` — so a business rule like "the pickup date can't be in the past" is enforced in a `code` node or a `checks:` entry on the inference, not in the type file. This is the same rule the constraint matrix above states in general; it's worth restating here because it's easy to assume dates work like numbers.

### Context types

| Type | Python type | What it represents | Example JSON value |
| --- | --- | --- | --- |
| `TimeZone` | a distinct string type (Python `NewType("TimeZone", str)`) | Which time zone a value like a delivery date should be interpreted in | `"Europe/Berlin"` |
| `Locale` | a distinct string type | Language and region for a reply — the same value a `revise` or `translate` step would read to write in the right language | `"en-US"` |
| `TenantId` | a distinct string type | Which tenant, in a multi-tenant deployment, a run belongs to | `"tenant_0042"` |

All three carry no declared format validation in the compiler as of this writing — they're validated strings in the type-safety sense (a `TimeZone` can't be silently substituted for a `Locale` in a binding, because they're distinct Python types) but not in the "must be a real IANA zone name" sense. Treat the values shown as the expected convention, not an enforced pattern, until the generated reference states one.

### Media types

An `Image`, `Audio`, `Video`, or `Document` field is not a bare file or a URL — it's a small record, and all four share the same shape. A field declared `type: "Image?"` actually holds this on the wire:

```json
{
  "$media": "image/png",
  "blob_id": "sha256-9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "size_bytes": 48213,
  "name": "damaged_item.png"
}
```

| Field | Type | Required | What it is |
| --- | --- | --- | --- |
| `$media` | `Text` | yes | The MIME type, matching `type/subtype`. Each media kind restricts the prefix: `Image` must start `image/`, `Audio` must start `audio/`, `Video` must start `video/`, `Document` must start `application/` or `text/`. |
| `blob_id` | `Text` | yes | A content-addressed reference to the stored bytes — literally `sha256-` followed by the SHA-256 hash of the content, not an opaque ID you assign. Two uploads of the identical file get the identical `blob_id`. |
| `size_bytes` | `Int` | yes | The byte size, `≥ 0`. |
| `name` | `Text?` | no | The original filename, up to 255 characters. |
| `url` | `Text?` | no, read-only | Where AQVEN will serve the actual bytes from. You never set this yourself — it's populated for you. |
| `poster_blob_id` | `Text?` | no, read-only | A thumbnail image, set for you — mainly relevant for `Video`. |
| `note` | `Text?` | no, read-only | A short annotation AQVEN may attach, up to 1000 characters. |

You don't write most of these fields by hand in a project's type or node YAML — a media value arrives this way from an upload, a tool result, or a prior node's output, and a field typed `Image?` simply passes the whole record through. What you do write is the type reference itself (`Image?`) on a field declaration, covered next.

## Media fields: images, audio, video, documents

A record can carry media as optional fields:

```yaml
fields:
  - name: "screenshot"
    type: "Image?"
    description: "Optional screenshot the customer attached"
  - name: "voice_note"
    type: "Audio?"
    description: "Optional spoken description of the issue"
  - name: "screen_recording"
    type: "Video?"
    description: "Optional short video of the problem occurring"
  - name: "receipt"
    type: "Document?"
    description: "Optional PDF receipt or invoice"
```

A model node binds the fields it needs from `$input`; AQVEN sends media to the underlying model request as media parts, the same request Pydantic AI would build directly. Write the text prompt to describe an attachment only when it's actually present — never claim an absent field was inspected. Provider and model support for each modality differs, so check the selected model's capabilities before depending on one, and keep at least one case in your dataset where the optional media field is `null` so that path gets exercised too.

## Lists, optional values, and generated code

Type references can express a list (`CustomerRequest[]`) or an optional value (`Image?`). Use `maxItems` for lists and `maxLength` for text when the product has a real bound. The full built-in scalar, context, media, and dynamic type catalog is in the generated [Accepted values](/engineering/reference/accepted-values/) and [Media reference](/engineering/reference/media/).

After editing type YAML:

```bash
uv run {{CLI_COMMAND}} generate .
uv run {{CLI_COMMAND}} check .
```

Generated `types.py` is output; edit the YAML source, never the generated file. The generated [Type reference](/engineering/reference/types/) and [Fields reference](/engineering/reference/fields/) list every supported key and constraint. For where types appear across a flow's boundaries, see [Input and Output Contracts](/engineering/input-output-contracts/); for shaping a model's output beyond the type system itself, see [Design Structured Output](/engineering/schema-design/); for fields an input record determines at run time, see [Dynamic Output](/engineering/dynamic-output/).
