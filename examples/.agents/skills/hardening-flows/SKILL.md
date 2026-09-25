---
name: hardening-flows
description: "Makes an AQVEN flow fail loudly and recover on purpose: run-time checks, join semantics, map on_item_error with a coverage guard, requires, limits, on_error. Use when a flow must hold in production, a step has no failure answer, or a run completed while an item failed."
---

## MUST

- The flow output says how many items were planned and how many were read. `degraded: true` on a node is
  invisible to the owner; a dropped item must show in the flow output.
- Input-contract errors and infrastructure errors never turn into default values or "no" answers.
- A guard reports a violation; it never repairs data silently.
- `parallel`, a critic `loop` or a judge panel stays only when an experiment shows it beats a variant of equal
  budget, or when the owner asked for it.
- Compliance work such as PII masking is added only when the owner asks for it (see "Owner's rules" in
  `AGENTS.md`).

## Procedure

| # | Step | Exit criterion |
|---|---|---|
| 1 | A table per node: possible failures (provider error, 429, refusal, truncation, invalid schema, empty or wrong input, some `map` items failing, a slow `parallel` branch), how to detect each, what to do, how a person sees it | every node has all four columns |
| 2 | Detection: `checks` in the inference with `on_fail: "retry"` (or `"fail"`, `"flag"`); built-ins `not_empty`, `unique_items`, `ids_in_allowed_set` (with `allowed_sets`); flow `requires` predicates (`families_distinct`, `family_disjoint_from_input`, `field_before`) where they fit | every llm node has at least one run-time check |
| 3 | Reaction to a call outcome in the agent: `output.on_error` (default `retry`), `output.on_refusal` and `output.on_truncated` (default `fail`), each `retry`, `fail` or `fallback`; `fallback` only with `fallback_models` | no `E_OUTCOME_FALLBACK` |
| 4 | `parallel`: pick `join` from the table below; if every opinion is needed, `all`; with `quorum` the output carries how many branches answered (`$ok[*]`) | the output shows how many branches answered |
| 5 | `map`: `on_item_error` with `use: "skip"` or `use: "default"` only together with a coverage guard after the map (the required items) and an output field for the items not read (for example `unread`) | a missing required item fails the run; a missing optional item is visible in the flow output |
| 6 | Deterministic gates before a paid call: a `code` check of input quality and a `switch` on its verdict | the gate sits before the first llm node where possible |
| 7 | `limits` on the flow and the agent (`requests`, `tokens`, `usd_micros`, `seconds`, `tool_calls`); an agent's `limits.seconds` cuts a hanging call long before the 600 s of stream silence the engine allows | limits are set |
| 8 | A multi-call pattern is measured against a variant of equal budget: a `use` factor on the container node, or a `flow` factor on a `call` slot (`designing-experiments`) | every such construct has an experiment or a stated reason |
| 9 | Prove the failure path: a run where one item fails (a planted bad input, or `run_start` over a node range with `start_node`, `end_node` and `node_outputs` that plant a bad upstream output) | the run view shows the item replaced or skipped, and the flow output has the "not read" field instead of a silent `completed` |

## `join` of a `parallel` node

| `join` | When the node closes | Danger |
|---|---|---|
| `all` | every branch succeeded; fails on the first error | one model's 429 fails the node; give its agent `fallback_models` or provider fallbacks |
| `any` | the first finished branch, success or error | only the fastest model counts |
| `first_success` | the first success; fails when all fail | the opinion of one model, not of a panel |
| `quorum` with `min_ok` and `on_error` (`skip` or `fail`) | as soon as `min_ok` branches succeeded | a race, not a wait: with `min_ok: 2` of three, the slowest model never takes part |

```yaml
join:
  use: "quorum"
  with:
    min_ok: 2
    on_error: "skip"
```

## Pitfalls

| What goes wrong | Do instead |
|---|---|
| `on_item_error` with `use: "skip"` drops a required item and the run still ends `completed` (a contract reader skips the page with the signatures) | a coverage guard after the map and an `unread` output field |
| An input-contract or infrastructure error turns into an answer (a timed-out invoice read comes back as "nothing due") | let contract and infrastructure errors fail; answer states belong to `designing-output-contracts` |
| A lost item shows only as `degraded: true` on a node (one ticket of a batch was never classified, the summary looks whole) | the flow output names what was not processed |
| `quorum` taken for "wait for two of three": it closes on the first answers, so the slowest model never counts | `all` with fallbacks, or report how many answered |
| `join: all` over several providers: one provider's 429 fails the node on every case | fallbacks on each agent (`choosing-models`) |
| Compliance or safety work the owner did not ask for (PII masking added to an internal code-review flow) | follow "Owner's rules" |

## Tools and commands

- `aqven` MCP `aqven_check`, `run_start` (`mode: "live"`), `run_get_node`.
- `pytest_run` for failure scenarios when the project has `tests/`.

## References

- `references/concepts/designing-reliable-workflows.md`: when retries, votes, critics and panels pay off. Read
  before step 8 and before adding any multi-call construct.
- `references/reference/built-in-policies.md`, `references/reference/policies.md`: every built-in `join`,
  `on_item_error`, `stop`, `select` and evaluator with its `with` parameters. Read at steps 2, 4 and 5.
- `references/concepts/what-happens-when-a-model-is-called.md`: outcomes `ok`, `error`, `refusal`,
  `truncated`, retries and their policies. Read at step 3.
- `references/engine/parallel-node.md`, `references/engine/map-node.md`: container semantics and `$ok`. Read at
  steps 4 and 5.
- `references/engine/field-constraints.md`: `maxItems`, `maxLength`, `pattern` and their run-time effect. Read
  with step 2.
- `references/reference/flows.md`, `references/reference/agents.md`: `limits`, `requires`, `output`,
  `fallback_models`. Read at steps 3 and 7.
- `references/studio/investigate-a-run.md`: how a replaced or skipped item looks in the run view. Read at step 9.
