---
title: Design Structured Output
description: Preserve field meaning and value accuracy while keeping model output valid.
---

A valid JSON object can still contain the wrong decision, the wrong ID, or an invented fact. Design the output for the next consumer, then measure **schema validity** and **value accuracy** separately. AQVEN types are source files in `types/`; `{{CLI_COMMAND}} generate` derives Pydantic models and provider-facing schemas from them. [Types](/engineering/types/) documents the syntax, and the [generated type reference](/engineering/reference/types/) lists exact fields.

## 1. Put evidence before the decision when it helps

Models emit structured output in a sequence. If a decision depends on evidence or a short rationale, consider declaring those fields before the decision field:

```yaml
apiVersion: "aqven/v1"
kind: "Type"
type: "record"
description: "Review of a proposed answer"
fields:
  - name: "evidence"
    type: "Text"
    description: "Specific source evidence supporting the decision, or why none is available"
    maxLength: 500
  - name: "decision"
    type: "ReviewDecision"
    description: "Approve only if the evidence supports the answer"
```

This gives the model room to state the evidence before choosing a label. It is a design hypothesis to test with your provider, not a guarantee that the rationale is true. For sensitive decisions, validate the evidence against the source or require human review. Keep a rationale short and task-specific; do not request hidden reasoning or treat generated explanation as proof.

Provider adapters may reorder or transform JSON Schema fields. Inspect a rendered request or use a live model check when order matters. Keep prompt examples in the same logical order as the output contract.

## 2. Keep the model-facing shape small

Deeply nested and very wide schemas ask the model to manage many simultaneous constraints. Begin with the fields the next step actually needs. If your application object is large, have the model produce a smaller flat result, validate it, and assemble the application object in a `code` node.

| Symptom | Better design |
| --- | --- |
| Many unrelated fields in one output | Split by source section or decision boundary into separate inferences. |
| Values appear under the wrong nested object | Flatten the model-facing fields; reconstruct nesting in code. |
| A large list is usually empty or incomplete | Ask for a bounded list and describe the zero-result case. |
| One field requires exact computation | Calculate it in code after the model returns its inputs. |

Splitting has a cost: another model call adds latency and another possible failure. Compare the small split design with the single schema on the same [dataset](/engineering/datasets/) before adopting it. There is no universal safe field count or nesting depth across providers and tasks.

## 3. Use enums for closed decisions

```yaml
apiVersion: "aqven/v1"
kind: "Type"
type: "enum"
description: "Next action for a support request"
values:
  - value: "answer"
    description: "Enough information exists to answer now"
  - value: "ask_for_details"
    description: "A required fact is missing"
  - value: "escalate"
    description: "A person must make the decision"
```

Descriptions distinguish neighboring choices. Prefer meaningful values over opaque labels such as `p0`, `p1`, and `p2`. An enum prevents an out-of-set label but does not ensure the **right** in-set label; measure a confusion matrix and test boundary cases. If choices change frequently or there are many IDs, consider a smaller retrieved candidate set, a dynamic allowed set, and post-generation validation.

