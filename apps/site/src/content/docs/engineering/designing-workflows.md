---
title: Design a Workflow
description: A decision framework for engineers and AI coding agents building production workflows.
---

Start with the smallest workflow that can meet the task. Write its input, output, and representative cases before adding nodes. Then add structure at boundaries where a different kind of work, verification, context, risk, or owner requires it. This chapter turns an engineering decision framework into AQVEN choices; the linked entity chapters give complete YAML shapes.

## 1. Establish a baseline and outcome

State the result in one sentence. Define the input and output [types](/engineering/types/), and write a first [dataset](/engineering/datasets/) containing an ordinary case, an edge case, and a known failure. Try a single `llm` node with a clear inference, relevant context, and a few examples. Measure it before deciding that a multi-step design is needed.

Record the baseline's quality, cost, latency, invalid-output rate, and failure cases. A more complex design must improve a measured weakness enough to justify its extra calls and failure points. This follows the simple-to-complex workflow progression in [Anthropic's engineering guide](https://www.anthropic.com/engineering/building-effective-agents).

## 2. Decide where to split work

One logical subtask does not always need its own model call. Split when the boundary gives you a useful contract or control point.

| Signal | Design choice | AQVEN expression |
| --- | --- | --- |
| Grounded extraction becomes open-ended writing | Separate inferences | `llm` nodes with distinct input/output types and prompts |
| A deterministic result can be checked between calls | Split and validate | `code` node, inference `checks`, or a typed downstream binding |
| A later action has a different risk or owner | Put a gate at the boundary | Tool effect/approval or `human` node |
| Stages need different models or latency budgets | Separate agent choices | Each `llm` node names its agent; set limits |
| Small homogeneous tasks share the same context | Consider one call or a `map` | Compare quality and cost on a dataset |
| Number or order of subtasks depends on runtime input | Use bounded dynamic work | `map`, `switch`, or an agent with tools where the path cannot be listed in advance |

Each added model call can fail. If independent steps each succeed with probability *p*, then *n* steps all succeeding is approximately *pⁿ*. For example, 0.95⁵ is about 77%, and 0.95¹⁰ is about 60%. This is an illustration, not a measured AQVEN success rate: real errors may correlate and recovery can change the result. The engineering response is to measure end-to-end success, add verification where possible, and retry or escalate the failed subtask instead of blindly extending the chain.

Avoid turning “one responsibility per call” into a rule. A short, related task may work better in one call because the model needs the whole context. Split only when the contract, evidence, or control benefit is visible in cases.

## 3. Choose the work archetype

| Task | First choice | Test that matters |
| --- | --- | --- |
| Deterministic parsing, arithmetic, normalization | `code` | Exact input/output tests |
| Extract facts present in a source | Typed `llm` inference, or deterministic parser when possible | Field accuracy and source support |
| Choose a closed label | `llm` or code classifier | Confusion by class, especially rare or adjacent labels |
| Route to a different path | Classifier plus `switch` | End-to-end result of each route and fallback |
| Draft or transform language | `llm` | Factuality, task criteria, and human or judge review |
| Evaluate a measurable property | Built-in or code scorer | False positives and false negatives |
| Decide a subjective quality criterion | Judge inference with rubric | Agreement with reviewed human examples |
| Call an external system | `tool` | Errors, effects, idempotency, approval |

An extractor should return facts traceable to the source. A generator may create new language, so a schema-valid result is not enough to establish correctness. A router differs from a classifier because its label selects what runs next; include a safe path for an unknown or ambiguous label. Use a deterministic or simpler classifier when the labels are stable and measured performance is sufficient.

## 4. Choose the topology

If B needs A's output, bind A into B and run them sequentially. If tasks read the same input independently, use [parallel](/engineering/parallel-and-map/) and choose `all`, `first_success`, or `quorum` according to what downstream work needs. If the number of homogeneous tasks comes from input data, use `map`; specify concurrency and item-error behavior. If one of several paths should execute, use [switch](/engineering/switch/) with a common output contract. If a reusable task has its own boundary, call another flow. [All built-in policies](/engineering/built-in-functions/) have names and examples.

Do not add parallel branches solely to collect more text. A branch must have a distinct input, perspective, or failure mode and a clear join rule. Batching several small items into one prompt can save requests, but may reduce accuracy as inputs grow. Compare batched and individual cases using the same dataset and record the observed tradeoff.

## 5. Decide whether multiple candidates help

Fan-out, voting, and best-of-N address variation between attempts. They do not fix a shared misunderstanding of the task.

| Situation | Candidate design | What to measure |
| --- | --- | --- |
| Closed-form answer with independently varying mistakes | Several answers plus deterministic vote | Accuracy gain per added request |
| Generated artifact with an executable verifier | Several candidates plus verifier-based selection | Verified pass rate and cost |
| Open-ended answer without a scalar criterion | Start with one answer; add a rubric or human review before sampling | Whether selected answers are actually preferred |
| Every candidate fails for the same reason | Fix context, prompt, or model | Root cause, not candidate count |

Start with a small candidate count and stop increasing it when added cost no longer improves the dataset. Diversity may come from different prompts or models; temperature alone may produce correlated mistakes. AQVEN can express fixed candidates with `parallel` and a join/select step, but the selection rule must be defined before adding branches. Research on self-consistency shows gains on some reasoning benchmarks; treat the useful candidate count as task-dependent, not as a universal constant.

## 6. Decide whether critique and revision help

Ask first what evidence can tell the reviser that an answer is wrong.

1. **Executable check exists:** use it. Code, schema validation, source matching, and tool results provide feedback that can be verified outside the generator.
2. **A clear human rubric exists:** test a separate judge or critic against human-labeled cases. Give specific feedback that identifies the error and the desired repair.
3. **No independent signal exists:** improve the task context or output contract before adding a self-critique loop. Repeating a judgment with the same model and same information can preserve the same blind spot.

When a loop is justified, make the stopping rule explicit: verifier passed, score reached a threshold, improvement stagnated, or a small maximum iteration count was reached. [Loops](/engineering/loops/) support `threshold`, `stagnation`, `last`, and `best`. Include a case where revision makes the answer worse, then verify that selection retains the best result. Anthropic describes evaluator-optimizer loops as useful when feedback can demonstrably improve the response; the criterion should be tested for your task.

## 7. Check context sufficiency

For each inference, ask: *Could a careful reader make this decision using only the bound inputs and prompt?* The model needs the decision variables, rules, boundary examples, and output meaning. It does not need every upstream field or a long archive of related text.

| Observed failure | Likely cause | Next experiment |
| --- | --- | --- |
| The required fact is absent | Insufficient input or retrieval | Add the specific field or source and rerun failed cases |
| The fact is present but ignored | Prompt, model, or distractors | Shorten context, move relevant evidence, compare models |
| Similar irrelevant documents change the answer | Retrieval precision problem | Filter or rank retrieved material |
| A downstream field is never used | Context bloat | Remove it and compare quality and cost |

Preview the rendered [prompt](/engineering/prompts/) with representative cases. Add context one field at a time and rerun the same dataset. [Anthropic's context engineering guide](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) explains the high-signal context principle.

## 8. Build evidence by failure mode

Keep four useful groups of cases: normal production-like inputs, adversarial inputs, edge cases, and replays of actual failures. Add one case when a new failure is found. Coverage of decision boundaries matters more than an arbitrary case count.

| Node archetype | Primary evidence |
| --- | --- |
| Extractor | Field accuracy, missing/ambiguous values, and source support |
| Classifier/router | Per-class errors, ambiguous labels, unknown input, and route outcome |
| Generator | Domain rubric, factual support, and task-specific invariants |
| Code/tool | Unit tests, API error paths, and effect behavior |
| Judge | Agreement with human-labeled borderline cases and bias checks |
| Whole flow | Final task success, cost, latency, and recovery behavior |

Use deterministic checks before an LLM judge when a property is mechanically decidable. For answers with no single exact wording, test invariants: a paraphrase should preserve the decision; adding irrelevant text should not change a classification; an unsupported claim should be rejected. Keep judge calibration separate from generator evaluation. [Datasets](/engineering/datasets/) covers case structure; [Testing and evaluation](/engineering/testing-and-evaluation/) covers scorers and release gates.

## 9. Review failure patterns

| Smell | Evidence | Repair |
| --- | --- | --- |
| One prompt does extraction, routing, writing, and approval | Errors are hard to localize | Split at a verifiable or ownership boundary |
| Many LLM calls with no checks | End-to-end success falls and traces are long | Merge similar work or add a check and recovery |
| Fan-out always returns similar wrong answers | Shared bias | Fix inputs, prompt, or model |
| Critic repeats the generator's opinion | No independent evidence | Add an external check or remove the loop |
| Loop relies only on an iteration limit | Quality may drift before the limit | Add threshold, stagnation, or verifier stop |
| Large prompt contains unused data | Distractors and cost rise | Bind only the needed fields |
| Too many overlapping tools | Wrong tool choice | Narrow descriptions and available tool set |
| Schema is valid but answer is wrong | Structural checks only | Add semantic cases and scorers |
| Node-level scores look good but user outcome fails | Compounding or bad handoff | Add whole-flow cases and inspect the trace |

## 10. Run the design review

Before implementation, record: outcome, input/output types, baseline, node table, data dependencies, context for each model call, tool effects, limits, and cases. After implementation, run `uv run {{CLI_COMMAND}} check .`, inspect prompt previews, run representative cases, and review the recorded trace in [Studio](/studio/runs/). Record the model and prompt revision in a [field note](/engineering/field-notes/) when a provider-specific observation affects the decision.

These are engineering heuristics, not fixed numerical laws. Sample counts, candidate counts, critique rounds, and score thresholds depend on the task and the cost of failure. Use the same cases to compare a simpler and a more complex design; keep the additional structure only when the evidence supports it.
