---
name: designing-output-contracts
description: "Designs AQVEN types and llm output schemas models can produce: required fields, refusal and unknown as states, maxItems and maxLength, tool or prompted mode. Use before editing types/ or an inference output, for nested outputs, and on OUTPUT_SCHEMA_REJECTED or MODEL_SCHEMA_MISMATCH."
---

## MUST

- Every field the prompt asks about is required in the output type.
- "Cannot read it" is its own state of the output (a declined flag with a reason), never "no" on every field.
- Downstream, a missing field reads as "unknown", never as "no". An empty intersection is "unknown", not 0.
- Every list has `maxItems`, every string `maxLength`, and the prompt states those limits in words.
- A retry to the same model gets the same `OUTPUT_SCHEMA_REJECTED`: shrink the schema or change the model.
- 429 is not a property of the schema: the model's rate-limit lane handles it; never lower parallelism by hand.

## Procedure

| # | Step | Exit criterion |
|---|---|---|
| 1 | Start from the consumer's decision: the fewest fields, flat records, small enums, `maxItems` on every list, `maxLength` on every string | no `E_OUTPUT_UNBOUNDED` |
| 2 | Answer states: present, absent, declined (with a reason) and "not asked" are distinguishable; the prompt asks about the content ("does this contract have a termination clause") rather than "can you read this" | every field has a stated meaning for its absence; a refusal shows in the flow output |
| 3 | Estimate the state space: arrays of objects × `maxItems` × enum sizes × `maxLength` | a large space goes to step 4 |
| 4 | A nested or large schema: `uv run aqven models shapes <agent> --project <package> --live` for the model and each of its `fallback_models`; record the boundary in one sentence of the agent's `description` | the schema is within the boundary of every model that serves it |
| 5 | The shape depends on the input (items × questions per item): pick one of the five dynamic-shape cases; measure answers with missing fields with an "answered every asked field" check | a case is chosen; the completeness check is in the experiment |
| 6 | The output limits are written in the prompt text | otherwise it is a specification gap, not a model limit |
| 7 | Output mode: `uv run aqven models check <agent> --project <package> --live` tries every mode with `output.strict: true`; pin `output.mode`. If the probe passes but the real request gives `MODEL_SCHEMA_MISMATCH`, try `prompted` first, then another model; watch `schema_valid_first_try` | no unresolved `W_OUTPUT_MODE_RESOLVED`; `schema_valid_first_try` known |
| 8 | Keep working limits the same across the project; change them file by file with Edit | no regex over several files |

The CLI probes read keys from the environment and `<package>/.env`. Keys saved in Studio settings are visible only
to the project server: if your shell has no key, ask the owner to run the probe and paste the output.

## Pitfalls

| What goes wrong | Do instead |
|---|---|
| The same model retried after `OUTPUT_SCHEMA_REJECTED`; OpenRouter upstream routing made the rejection come and go | smaller schema; pin the provider order (`choosing-models`) |
| `tool` mode passed the small probe, then the real schema failed with `MODEL_SCHEMA_MISMATCH` on required fields | try `prompted` mode; compare `schema_valid_first_try`, the share of complete answers and the cost in a series |
| Missing fields read downstream as "no": a model skipped part of the asked questions and the output looked clean | required fields, "unknown" downstream, an "answered every asked field" check |
| Two empty answers scored as agreement 0.0 | keep it unknown: a nullable field (`None`) in the `code` step; a check cannot return unknown (it must return a `Verdict`, and a scored check without `score` is an error), so measure agreement only on cases where it is defined, selected with `cases.tags` |
| A refusal looked like "no" on every question in the flow output | a separate declined field with a reason |
| The prompt asked "can you read this" and got "yes" on blank pages and off-topic images | ask for the property itself |
| Optional inputs left out of cases | write an explicit `null` |
| Parallelism lowered by hand against 429 | the lane pauses the model; see `choosing-models` |

## Tools and commands

- `aqven` MCP `aqven_check`, `prompt_preview` (the output contract the model receives).
- `uv run aqven models shapes <agent> --project <package> --live`, `uv run aqven models check <agent> --project <package> --live`.

## References

- `references/concepts/schema-state-space.md`: how the state space grows, how providers and OpenRouter fail on it,
  `tool` against `prompted`. Read at step 3.
- `references/concepts/answer-refusal-and-unknown.md`: required fields, refusal as a state, unknown against no,
  the completeness check. Read at step 2.
- `references/engine/field-constraints.md`, `references/reference/fields.md`, `references/reference/types.md`:
  every constraint and type. Read at step 1.
- `references/reference/inference.md`: `out`, `checks`, `allowed_sets`. Read before editing an inference.
- `references/engine/check-shapes.md`: `models shapes` axes and output. Read at step 4.
- `references/engine/check-providers.md`: `models check`, output modes and `strict`. Read at step 7.
- `references/engine/dynamic-shape.md`, `references/concepts/five-dynamic-shape-cases.md`: shapes that depend on
  the input. Read at step 5.
