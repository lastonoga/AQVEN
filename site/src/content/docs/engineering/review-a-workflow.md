---
title: Review a Workflow Design
description: A short review path for engineers and AI coding agents.
---

Before adding a node, ask what observable result it adds. Then read the flow in execution order with one real input and one failure case.

| Question | Good evidence |
| --- | --- |
| Can this step be deterministic? | A Python function can produce the same result from the same input. Use `code`. |
| Does the model have enough context? | Every required fact is bound, and the prompt preview shows it in the request. |
| Is the output usable downstream? | The type names the fields and missing-value behavior the next step expects. |
| Is branching intentional? | A `switch` covers the allowed cases; `parallel` or `map` has a deliberate join/error policy. |
| Can the run stop safely? | Loops are bounded; tool effects and human waits are explicit. |
| How will we know a change helped? | Named dataset cases and scorers match the product goal. |

For example, normalize whitespace in `code`, interpret a document in `llm`, and route on a typed result in `switch`. Each decision can then be inspected. Add a revision loop only after a dataset shows that the extra calls improve the outcome.

For an agent task, provide the goal, sample cases, and this checklist. Ask for a proposed flow and the reason for each node kind before accepting the diff. Then run `{{CLI_COMMAND}} check` and review the trace in [Studio](/studio/runs/). [Designing workflows](/engineering/designing-workflows/) gives the construction order.
