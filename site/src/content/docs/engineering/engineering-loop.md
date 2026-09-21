---
title: Engineer the Whole System
description: Define, inspect, change, and verify AI behavior as one project.
---

An AI application can execute successfully and still give a plausible but wrong answer. The engineer's problem is to identify which part of the system caused it, what change might help, and whether that change improved the product. AQVEN keeps the relevant contracts together as a project: inputs, flows, nodes, inferences, prompts, agents, providers, tools, types, datasets, and evaluations.

## What is the system?

Read the project from its declared contracts, not from an isolated model trace:

```text
Project and provider policy
  → flow input type and context
  → nodes, bindings, branches, and tool effects
  → inference prompts, agents, and output types
  → flow output type
  → datasets, scorers, and recorded runs
```

The source lives in project files. `{{CLI_COMMAND}} check` validates implemented structural rules and references; `{{CLI_COMMAND}} tree` and `{{CLI_COMMAND}} refs` show structure and usages. A [Studio](/studio/) run shows what happened at runtime. The specification explains what the run was meant to do; the trace shows what this particular execution did. [Architecture](/engineering/architecture/) explains how AQVEN, Pydantic AI, and DBOS divide execution work.

## Before a change: identify the contract

| Question | Where to look |
| --- | --- |
| What may enter and leave the flow? | `flow.yaml` or `flow.py`, input and output types |
| Which model sees which facts? | Node `in` bindings, inference inputs, prompt preview, agent model |
| Which external actions can occur? | Tools, effects, approvals, human nodes |
| What can fail or retry? | Node limits, output mode, loop and map policies, run records |
| What counts as correct? | Dataset cases, expected behavior, evaluation scorers and gate |

Start with one real case and follow its bindings through the graph. If the current behavior is “almost right,” locate the first point where an actual node result diverges from the intended contract. A wrong final answer may be caused by missing input context, a bad retrieval result, a weak schema, an agent route, a selection policy, or a downstream merge.

## During a change: make the impact visible

| Change | Likely affected surface | Evidence to collect |
| --- | --- | --- |
| Prompt wording or examples | One inference's behavior | Prompt preview and the inference's dataset cases |
| Agent model or provider | Quality, output mode, latency, cost, data route | Model check and baseline comparison |
| Input or output type | Callers, bindings, generated Python model | `generate`, `check`, and representative runs |
| Flow branch or join policy | Which nodes execute and which result wins | Cases for each branch and error outcome |
| Tool contract or approval | Effects, permissions, wait behavior | Tool tests and a reviewed Studio trace |
| Dataset or scorer | What “improvement” means | Review case coverage and scorer calibration |

One changed field can alter behavior in more than one place. For example, adding a new enum value changes the model's allowed answer, every exhaustive `switch`, and the cases needed to measure the new route. A passing structural check does not prove that the model chooses the new value correctly.

## After a change: close the loop

```text
Define → Check → Run → Inspect → Evaluate → Diagnose → Change → Re-run
```

1. Run `{{CLI_COMMAND}} check .` to catch invalid source and broken references.
2. Preview prompts affected by an inference or binding change.
3. Run the representative [dataset](/engineering/datasets/), including known failures and boundary cases.
4. Inspect the [Studio run](/studio/runs/) to find the first unexpected node output, tool call, or branch.
5. Run the relevant [evaluation](/engineering/testing-and-evaluation/) and compare with a baseline where available.
6. Record what changed, why, the case evidence, and any remaining uncertainty.

This loop makes the project useful to a coding agent as well as a human. Give the agent the source contract, relevant cases, budget, and allowed effects; ask it to justify each changed node and report evidence. [AI coding agents](/engineering/ai-coding-agents/) gives a concrete project instruction template.

## Avoid false confidence

- A valid schema establishes structure, not factual accuracy.
- A trace explains one run, not the full expected behavior.
- A high aggregate eval score can hide a serious rare-case failure.
- A judge model can be wrong or biased; calibrate it on human-reviewed cases.
- More nodes can increase cost and compound failures; keep the design as simple as the cases permit.
- A stronger model may make an old orchestration pattern unnecessary; periodically compare with a simpler baseline.

The project's value comes from the relationship between these artifacts and the ability to test a change, not from any single prompt, model, trace, or dashboard. For the design decisions behind a new flow, continue to [Design a workflow](/engineering/designing-workflows/) and [Production patterns](/engineering/production-patterns/).