For a dynamic ID, define an `id` type with `allowed_set: "dynamic"`, then bind the allowed values in the inference. Give the model enough human-readable context to choose an ID; validate that the returned ID belongs to the supplied set. [Inferences](/engineering/inferences/#restrict-an-id-to-the-current-input) shows the AQVEN fields.

## 4. Make alternatives explicit

If variants have different fields, use a discriminated [union](/engineering/types/#union-variants-with-different-fields) with one discriminator such as `kind`. Avoid a single record containing every possible field as optional: it permits incompatible combinations and forces every consumer to infer which case was intended.

```yaml
apiVersion: "aqven/v1"
kind: "Type"
type: "union"
description: "Outcome of a lookup"
discriminator: "kind"
variants:
  - name: "found"
    description: "The record was found"
    fields:
      - name: "record_id"
        type: "Text"
        description: "ID of the matching record"
  - name: "not_found"
    description: "No matching record exists"
    fields:
      - name: "reason"
        type: "Text"
        description: "Why no record could be selected"
```

Changing the set of variants changes downstream `switch` handling. Test each variant and the ambiguous boundary between them. Structured-output capabilities vary by provider and mode; `models check --live` is the way to test the selected agent's actual route. Do not copy an arbitrary OpenAPI schema into a model output type and assume every provider accepts its union keywords.

## 5. Represent absence honestly

If the source may lack a value, use an optional type such as `Text?` and state what `null` means. A required non-null order ID in a message with no order ID encourages an invented value. Distinguish these cases in the contract:

| Representation | Meaning |
| --- | --- |
| `null` | The field was considered but no value is available. |
| `[]` | The collection was searched and no items were found. |
| Empty string | Usually ambiguous; define it explicitly or avoid it. |
| Field absent | Only valid where the type permits omission. |

Put cases with absent, contradictory, and multiple source values in the dataset. Check the generated Pydantic output rather than assuming a provider enforces every schema constraint during decoding.

## 6. Bound arrays and recursive shapes

Use `maxItems` when the product has a real maximum, and describe order: ranked by relevance, chronological, source order, or arbitrary. Say when `[]` is correct. If an empty list means “no matches,” do not demand at least one result. If a provider accepts the schema but does not enforce a list limit during generation, Pydantic validation still catches it after the call; measure the retry rate.

Recursive types can be hard to generate and may not be supported in a provider's chosen output mode. Prefer a bounded flat list of nodes plus parent IDs when the task allows it. If recursion is essential, test representative depths and a termination case with the actual provider.

## 7. Write descriptions as part of the model request

Each field description should state its meaning, units or format, and a key boundary case. “The score” is vague; “Confidence from 0 to 1 that the cited source supports the answer; use 0 when no source is present” gives a usable contract. Avoid repeating the entire prompt inside every field; repeated text consumes context and may create conflicting instructions.

Field names also carry meaning. Prefer `source_quote` over `text_2`, and `decision` over `result`. Put a few representative complete outputs in the prompt or inference examples when the schema alone does not explain the boundary.

## 8. Choose output mode with evidence

An agent's `output.mode` may be `auto`, `tool`, `native`, or `prompted`; `strict` and retry settings affect validation and provider use. A mode that increases schema validity can still change value quality on reasoning-heavy tasks. Compare modes on the same cases:

```bash
uv run {{CLI_COMMAND}} models check --project .
uv run {{CLI_COMMAND}} models check --project . --live
uv run {{CLI_COMMAND}} eval . --eval answer_quality
```

For a complex task, consider separating free-form analysis from a final typed extraction if a dataset shows that one constrained call loses accuracy. That adds cost and latency, so keep it only when it improves the result. The [agent chapter](/engineering/agents-and-models/#change-structured-output-behavior) explains the settings; [provider guide](/engineering/providers/) explains route compatibility.

## 9. Measure three different outcomes

1. **Schema adherence:** Did parsing and type validation succeed? Track invalid output, refusal, truncation, and retries separately.
2. **Field accuracy:** Are values correct and supported? Score important fields independently; a valid object can still choose the wrong enum or ID.
3. **Stability:** On repeated runs at the intended settings, how often does the decision change? A volatile field may need better context, a different model, or a narrower contract.

Also watch field distributions after release: enum frequencies, empty-list rates, null rates, numeric ranges, and output lengths. A provider change can leave schema adherence high while value quality drifts. Retain regression cases for every discovered failure.

## Review checklist

- Does every field have a downstream consumer and a clear description?
- Can the source genuinely provide every required value?
- Are labels distinct, and are union variants exhaustive for the task?
- Is `null` or `[]` a legitimate result, and does the prompt say so?
- Can an exact computation or validation happen in code?
- Does the selected provider support the schema in the chosen output mode?
- Do the dataset and eval measure value accuracy as well as parsing success?

These are design rules, not a claim that every check is enforced by AQVEN's current linter. `{{CLI_COMMAND}} check .` validates implemented schema and project rules; provider behavior and semantic quality require live cases and evaluations.
