---
title: How to handle a shape you don't know in advance
description: Declare a field Dynamic, describe its real shape as FieldSpec data your code builds at run time, and read the result back narrowed or as it is.
---

## When you need this

Some fields can't get a type when you write the flow: what a marketplace's intake form asks for, or
exactly which fields a case record needs, depends on data you only have once the flow is running.
Declare that field `Dynamic` and hand AQVEN the real shape as data instead — computed however you
want, read back once you actually know what it is.

## Steps

- Give the field `type: "Dynamic"`. On an inference's own `out`, that's what tells AQVEN the model's
  output schema isn't fixed in the YAML — it gets built from data instead.
- Every Dynamic output needs `limits`: `max_fields`, `max_depth` (1 to 3), `max_text_length`, and
  `max_items`, whatever shape turns up at run time. `{{CLI_COMMAND}} check` rejects a Dynamic output
  missing any of them.
- An inference's Dynamic output also needs `schema_from`: a reference to one of its own `in` fields,
  typed `FieldSpec[]` with a `maxItems` bound. That field's actual value at run time — usually computed
  by an earlier `code` node — is the shape AQVEN builds the model's output schema from. `check` rejects
  `schema_from` pointing anywhere else.
- Describe the shape with `FieldSpec`: `name`, `type`, `description`, and whatever constraint the type
  takes — `maxLength`, `pattern`, or `enum` for `Text`, `minimum`/`maximum` for a number, `maxItems`
  for a list, a nested `fields` list when `type` is `"Record"`. It's the same grammar a YAML field
  declaration uses, just written as data.
- Add `value_type` on the Dynamic output when you already expect the value to end up matching one
  particular record or union type in your project once it arrives. It's a hint, not a check — leave it
  unset when you genuinely don't know, or don't care, which type it lands on.
- A node that only carries an existing Dynamic value onward — a `loop`, `map`, or `parallel` node's own
  `out` — can repeat `value_type`, but never `schema_from` or `limits`: those belong to whichever
  inference actually produced the value.
- Downstream, nothing reads named fields off a `Dynamic` value directly. Take it in as `Dynamic`
  yourself and you get back a `DynamicValue` — `.value` the raw value, `.fields` the `FieldSpec`s it
  was shaped from, `.schema_hash` a hash of that shape — for code that works by field name without
  needing a fixed type. Or narrow it to a real record or union type once you know exactly which one it
  has to be.

### Example

This is the [showcase](/start/quickstart/) project's `case_form` and `record__extract` nodes, in its `support_case` flow.
`case_form` decides a case record's form from its intent — a warranty defect, a delivery problem, or a
plain question — before the record itself gets filled in. Create it yourself with:

```bash
{{CLI_COMMAND}} new my_project --template showcase
```

Its files live at `flows/support_case/nodes/case_form/`. The showcase is written for a Russian-market
storefront, so its descriptions and data are in Russian; the files below are translated to English for
this page. `case_form.node.yaml` is an ordinary `code` node: one `CaseIntent` input, one `FieldSpec[]`
output:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "code"
description: "Builds the case record's form by intent: fields match one CaseRecord variant"
run: "case_form"
in:
- name: "intent"
  type: "CaseIntent"
  description: "The case's intent"
  from: "$intent.out.intent"
out:
- name: "fields"
  type: "FieldSpec[]"
  description: "The case record's form fields"
  maxItems: 30
```

`case_form.py` builds that list by intent. The real file has one branch per intent — defect,
delivery, question — each matching one variant of `CaseRecord`, the union type
[How to narrow a dynamic value to a type](/engine/narrow-node/) narrows this same record down to
later. Here's the `question` branch; `defect` and `delivery` build their own `FieldSpec` list the
same way:

```python
from aqven.spec import FieldSpec
from __package__.types import CaseIntent, SupportCaseCaseFormOut

QUESTION_FIELDS = (
    FieldSpec(name="topic", type="Text", description="The customer's question topic", maxLength=200),
    FieldSpec(
        name="order_id", type="OrderId?", description="The Lumen order number; null if the question isn't about one"
    ),
)


def case_form(intent: CaseIntent) -> SupportCaseCaseFormOut:
    kind = FieldSpec(name="kind", type="Text", description="The case's kind", enum=[intent])
    return SupportCaseCaseFormOut(fields=[kind, *QUESTION_FIELDS])
```

This branch — like the other two — starts with a `kind` field pinned to the current intent by its
own `enum`, the same name `CaseRecord`'s discriminator uses, so the value this shape eventually
produces already carries the tag `narrow` checks against.

`extract`, the `record` loop's first body node (see [How to repeat a step with a limit](/engine/loop-node/)
for what a loop node's body does), reads `case_form`'s output as its own `form_fields` input and fills in
the record against it. Its inference file is where the field that doesn't have a fixed shape gets
declared:

```yaml
apiVersion: "aqven/v1"
kind: "Inference"
description: "Fills in the case record's form from the text, summary, and attachments; on a repeat, applies the review notes"
in:
- name: "form_fields"
  type: "FieldSpec[]"
  description: "The case record's form fields for this case's intent"
  maxItems: 30
out:
- name: "record"
  type: "Dynamic"
  description: "The case record filled in from the form"
  schema_from: "$in.form_fields"
  value_type: "CaseRecord"
  limits:
    max_fields: 30
    max_depth: 2
    max_text_length: 400
    max_items: 10
```

The real inference also takes `message`, `summary`, `feedback`, `photo`, and `invoice` as input — none
of them feed the `Dynamic` field, so they're left out here.

`schema_from: "$in.form_fields"` tells AQVEN to build `record`'s actual output schema from whatever
`form_fields` turns out to be on this run — one shape for a defect case, a different one for a delivery
case, without writing three separate inferences. `limits` bounds it regardless of which shape shows up:
at most 30 fields, 2 levels deep, 400 characters per text field, 10 items in any list.
`value_type: "CaseRecord"` records the expectation that whichever shape comes back will fit one of
`CaseRecord`'s three variants — `narrow` is what actually checks that later, not this field.

What happens to `record` next — read as `Dynamic` by field name, or narrowed to `CaseRecord` once the
code knows exactly which variant it is — is covered in the pages linked below.

## See also

- [How to narrow a dynamic value to a type](/engine/narrow-node/) — the other half of the `Dynamic`
  story: turning a value like `record` into an ordinary typed value once you know exactly what it is.
- [How to repeat a step with a limit](/engine/loop-node/) — what a `loop` node's body and passes are,
  the shape `extract` and `validate` run inside.
- [How to write a step in Python](/engine/code-node/) — `case_form`, the node that builds the
  `FieldSpec[]` shape this page's example is built from.
- [The engineering loop](/concepts/engineering-loop/) — what to do when a run's output isn't what you
  expected.
- [Fields and bindings](/reference/fields/) — every field on `InputField`, `OutputField`, and
  `BoundField`, generated from the code.
- [Media and dynamic values](/reference/media/) — every field on `FieldSpec`, `DynamicLimits`, and
  `DynamicValue`, generated from the code.
- [Type specifications](/reference/types/) — how a discriminated union like `CaseRecord` is declared.
